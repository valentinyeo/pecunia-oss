import { SqliteClient } from "@pecunia/database/sqlite-client";
import type { SqliteClientError } from "@pecunia/database/sqlite-client";
import { Clock, Effect, Layer, Match, Option, Schema } from "effect";

import {
  CategoryIdSchema,
  ConfidenceSchema,
  CountSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  DirectionSchema,
  FrequencySchema,
  MinorUnitsSchema,
  PayeeIdSchema,
  PayeeNameSchema,
  PaymentSchema,
  ProfileIdSchema,
  SubscriptionIdSchema,
  TimestampMillisSchema,
} from "./model.js";
import type {
  Charge,
  Payee,
  ProfileId,
  StatusChange,
  StatusTag,
  Subscription,
  SubscriptionCategoryChange,
  SubscriptionEntry,
  SubscriptionId,
  TimestampMillis,
} from "./model.js";
import { applyCategoryChange } from "./patch.js";
import {
  applyStatusChange,
  confirmSubscription,
  statusWith,
} from "./status.js";
import { SubscriptionStore } from "./store.js";
import type { RepeatMark } from "./store.js";
import { SubscriptionStoreError } from "./subscription-store-error.js";

const StoredStatusSchema = Schema.Literals([
  "cancelled",
  "confirmed",
  "detected",
  "dismissed",
  "not_recurring",
]);

type StoredStatus = typeof StoredStatusSchema.Type;

const BaseCurrencyRowSchema = Schema.Struct({
  base_currency: CurrencyCodeSchema,
});

const CategoryIdRowSchema = Schema.Struct({
  id: CategoryIdSchema,
});

const PayeeRowSchema = Schema.Struct({
  id: PayeeIdSchema,
  name: PayeeNameSchema,
  profile_id: ProfileIdSchema,
});

const ChargeRowSchema = Schema.Struct({
  base_currency: CurrencyCodeSchema,
  base_minor: MinorUnitsSchema,
  category_id: Schema.NullOr(CategoryIdSchema),
  direction: DirectionSchema,
  payee_id: PayeeIdSchema,
  profile_id: ProfileIdSchema,
  source_currency: CurrencyCodeSchema,
  source_minor: MinorUnitsSchema,
  value_date: DateOnlySchema,
});

const SubscriptionRowSchema = Schema.Struct({
  base_currency: CurrencyCodeSchema,
  category_id: Schema.NullOr(CategoryIdSchema),
  confidence: ConfidenceSchema,
  frequency: FrequencySchema,
  id: SubscriptionIdSchema,
  last_charged_on: DateOnlySchema,
  next_expected_on: DateOnlySchema,
  occurrence_count: CountSchema,
  payee_id: PayeeIdSchema,
  payee_name: PayeeNameSchema,
  profile_id: ProfileIdSchema,
  status: StoredStatusSchema,
  status_changed_at: TimestampMillisSchema,
  typical_base_minor: MinorUnitsSchema,
  typical_currency: CurrencyCodeSchema,
  typical_minor: MinorUnitsSchema,
});

type SubscriptionRow = typeof SubscriptionRowSchema.Type;

const toStatusTag = (stored: StoredStatus): StatusTag =>
  Match.value(stored).pipe(
    Match.when("cancelled", () => "Cancelled" as const),
    Match.when("confirmed", () => "Confirmed" as const),
    Match.when("detected", () => "Detected" as const),
    Match.when("dismissed", () => "Dismissed" as const),
    Match.when("not_recurring", () => "NotRecurring" as const),
    Match.exhaustive
  );

const toStoredStatus = (tag: StatusTag): StoredStatus =>
  Match.value(tag).pipe(
    Match.when("Cancelled", () => "cancelled" as const),
    Match.when("Confirmed", () => "confirmed" as const),
    Match.when("Detected", () => "detected" as const),
    Match.when("Dismissed", () => "dismissed" as const),
    Match.when("NotRecurring", () => "not_recurring" as const),
    Match.exhaustive
  );

