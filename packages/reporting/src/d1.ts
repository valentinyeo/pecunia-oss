// oxlint-disable anti-slop-effect/no-manual-tagged-construction -- D1 rows are assembled as encoded wire objects and validated through the core model codecs
import type {
  Category,
  Payee,
  Rate,
  TaxObligation,
  Transaction,
} from "@pecunia/core/model";
import { codecs } from "@pecunia/core/model";
import { SqliteClient } from "@pecunia/database/sqlite-client";
import type { SqliteClientError } from "@pecunia/database/sqlite-client";
import {
  Clock,
  DateTime,
  Effect,
  Layer,
  Option,
  pipe,
  Result,
  Schema,
} from "effect";

import { ReportSourceError } from "./errors.js";
import type {
  AccountBalance,
  CurrencyCode,
  DateOnly,
  ProfileId,
} from "./model.js";
import {
  AccountBalanceSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
} from "./model.js";
import { ReportSource } from "./source.js";

const ProfileCurrencyRowSchema = Schema.Struct({
  base_currency: CurrencyCodeSchema,
});

const CategoryRowSchema = Schema.Struct({
  archived_at: Schema.NullOr(Schema.Int),
  color: Schema.String,
  id: Schema.String,
  name: Schema.String,
  parent_id: Schema.NullOr(Schema.String),
  profile_id: Schema.String,
  spending_type: Schema.String,
});

const PayeeRowSchema = Schema.Struct({
  archived_at: Schema.NullOr(Schema.Int),
  default_category_id: Schema.NullOr(Schema.String),
  id: Schema.String,
  kind: Schema.String,
  name: Schema.String,
  profile_id: Schema.String,
});

const AccountBalanceRowSchema = Schema.Struct({
  balance_minor: Schema.Int,
  base_currency: CurrencyCodeSchema,
  id: Schema.String,
  kind: Schema.String,
  label: Schema.String,
});

const ObligationRowSchema = Schema.Struct({
  amount_currency: Schema.String,
  amount_minor: Schema.Int,
  books_status: Schema.String,
  due_on: Schema.String,
  id: Schema.String,
  kind: Schema.String,
  label: Schema.String,
  period_ends_on: Schema.String,
  profile_id: Schema.String,
  settled_occurred_at: Schema.NullOr(Schema.Int),
  settled_transaction_id: Schema.NullOr(Schema.String),
  status: Schema.String,
  synced_at: Schema.Int,
  tax_profile_id: Schema.String,
  write_off_reason: Schema.NullOr(Schema.String),
});

const TransactionRowSchema = Schema.Struct({
  applied_rule_id: Schema.NullOr(Schema.String),
  base_currency: Schema.String,
  base_minor: Schema.Int,
  categorization: Schema.String,
  category_id: Schema.NullOr(Schema.String),
  classification: Schema.String,
  classification_rule_id: Schema.NullOr(Schema.String),
  client_payee_id: Schema.NullOr(Schema.String),
  counterpart_profile_id: Schema.NullOr(Schema.String),
  created_at: Schema.Int,
  direction: Schema.String,
  external_id: Schema.String,
  fee_currency: Schema.NullOr(Schema.String),
  fee_minor: Schema.NullOr(Schema.Int),
  id: Schema.String,
  note: Schema.String,
  occurred_at: Schema.Int,
  payee_id: Schema.NullOr(Schema.String),
  profile_id: Schema.String,
  provider_account_id: Schema.String,
  rate: Schema.NullOr(Schema.Finite),
  rate_as_of: Schema.NullOr(Schema.String),
  raw_description: Schema.String,
  raw_merchant: Schema.String,
  raw_reference: Schema.String,
  rule_obligation_kind: Schema.NullOr(Schema.String),
  source_currency: Schema.String,
  source_minor: Schema.Int,
  status: Schema.String,
  suggested_at: Schema.NullOr(Schema.Int),
  suggestion_model: Schema.NullOr(Schema.String),
  updated_at: Schema.Int,
  value_date: Schema.String,
});

