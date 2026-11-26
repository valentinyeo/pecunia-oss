import { SqliteClient } from "@pecunia/database/sqlite-client";
import type { SqliteClientError } from "@pecunia/database/sqlite-client";
import { Clock, Effect, Layer, Match, Option, Predicate, Schema } from "effect";

import { BankLineStoreError } from "./bank-line-store-error.js";
import {
  AmountSchema,
  BankLineIdSchema,
  CategoryIdSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  DirectionSchema,
  MinorUnitsSchema,
  NoteTextSchema,
  ProfileIdSchema,
  ProviderAccountIdSchema,
  ReviewSchema,
  StatusSchema,
  TimestampMillisSchema,
} from "./model.js";
import type { BankLine, BankLineId, LinePatch, ProfileId } from "./model.js";
import { applyLinePatch } from "./patch.js";
import { BankLineStore } from "./store.js";

const CategoryIdRowSchema = Schema.Struct({
  id: CategoryIdSchema,
});

const TransactionRowSchema = Schema.Struct({
  base_currency: CurrencyCodeSchema,
  base_minor: MinorUnitsSchema,
  categorization: Schema.Literals([
    "applied",
    "confirmed",
    "none",
    "suggested",
  ]),
  category_id: Schema.NullOr(CategoryIdSchema),
  direction: DirectionSchema,
  id: BankLineIdSchema,
  note: NoteTextSchema,
  occurred_at: TimestampMillisSchema,
  profile_id: ProfileIdSchema,
  provider_account_id: ProviderAccountIdSchema,
  raw_description: NoteTextSchema,
  raw_merchant: NoteTextSchema,
  raw_reference: NoteTextSchema,
  source_currency: CurrencyCodeSchema,
  source_minor: MinorUnitsSchema,
  status: StatusSchema,
  updated_at: TimestampMillisSchema,
  value_date: DateOnlySchema,
});

type TransactionRow = typeof TransactionRowSchema.Type;

const storeFailed =
  (action: string) =>
  (cause: SqliteClientError): BankLineStoreError =>
    new BankLineStoreError({
      message: `Could not ${action} in the D1 bank-line store: ${cause.message}`,
      repair:
        "Check that the D1 migrations are applied and the database binding is reachable, then retry.",
    });

const toBankLine = (
  row: TransactionRow
): Effect.Effect<BankLine, BankLineStoreError> =>
  Effect.gen(function* decodeLine() {
    const amount = yield* Schema.decodeEffect(AmountSchema)({
      currency: row.source_currency,
      minor: row.source_minor,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new BankLineStoreError({
            message: `Stored source amount on bank line ${row.id} failed validation: ${cause.message}`,
            repair:
              "Inspect the stored transaction row in D1 and fix its currency or minor units.",
          })
      )
    );

    const baseAmount = yield* Schema.decodeEffect(AmountSchema)({
      currency: row.base_currency,
      minor: row.base_minor,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new BankLineStoreError({
            message: `Stored base amount on bank line ${row.id} failed validation: ${cause.message}`,
            repair:
              "Inspect the stored transaction row in D1 and fix its base currency or minor units.",
          })
      )
    );

    return {
      accountId: row.provider_account_id,
      amount,
      baseAmount,
      category: Option.fromNullishOr(row.category_id),
      direction: row.direction,
      id: row.id,
      note: row.note,
      occurredAt: row.occurred_at,
      profileId: row.profile_id,
      raw: {
        description: row.raw_description,
        merchant: row.raw_merchant,
        reference: row.raw_reference,
      },
      review:
        row.categorization === "confirmed"
          ? ReviewSchema.cases.Reviewed.make({ at: row.updated_at })
          : ReviewSchema.cases.Awaiting.make({}),
      status: row.status,
      valueDate: row.value_date,
    };
  });

const SELECT_LINE_COLUMNS =
  "id, profile_id, provider_account_id, status, direction, occurred_at, value_date, source_minor, source_currency, base_minor, base_currency, raw_merchant, raw_reference, raw_description, note, category_id, categorization, updated_at";

export const d1BankLineStoreLayer = Layer.effect(
  BankLineStore,
  Effect.gen(function* makeD1BankLineStore() {
    const client = yield* SqliteClient;

    const categories = Effect.fn("D1BankLineStore.categories")(
      function* categories(profileId: ProfileId) {
        const rows = yield* client
          .query(
            "SELECT id FROM categories WHERE profile_id = ? AND archived_at IS NULL",
            [profileId],
            CategoryIdRowSchema
          )
          .pipe(Effect.mapError(storeFailed("read categories")));

        return rows.map((row) => row.id);
      }
    );

    const lines = Effect.fn("D1BankLineStore.lines")(function* lines(
      profileId: ProfileId
    ) {
      const rows = yield* client
        .query(
          `SELECT ${SELECT_LINE_COLUMNS} FROM transactions WHERE profile_id = ? ORDER BY occurred_at DESC, id DESC`,
          [profileId],
          TransactionRowSchema
        )
        .pipe(Effect.mapError(storeFailed("read bank lines")));

      const decoded: BankLine[] = [];

      for (const row of rows) {
        decoded.push(yield* toBankLine(row));
      }

      return decoded;
    });

    const patch = Effect.fn("D1BankLineStore.patch")(function* patch(
      profileId: ProfileId,
      lineId: BankLineId,
      change: LinePatch
    ) {
      const existingRows = yield* client
        .query(
          `SELECT ${SELECT_LINE_COLUMNS} FROM transactions WHERE profile_id = ? AND id = ?`,
          [profileId, lineId],
          TransactionRowSchema
        )
        .pipe(Effect.mapError(storeFailed("read bank line before patch")));

      const currentRow = existingRows.at(0);

      if (currentRow === undefined) {
        return Option.none<BankLine>();
      }

      const current = yield* toBankLine(currentRow);
      const next = applyLinePatch(current, change);
      const nextCategoryId = Option.getOrNull(next.category);
      const nowMillis = yield* Clock.currentTimeMillis;

      const updatedAt = Match.value(next.review).pipe(
        Match.tag("Awaiting", () => nowMillis),
        Match.tag("Reviewed", ({ at }) => at),
        Match.exhaustive
      );

      const categoryChanged = !Predicate.isTagged(change.category, "Unchanged");
      const reviewMarked = Predicate.isTagged(change.review, "Mark");

      const nextCategorization = (() => {
        if (nextCategoryId === null) {
          return "none" as const;
        }

        return categoryChanged || reviewMarked
          ? ("confirmed" as const)
          : currentRow.categorization;
      })();

      const clearsProvenance =
        nextCategorization === "none" || nextCategorization === "confirmed";

      yield* clearsProvenance
        ? client
            .execute(
              "UPDATE transactions SET category_id = ?, categorization = ?, applied_rule_id = NULL, suggestion_model = NULL, suggested_at = NULL, note = ?, updated_at = ? WHERE profile_id = ? AND id = ?",
              [
                nextCategoryId,
                nextCategorization,
                next.note,
                updatedAt,
                profileId,
                lineId,
              ]
            )
            .pipe(Effect.mapError(storeFailed("update bank line")))
        : client
            .execute(
              "UPDATE transactions SET note = ?, updated_at = ? WHERE profile_id = ? AND id = ?",
              [next.note, updatedAt, profileId, lineId]
            )
            .pipe(Effect.mapError(storeFailed("update bank line note")));

      return Option.some(next);
    });

    return BankLineStore.of({ categories, lines, patch });
  })
);