const storeFailed =
  (action: string) =>
  (cause: SqliteClientError): SubscriptionStoreError =>
    new SubscriptionStoreError({
      message: `Could not ${action} in the D1 subscription store: ${cause.message}`,
      repair:
        "Check that the D1 migrations are applied and the database binding is reachable, then retry.",
    });

const decodePayment = (
  currency: typeof CurrencyCodeSchema.Type,
  minor: typeof MinorUnitsSchema.Type,
  context: string
) =>
  Schema.decodeEffect(PaymentSchema)({ currency, minor }).pipe(
    Effect.mapError(
      (cause) =>
        new SubscriptionStoreError({
          message: `Stored payment amount for ${context} failed validation: ${cause.message}`,
          repair:
            "Inspect the stored row in D1 and fix its currency or minor units.",
        })
    )
  );

const toEntry = (
  row: SubscriptionRow
): Effect.Effect<SubscriptionEntry, SubscriptionStoreError> =>
  Effect.gen(function* decodeEntry() {
    const amount = yield* decodePayment(
      row.typical_currency,
      row.typical_minor,
      `subscription ${row.id}`
    );

    const baseAmount = yield* decodePayment(
      row.base_currency,
      row.typical_base_minor,
      `subscription ${row.id} base amount`
    );

    const subscription: Subscription = {
      amount,
      baseAmount,
      categoryId: Option.fromNullishOr(row.category_id),
      confidence: row.confidence,
      frequency: row.frequency,
      id: row.id,
      lastChargedOn: row.last_charged_on,
      nextExpectedOn: row.next_expected_on,
      occurrenceCount: row.occurrence_count,
      payeeId: row.payee_id,
      profileId: row.profile_id,
      status: statusWith(toStatusTag(row.status), row.status_changed_at),
    };

    return { payeeName: row.payee_name, subscription };
  });

const SELECT_SUBSCRIPTION_COLUMNS =
  "s.id, s.profile_id, s.payee_id, p.name AS payee_name, s.frequency, s.typical_minor, s.typical_currency, s.typical_base_minor, s.base_currency, s.confidence, s.status, s.status_changed_at, s.last_charged_on, s.next_expected_on, s.occurrence_count, s.category_id";

const subscriptionIdFrom = (
  millis: number,
  payeeId: string
): Effect.Effect<SubscriptionId> =>
  Schema.decodeEffect(SubscriptionIdSchema)(
    `sub-${millis.toString(36)}-${payeeId.slice(0, 12)}`
  ).pipe(Effect.orDie);