const ExchangeRateRowSchema = Schema.Struct({
  base_currency: Schema.String,
  quote_currency: Schema.String,
  rate: Schema.Finite,
});

type ObligationRow = typeof ObligationRowSchema.Type;

type TransactionRow = typeof TransactionRowSchema.Type;

const sourceFailed =
  (action: string) =>
  (cause: SqliteClientError): ReportSourceError =>
    new ReportSourceError({
      message: `Could not ${action} from the D1 report source: ${cause.message}`,
      repair:
        "Check that the D1 migrations are applied and the database binding is reachable, then retry.",
    });

const decodeFailed =
  (label: string) =>
  (cause: Schema.SchemaError): ReportSourceError =>
    new ReportSourceError({
      message: `Stored ${label} row failed domain validation: ${cause.message}`,
      repair:
        "Inspect the stored row in D1 and repair any malformed amount, date, or status fields.",
    });

const isoOf = (millis: number): string =>
  DateTime.formatIso(DateTime.makeUnsafe(millis));

const utcDateOf = (millis: number): string => isoOf(millis).slice(0, 10);

const rateKey = (from: string, to: string): string => `${from}->${to}`;

const decodeRate = (value: number): Option.Option<Rate> => {
  if (!Number.isFinite(value) || value <= 0) {
    return Option.none();
  }

  const fixed = value.toFixed(8).replace(/0+$/u, "").replace(/\.$/u, "");
  const decoded = codecs.rate.decode(fixed);

  return Result.isSuccess(decoded)
    ? Option.some(decoded.success)
    : Option.none();
};

const categorizationWireOf = (row: TransactionRow) => {
  if (row.categorization === "applied") {
    return {
      _tag: "Applied" as const,
      at: isoOf(row.updated_at),
      categoryId: row.category_id,
      ruleId: row.applied_rule_id,
    };
  }

  if (row.categorization === "confirmed") {
    return {
      _tag: "Confirmed" as const,
      at: isoOf(row.updated_at),
      categoryId: row.category_id,
    };
  }

  if (row.categorization === "suggested") {
    return {
      _tag: "Suggested" as const,
      at: isoOf(row.suggested_at ?? row.updated_at),
      categoryId: row.category_id,
      model: row.suggestion_model,
    };
  }

  return { _tag: "None" as const };
};

const classificationWireOf = (row: TransactionRow) => {
  if (row.classification === "excluded") {
    return {
      _tag: "Excluded" as const,
      ruleId: row.classification_rule_id,
    };
  }

  if (row.classification === "income") {
    return {
      _tag: "Income" as const,
      clientPayeeId: row.client_payee_id,
      ruleId: row.classification_rule_id,
    };
  }

  if (row.classification === "internal_transfer") {
    return {
      _tag: "InternalTransfer" as const,
      ruleId: row.classification_rule_id,
    };
  }

  if (row.classification === "refund") {
    return {
      _tag: "Refund" as const,
      ofPayeeId: row.payee_id,
      ruleId: row.classification_rule_id,
    };
  }

  if (row.classification === "self_transfer") {
    return {
      _tag: "SelfTransfer" as const,
      counterpartProfileId: row.counterpart_profile_id,
      ruleId: row.classification_rule_id,
    };
  }

  if (row.classification === "tax_payment") {
    return {
      _tag: "TaxPayment" as const,
      obligationKind: row.rule_obligation_kind ?? "tax",
      ruleId: row.classification_rule_id,
    };
  }

  return { _tag: "None" as const };
};

const obligationStatusWireOf = (row: ObligationRow) => {
  if (row.status === "paid") {
    return {
      _tag: "Paid" as const,
      at: isoOf(row.settled_occurred_at ?? row.synced_at),
      settledBy: row.settled_transaction_id,
    };
  }

  if (row.status === "written_off") {
    return {
      _tag: "WrittenOff" as const,
      reason: row.write_off_reason,
    };
  }

  return {
    _tag: "Estimated" as const,
    booksStatus: row.books_status,
  };
};