export const d1SubscriptionStoreLayer = Layer.effect(
  SubscriptionStore,
  Effect.gen(function* makeD1SubscriptionStore() {
    const client = yield* SqliteClient;

    const baseCurrency = Effect.fn("D1SubscriptionStore.baseCurrency")(
      function* baseCurrency(profileId: ProfileId) {
        const rows = yield* client
          .query(
            "SELECT base_currency FROM profiles WHERE id = ? AND archived_at IS NULL",
            [profileId],
            BaseCurrencyRowSchema
          )
          .pipe(Effect.mapError(storeFailed("read profile base currency")));

        const first = rows.at(0);

        if (first === undefined) {
          return yield* new SubscriptionStoreError({
            message: `Profile ${profileId} is not in the D1 profiles table, so it has no base currency.`,
            repair:
              "Create the profile with its base currency, then read the repeat payments again.",
          });
        }

        return first.base_currency;
      }
    );

    const categories = Effect.fn("D1SubscriptionStore.categories")(
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

    const payees = Effect.fn("D1SubscriptionStore.payees")(function* payees(
      profileId: ProfileId
    ) {
      const rows = yield* client
        .query(
          "SELECT id, profile_id, name FROM payees WHERE profile_id = ? AND archived_at IS NULL",
          [profileId],
          PayeeRowSchema
        )
        .pipe(Effect.mapError(storeFailed("read payees")));

      const decoded: Payee[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        profileId: row.profile_id,
      }));

      return decoded;
    });

    const charges = Effect.fn("D1SubscriptionStore.charges")(function* charges(
      profileId: ProfileId
    ) {
      const rows = yield* client
        .query(
          "SELECT profile_id, payee_id, direction, value_date, source_minor, source_currency, base_minor, base_currency, category_id FROM transactions WHERE profile_id = ? AND payee_id IS NOT NULL AND status = 'posted'",
          [profileId],
          ChargeRowSchema
        )
        .pipe(Effect.mapError(storeFailed("read posted charges")));

      const decoded: Charge[] = [];

      for (const row of rows) {
        const amount = yield* decodePayment(
          row.source_currency,
          row.source_minor,
          `charge for payee ${row.payee_id}`
        );

        const baseAmount = yield* decodePayment(
          row.base_currency,
          row.base_minor,
          `base charge for payee ${row.payee_id}`
        );

        decoded.push({
          amount,
          baseAmount,
          categoryId: Option.fromNullishOr(row.category_id),
          direction: row.direction,
          on: row.value_date,
          payeeId: row.payee_id,
          profileId: row.profile_id,
        });
      }

      return decoded;
    });

    const entries = Effect.fn("D1SubscriptionStore.entries")(function* entries(
      profileId: ProfileId
    ) {
      const rows = yield* client
        .query(
          `SELECT ${SELECT_SUBSCRIPTION_COLUMNS} FROM subscriptions s INNER JOIN payees p ON p.profile_id = s.profile_id AND p.id = s.payee_id WHERE s.profile_id = ? ORDER BY s.id ASC`,
          [profileId],
          SubscriptionRowSchema
        )
        .pipe(Effect.mapError(storeFailed("read repeat payments")));

      const decoded: SubscriptionEntry[] = [];

      for (const row of rows) {
        decoded.push(yield* toEntry(row));
      }

      return decoded;
    });

    const entryById = (
      profileId: ProfileId,
      subscriptionId: SubscriptionId
    ): Effect.Effect<
      Option.Option<SubscriptionEntry>,
      SubscriptionStoreError
    > =>
      client
        .query(
          `SELECT ${SELECT_SUBSCRIPTION_COLUMNS} FROM subscriptions s INNER JOIN payees p ON p.profile_id = s.profile_id AND p.id = s.payee_id WHERE s.profile_id = ? AND s.id = ?`,
          [profileId, subscriptionId],
          SubscriptionRowSchema
        )
        .pipe(
          Effect.mapError(storeFailed("read repeat payment")),
          Effect.flatMap((rows) => {
            const first = rows.at(0);

            return first === undefined
              ? Effect.succeed(Option.none<SubscriptionEntry>())
              : Effect.asSome(toEntry(first));
          })
        );

    const mark = Effect.fn("D1SubscriptionStore.mark")(function* mark(
      profileId: ProfileId,
      requested: RepeatMark
    ) {
      const existingRows = yield* client
        .query(
          `SELECT ${SELECT_SUBSCRIPTION_COLUMNS} FROM subscriptions s INNER JOIN payees p ON p.profile_id = s.profile_id AND p.id = s.payee_id WHERE s.profile_id = ? AND s.payee_id = ?`,
          [profileId, requested.payeeId],
          SubscriptionRowSchema
        )
        .pipe(Effect.mapError(storeFailed("check existing repeat payment")));

      const now = yield* Clock.currentTimeMillis;
      const existingRow = existingRows.at(0);

      if (existingRow !== undefined) {
        const existing = yield* toEntry(existingRow);

        const confirmed = confirmSubscription(
          existing.subscription.frequency === requested.frequency
            ? existing.subscription
            : {
                ...existing.subscription,
                frequency: requested.frequency,
                nextExpectedOn: requested.nextExpectedOn,
              },
          requested.status.at
        );

        yield* client
          .execute(
            "UPDATE subscriptions SET frequency = ?, next_expected_on = ?, status = ?, status_changed_at = ?, updated_at = ? WHERE profile_id = ? AND id = ?",
            [
              confirmed.frequency,
              confirmed.nextExpectedOn,
              toStoredStatus(confirmed.status._tag),
              confirmed.status.at,
              now,
              profileId,
              confirmed.id,
            ]
          )
          .pipe(Effect.mapError(storeFailed("confirm repeat payment")));

        return { payeeName: existing.payeeName, subscription: confirmed };
      }

      const id = yield* subscriptionIdFrom(now, requested.payeeId);

      yield* client
        .execute(
          "INSERT INTO subscriptions (id, profile_id, payee_id, frequency, typical_minor, typical_currency, typical_base_minor, base_currency, confidence, status, status_changed_at, last_charged_on, next_expected_on, occurrence_count, amount_cv, category_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, '', ?, ?)",
          [
            id,
            profileId,
            requested.payeeId,
            requested.frequency,
            requested.amount.minor,
            requested.amount.currency,
            requested.baseAmount.minor,
            requested.baseAmount.currency,
            requested.confidence,
            toStoredStatus(requested.status._tag),
            requested.status.at,
            requested.lastChargedOn,
            requested.nextExpectedOn,
            requested.occurrenceCount,
            now,
            now,
          ]
        )
        .pipe(Effect.mapError(storeFailed("insert repeat payment")));

      const created = yield* entryById(profileId, id);

      return yield* Effect.fromOption(
        created,
        () =>
          new SubscriptionStoreError({
            message: `Repeat payment ${id} could not be read back after insert.`,
            repair: "Verify that the payee exists in this profile and retry.",
          })
      );
    });

    const patchStatus = Effect.fn("D1SubscriptionStore.patchStatus")(
      function* patchStatus(
        profileId: ProfileId,
        subscriptionId: SubscriptionId,
        change: StatusChange,
        at: TimestampMillis
      ) {
        const found = yield* entryById(profileId, subscriptionId);

        if (Option.isNone(found)) {
          return Option.none<SubscriptionEntry>();
        }

        const next = yield* Effect.fromResult(
          applyStatusChange(found.value.subscription, change, at)
        );

        const now = yield* Clock.currentTimeMillis;

        yield* client
          .execute(
            "UPDATE subscriptions SET status = ?, status_changed_at = ?, updated_at = ? WHERE profile_id = ? AND id = ?",
            [
              toStoredStatus(next.status._tag),
              next.status.at,
              now,
              profileId,
              subscriptionId,
            ]
          )
          .pipe(Effect.mapError(storeFailed("update repeat payment status")));

        return Option.some({
          payeeName: found.value.payeeName,
          subscription: next,
        });
      }
    );

    const categorise = Effect.fn("D1SubscriptionStore.categorise")(
      function* categorise(
        profileId: ProfileId,
        subscriptionId: SubscriptionId,
        change: SubscriptionCategoryChange
      ) {
        const found = yield* entryById(profileId, subscriptionId);

        if (Option.isNone(found)) {
          return Option.none<SubscriptionEntry>();
        }

        const next = applyCategoryChange(found.value.subscription, change);
        const categoryId = Option.getOrNull(next.categoryId);
        const now = yield* Clock.currentTimeMillis;

        const txStatement =
          categoryId === null
            ? {
                params: [now, profileId, found.value.subscription.payeeId],
                sql: "UPDATE transactions SET category_id = NULL, categorization = 'none', applied_rule_id = NULL, suggestion_model = NULL, suggested_at = NULL, updated_at = ? WHERE profile_id = ? AND payee_id = ?",
              }
            : {
                params: [
                  categoryId,
                  now,
                  profileId,
                  found.value.subscription.payeeId,
                ],
                sql: "UPDATE transactions SET category_id = ?, categorization = 'confirmed', applied_rule_id = NULL, suggestion_model = NULL, suggested_at = NULL, updated_at = ? WHERE profile_id = ? AND payee_id = ?",
              };

        yield* client
          .batch([
            {
              params: [categoryId, now, profileId, subscriptionId],
              sql: "UPDATE subscriptions SET category_id = ?, updated_at = ? WHERE profile_id = ? AND id = ?",
            },
            txStatement,
          ])
          .pipe(Effect.mapError(storeFailed("categorise repeat payment")));

        return Option.some({
          payeeName: found.value.payeeName,
          subscription: next,
        });
      }
    );

    return SubscriptionStore.of({
      baseCurrency,
      categorise,
      categories,
      charges,
      entries,
      mark,
      patchStatus,
      payees,
    });
  })
);