export interface D1ReportSourceOptions {
  readonly today?: DateOnly;
}

const todayOf =
  (
    options: D1ReportSourceOptions
  ): (() => Effect.Effect<DateOnly, ReportSourceError>) =>
  () =>
    options.today === undefined
      ? Clock.currentTimeMillis.pipe(
          Effect.flatMap((millis) =>
            Schema.decodeEffect(DateOnlySchema)(utcDateOf(millis)).pipe(
              Effect.mapError(decodeFailed("clock date"))
            )
          )
        )
      : Effect.succeed(options.today);

export const d1ReportSourceLayer = (
  options: D1ReportSourceOptions = {}
): Layer.Layer<ReportSource, never, SqliteClient> =>
  Layer.effect(
    ReportSource,
    Effect.gen(function* makeD1ReportSource() {
      const sqlite = yield* SqliteClient;
      const rateCache = new Map<string, Rate>();

      const refreshRates = sqlite
        .query(
          "SELECT base_currency, quote_currency, rate FROM exchange_rates ORDER BY as_of DESC, fetched_at DESC",
          [],
          ExchangeRateRowSchema
        )
        .pipe(
          Effect.tap((rows) =>
            Effect.sync(() => {
              rateCache.clear();

              for (const row of rows) {
                const directKey = rateKey(
                  row.base_currency,
                  row.quote_currency
                );

                if (!rateCache.has(directKey)) {
                  const direct = decodeRate(row.rate);

                  if (Option.isSome(direct)) {
                    rateCache.set(directKey, direct.value);
                  }
                }

                const inverseKey = rateKey(
                  row.quote_currency,
                  row.base_currency
                );

                if (!rateCache.has(inverseKey) && row.rate > 0) {
                  const inverse = decodeRate(1 / row.rate);

                  if (Option.isSome(inverse)) {
                    rateCache.set(inverseKey, inverse.value);
                  }
                }
              }
            })
          ),
          Effect.asVoid,
          Effect.mapError(sourceFailed("read exchange rates"))
        );

      yield* refreshRates.pipe(Effect.ignore);

      const baseCurrency = (
        profileId: ProfileId
      ): Effect.Effect<CurrencyCode, ReportSourceError> =>
        sqlite
          .query(
            "SELECT base_currency FROM profiles WHERE id = ? LIMIT 1",
            [profileId],
            ProfileCurrencyRowSchema
          )
          .pipe(
            Effect.mapError(sourceFailed("read profile base currency")),
            Effect.flatMap((rows) => {
              const [row] = rows;

              if (row === undefined) {
                return Effect.fail(
                  new ReportSourceError({
                    message: `Profile ${profileId} does not exist in D1.`,
                    repair:
                      "Choose a profile returned by `readSetup`, or create the profile before reading reports.",
                  })
                );
              }

              return Effect.succeed(row.base_currency);
            })
          );

      const accounts = (
        profileId: ProfileId
      ): Effect.Effect<readonly AccountBalance[], ReportSourceError> =>
        Effect.gen(function* loadAccounts() {
          yield* refreshRates;

          const rows = yield* sqlite
            .query(
              `SELECT
                 pa.id,
                 pa.label,
                 pa.kind,
                 p.base_currency,
                 COALESCE(
                   SUM(
                     CASE
                       WHEN t.status = 'posted' AND t.direction = 'in' THEN t.base_minor
                       WHEN t.status = 'posted' AND t.direction = 'out' THEN -t.base_minor
                       ELSE 0
                     END
                   ),
                   0
                 ) AS balance_minor
               FROM provider_accounts pa
               INNER JOIN profiles p ON p.id = pa.profile_id
               LEFT JOIN transactions t
                 ON t.provider_account_id = pa.id AND t.profile_id = pa.profile_id
               WHERE pa.profile_id = ? AND pa.archived_at IS NULL
               GROUP BY pa.id, pa.label, pa.kind, p.base_currency
               ORDER BY pa.label ASC, pa.id ASC`,
              [profileId],
              AccountBalanceRowSchema
            )
            .pipe(Effect.mapError(sourceFailed("read account balances")));

          return yield* pipe(
            rows,
            Effect.forEach((row) =>
              Schema.decodeEffect(AccountBalanceSchema)({
                accountId: row.id,
                balance: {
                  currency: row.base_currency,
                  minor: row.balance_minor,
                },
                kind: row.kind === "investment" ? "brokerage" : "current",
                name: row.label,
              }).pipe(Effect.mapError(decodeFailed(`account ${row.id}`)))
            )
          );
        });

      const categories = (
        profileId: ProfileId
      ): Effect.Effect<readonly Category[], ReportSourceError> =>
        sqlite
          .query(
            "SELECT id, profile_id, name, parent_id, color, spending_type, archived_at FROM categories WHERE profile_id = ? ORDER BY name ASC, id ASC",
            [profileId],
            CategoryRowSchema
          )
          .pipe(
            Effect.mapError(sourceFailed("read categories")),
            Effect.flatMap((rows) =>
              pipe(
                rows,
                Effect.forEach((row) =>
                  Effect.fromResult(
                    codecs.category.decode({
                      archivedAt:
                        row.archived_at === null
                          ? null
                          : isoOf(row.archived_at),
                      color: row.color,
                      id: row.id,
                      name: row.name,
                      parentId: row.parent_id,
                      profileId: row.profile_id,
                      spendingType: row.spending_type,
                    })
                  ).pipe(Effect.mapError(decodeFailed(`category ${row.id}`)))
                )
              )
            )
          );

      const payees = (
        profileId: ProfileId
      ): Effect.Effect<readonly Payee[], ReportSourceError> =>
        sqlite
          .query(
            "SELECT id, profile_id, name, kind, default_category_id, archived_at FROM payees WHERE profile_id = ? ORDER BY name ASC, id ASC",
            [profileId],
            PayeeRowSchema
          )
          .pipe(
            Effect.mapError(sourceFailed("read payees")),
            Effect.flatMap((rows) =>
              pipe(
                rows,
                Effect.forEach((row) =>
                  Effect.fromResult(
                    codecs.payee.decode({
                      archivedAt:
                        row.archived_at === null
                          ? null
                          : isoOf(row.archived_at),
                      defaultCategoryId: row.default_category_id,
                      id: row.id,
                      kind: row.kind,
                      name: row.name,
                      profileId: row.profile_id,
                    })
                  ).pipe(Effect.mapError(decodeFailed(`payee ${row.id}`)))
                )
              )
            )
          );

      const obligations = (
        profileId: ProfileId
      ): Effect.Effect<readonly TaxObligation[], ReportSourceError> =>
        sqlite
          .query(
            `SELECT
               o.id,
               o.profile_id,
               o.tax_profile_id,
               o.kind,
               o.period_ends_on,
               o.due_on,
               o.label,
               o.amount_minor,
               o.amount_currency,
               o.status,
               o.settled_transaction_id,
               o.books_status,
               o.write_off_reason,
               o.synced_at,
               t.occurred_at AS settled_occurred_at
             FROM tax_obligations o
             LEFT JOIN transactions t
               ON t.id = o.settled_transaction_id AND t.profile_id = o.profile_id
             WHERE o.profile_id = ?
             ORDER BY o.due_on ASC, o.id ASC`,
            [profileId],
            ObligationRowSchema
          )
          .pipe(
            Effect.mapError(sourceFailed("read tax obligations")),
            Effect.flatMap((rows) =>
              pipe(
                rows,
                Effect.forEach((row) =>
                  Effect.fromResult(
                    codecs.taxObligation.decode({
                      amount: {
                        currency: row.amount_currency,
                        minor: row.amount_minor,
                      },
                      dueOn: row.due_on,
                      id: row.id,
                      kind: row.kind,
                      label: row.label,
                      periodEndsOn: row.period_ends_on,
                      profileId: row.profile_id,
                      status: obligationStatusWireOf(row),
                      syncedAt: isoOf(row.synced_at),
                      taxProfileId: row.tax_profile_id,
                    })
                  ).pipe(
                    Effect.mapError(decodeFailed(`tax obligation ${row.id}`))
                  )
                )
              )
            )
          );

      const transactions = (
        profileId: ProfileId
      ): Effect.Effect<readonly Transaction[], ReportSourceError> =>
        sqlite
          .query(
            `SELECT
               t.id,
               t.profile_id,
               t.provider_account_id,
               t.external_id,
               t.status,
               t.direction,
               t.occurred_at,
               t.value_date,
               t.source_minor,
               t.source_currency,
               t.fee_minor,
               t.fee_currency,
               t.base_minor,
               t.base_currency,
               t.rate,
               t.rate_as_of,
               t.raw_merchant,
               t.raw_reference,
               t.raw_description,
               t.note,
               t.payee_id,
               t.category_id,
               t.categorization,
               t.suggestion_model,
               t.suggested_at,
               t.applied_rule_id,
               t.classification,
               t.classification_rule_id,
               t.client_payee_id,
               t.counterpart_profile_id,
               t.created_at,
               t.updated_at,
               r.obligation_kind AS rule_obligation_kind
             FROM transactions t
             LEFT JOIN rules r
               ON r.id = t.classification_rule_id AND r.profile_id = t.profile_id
             WHERE t.profile_id = ?
             ORDER BY t.occurred_at DESC, t.id DESC`,
            [profileId],
            TransactionRowSchema
          )
          .pipe(
            Effect.mapError(sourceFailed("read transactions")),
            Effect.flatMap((rows) =>
              pipe(
                rows,
                Effect.forEach((row) =>
                  Effect.fromResult(
                    codecs.transaction.decode({
                      amounts:
                        row.source_currency === row.base_currency
                          ? {
                              _tag: "SameCurrency",
                              amount: {
                                currency: row.source_currency,
                                minor: row.source_minor,
                              },
                            }
                          : {
                              _tag: "Converted",
                              asOf: row.rate_as_of,
                              base: {
                                currency: row.base_currency,
                                minor: row.base_minor,
                              },
                              rate: String(row.rate),
                              source: {
                                currency: row.source_currency,
                                minor: row.source_minor,
                              },
                            },
                      categorization: categorizationWireOf(row),
                      classification: classificationWireOf(row),
                      createdAt: isoOf(row.created_at),
                      direction: row.direction,
                      externalId: row.external_id,
                      fee:
                        row.fee_minor === null || row.fee_currency === null
                          ? null
                          : {
                              currency: row.fee_currency,
                              minor: row.fee_minor,
                            },
                      id: row.id,
                      note: row.note,
                      occurredAt: isoOf(row.occurred_at),
                      payeeId: row.payee_id,
                      profileId: row.profile_id,
                      providerAccountId: row.provider_account_id,
                      raw: {
                        description: row.raw_description,
                        merchant: row.raw_merchant,
                        reference: row.raw_reference,
                      },
                      status: row.status,
                      valueDate: row.value_date,
                    })
                  ).pipe(Effect.mapError(decodeFailed(`transaction ${row.id}`)))
                )
              )
            )
          );

      return {
        accounts,
        baseCurrency,
        categories,
        obligations,
        payees,
        rates: () => (query) =>
          Option.fromNullishOr(rateCache.get(rateKey(query.from, query.to))),
        today: todayOf(options),
        transactions,
      };
    })
  );
