import { UnknownProfile } from "@pecunia/core/settings";
import { SqliteClient } from "@pecunia/database/sqlite-client";
import type { SqliteClientError } from "@pecunia/database/sqlite-client";
import { Clock, DateTime, Effect, Layer, Option, Schema } from "effect";

import { DuplicateHolding } from "./duplicate-holding.js";
import { InvestmentsUnavailable } from "./investments-unavailable.js";
import { MismatchedProfile } from "./mismatched-profile.js";
import {
  CurrencyCodeSchema,
  ExchangeRateSchema,
  HoldingSchema,
  InvestmentPlatformSchema,
} from "./model.js";
import type {
  ExchangeRate,
  Holding,
  HoldingId,
  HoldingPatch,
  InvestmentPlatform,
  ProfileId,
} from "./model.js";
import { applyHoldingPatch } from "./patch.js";
import { ProfileCurrencies } from "./profile-currencies.js";
import { ExchangeRates } from "./rates.js";
import { InvestmentStore } from "./store.js";
import type { UpsertOutcome } from "./store.js";

const isoOfMillis = (millis: number): string =>
  DateTime.formatIso(DateTime.makeUnsafe(millis));

const millisOfIso = (timestamp: string): number =>
  DateTime.toEpochMillis(DateTime.makeUnsafe(timestamp));

const HoldingRowSchema = Schema.Struct({
  asset_type: Schema.String,
  cost_basis_currency: Schema.NullOr(Schema.String),
  cost_basis_minor: Schema.NullOr(Schema.Int),
  currency: Schema.String,
  id: Schema.String,
  last_price_currency: Schema.NullOr(Schema.String),
  last_price_minor: Schema.NullOr(Schema.Int),
  name: Schema.String,
  opened_on: Schema.String,
  platform_id: Schema.String,
  priced_at: Schema.NullOr(Schema.Int),
  profile_id: Schema.String,
  quantity_micros: Schema.Int,
  state: Schema.String,
  symbol: Schema.String,
});

type HoldingRow = typeof HoldingRowSchema.Type;

const PlatformRowSchema = Schema.Struct({
  connector: Schema.String,
  enabled: Schema.Int,
  id: Schema.String,
  label: Schema.String,
});

const ExistingHoldingIdRowSchema = Schema.Struct({
  id: Schema.String,
  opened_on: Schema.String,
});

const ProfileCurrencyRowSchema = Schema.Struct({
  base_currency: CurrencyCodeSchema,
});

const ExchangeRateRowSchema = Schema.Struct({
  as_of: Schema.String,
  base_currency: Schema.String,
  fetched_at: Schema.Int,
  quote_currency: Schema.String,
  rate: Schema.Finite,
});

const unavailable =
  (action: string) =>
  (cause: SqliteClientError | Error): InvestmentsUnavailable =>
    new InvestmentsUnavailable({
      cause,
      message: `Could not ${action} in the D1 investments store: ${cause.message}`,
      operation: action,
      repair:
        "Check that the D1 migrations are applied and the database binding is reachable, then retry.",
    });

const mismatchedProfile = (profileId: ProfileId, holding: Holding) =>
  new MismatchedProfile({
    holdingProfileId: holding.profileId,
    message: `Holding ${holding.symbol} names profile ${holding.profileId} and was written to profile ${profileId}.`,
    profileId,
    repair:
      "Stamp the holding with the profile it is written to before calling the store, or write it to the profile it names.",
  });

const duplicateHolding = (profileId: ProfileId, holding: Holding) =>
  new DuplicateHolding({
    message: `Profile ${profileId} already holds ${holding.symbol} on platform ${holding.platformId}.`,
    platformId: holding.platformId,
    profileId,
    repair:
      "Edit the holding that exists, or pick a symbol the platform does not hold yet.",
    symbol: holding.symbol,
  });

const decodeHoldingRow = (
  row: HoldingRow
): Effect.Effect<Holding, InvestmentsUnavailable> =>
  Schema.decodeUnknownEffect(HoldingSchema)({
    assetType: row.asset_type,
    costBasis:
      row.cost_basis_minor !== null && row.cost_basis_currency !== null
        ? {
            currency: row.cost_basis_currency,
            minor: row.cost_basis_minor,
          }
        : null,
    currency: row.currency,
    id: row.id,
    lastPrice:
      row.last_price_minor !== null && row.last_price_currency !== null
        ? {
            currency: row.last_price_currency,
            minor: row.last_price_minor,
          }
        : null,
    name: row.name,
    openedOn: row.opened_on,
    platformId: row.platform_id,
    pricedAt: row.priced_at === null ? null : isoOfMillis(row.priced_at),
    profileId: row.profile_id,
    quantity: row.quantity_micros,
    state: row.state,
    symbol: row.symbol,
  }).pipe(Effect.mapError(unavailable(`decode holding ${row.id}`)));

const formatRateText = (rate: number): string =>
  rate
    .toFixed(12)
    .replace(/\.?0+$/u, "")
    .replace(/^\./u, "0.");

const SELECT_HOLDING_COLUMNS =
  "id, profile_id, platform_id, symbol, name, asset_type, quantity_micros, cost_basis_minor, cost_basis_currency, currency, state, opened_on, last_price_minor, last_price_currency, priced_at";

export const d1InvestmentStoreLayer = Layer.effect(
  InvestmentStore,
  Effect.gen(function* makeD1InvestmentStore() {
    const client = yield* SqliteClient;

    const holdings = Effect.fn("D1InvestmentStore.holdings")(function* holdings(
      profileId: ProfileId
    ) {
      const rows = yield* client
        .query(
          `SELECT ${SELECT_HOLDING_COLUMNS} FROM holdings WHERE profile_id = ? ORDER BY platform_id ASC, symbol ASC`,
          [profileId],
          HoldingRowSchema
        )
        .pipe(Effect.mapError(unavailable("read holdings")));

      const decoded: Holding[] = [];

      for (const row of rows) {
        decoded.push(yield* decodeHoldingRow(row));
      }

      return decoded;
    });

    const platforms = Effect.fn("D1InvestmentStore.platforms")(
      function* platforms() {
        const rows = yield* client
          .query(
            "SELECT id, label, connector, enabled FROM investment_platforms ORDER BY id ASC",
            [],
            PlatformRowSchema
          )
          .pipe(Effect.mapError(unavailable("read investment platforms")));

        const decoded: InvestmentPlatform[] = [];

        for (const row of rows) {
          decoded.push(
            yield* Schema.decodeUnknownEffect(InvestmentPlatformSchema)({
              connector: row.connector,
              enabled: row.enabled === 1,
              id: row.id,
              label: row.label,
            }).pipe(Effect.mapError(unavailable(`decode platform ${row.id}`)))
          );
        }

        return decoded;
      }
    );

    const insert = Effect.fn("D1InvestmentStore.insert")(function* insert(
      profileId: ProfileId,
      holding: Holding
    ) {
      if (holding.profileId !== profileId) {
        return yield* mismatchedProfile(profileId, holding);
      }

      const existing = yield* client
        .query(
          "SELECT id, opened_on FROM holdings WHERE profile_id = ? AND platform_id = ? AND symbol = ?",
          [profileId, holding.platformId, holding.symbol],
          ExistingHoldingIdRowSchema
        )
        .pipe(Effect.mapError(unavailable("check existing holding")));

      if (existing.length > 0) {
        return yield* duplicateHolding(profileId, holding);
      }

      const now = yield* Clock.currentTimeMillis;

      const costBasis = Option.getOrNull(holding.costBasis);

      const lastPrice = Option.getOrNull(holding.lastPrice);

      const pricedAt = Option.match(holding.pricedAt, {
        onNone: () => null,
        onSome: millisOfIso,
      });

      yield* client
        .execute(
          `INSERT INTO holdings (
            id, profile_id, platform_id, symbol, name, asset_type,
            quantity_micros, cost_basis_minor, cost_basis_currency,
            currency, state, opened_on, notes,
            last_price_minor, last_price_currency, priced_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)`,
          [
            holding.id,
            profileId,
            holding.platformId,
            holding.symbol,
            holding.name,
            holding.assetType,
            holding.quantity,
            costBasis === null ? null : costBasis.minor,
            costBasis === null ? null : costBasis.currency,
            holding.currency,
            holding.state,
            holding.openedOn,
            lastPrice === null ? null : lastPrice.minor,
            lastPrice === null ? null : lastPrice.currency,
            pricedAt,
            now,
            now,
          ]
        )
        .pipe(Effect.mapError(unavailable("insert holding")));

      return holding;
    });

    const update = Effect.fn("D1InvestmentStore.update")(function* update(
      profileId: ProfileId,
      holdingId: HoldingId,
      patch: HoldingPatch
    ) {
      const rows = yield* client
        .query(
          `SELECT ${SELECT_HOLDING_COLUMNS} FROM holdings WHERE profile_id = ? AND id = ?`,
          [profileId, holdingId],
          HoldingRowSchema
        )
        .pipe(Effect.mapError(unavailable("load holding for update")));

      const [first] = rows;

      if (first === undefined) {
        return Option.none<Holding>();
      }

      const current = yield* decodeHoldingRow(first);

      const next = applyHoldingPatch(current, patch);

      const now = yield* Clock.currentTimeMillis;

      const costBasis = Option.getOrNull(next.costBasis);

      const lastPrice = Option.getOrNull(next.lastPrice);

      const pricedAt = Option.match(next.pricedAt, {
        onNone: () => null,
        onSome: millisOfIso,
      });

      yield* client
        .execute(
          `UPDATE holdings
           SET name = ?,
               quantity_micros = ?,
               cost_basis_minor = ?,
               cost_basis_currency = ?,
               last_price_minor = ?,
               last_price_currency = ?,
               priced_at = ?,
               state = ?,
               updated_at = ?
           WHERE profile_id = ? AND id = ?`,
          [
            next.name,
            next.quantity,
            costBasis === null ? null : costBasis.minor,
            costBasis === null ? null : costBasis.currency,
            lastPrice === null ? null : lastPrice.minor,
            lastPrice === null ? null : lastPrice.currency,
            pricedAt,
            next.state,
            now,
            profileId,
            holdingId,
          ]
        )
        .pipe(Effect.mapError(unavailable("update holding")));

      return Option.some(next);
    });

    const remove = Effect.fn("D1InvestmentStore.remove")(function* remove(
      profileId: ProfileId,
      holdingId: HoldingId
    ) {
      const rows = yield* client
        .query(
          `SELECT ${SELECT_HOLDING_COLUMNS} FROM holdings WHERE profile_id = ? AND id = ?`,
          [profileId, holdingId],
          HoldingRowSchema
        )
        .pipe(Effect.mapError(unavailable("load holding for delete")));

      const [first] = rows;

      if (first === undefined) {
        return Option.none<Holding>();
      }

      const current = yield* decodeHoldingRow(first);

      yield* client
        .execute("DELETE FROM holdings WHERE profile_id = ? AND id = ?", [
          profileId,
          holdingId,
        ])
        .pipe(Effect.mapError(unavailable("delete holding")));

      return Option.some(current);
    });

    const upsert = Effect.fn("D1InvestmentStore.upsert")(function* upsert(
      profileId: ProfileId,
      holding: Holding
    ) {
      if (holding.profileId !== profileId) {
        return yield* mismatchedProfile(profileId, holding);
      }

      const existing = yield* client
        .query(
          "SELECT id, opened_on FROM holdings WHERE profile_id = ? AND platform_id = ? AND symbol = ?",
          [profileId, holding.platformId, holding.symbol],
          ExistingHoldingIdRowSchema
        )
        .pipe(Effect.mapError(unavailable("check holding for upsert")));

      const now = yield* Clock.currentTimeMillis;

      const costBasis = Option.getOrNull(holding.costBasis);

      const lastPrice = Option.getOrNull(holding.lastPrice);

      const pricedAt = Option.match(holding.pricedAt, {
        onNone: () => null,
        onSome: millisOfIso,
      });

      const [found] = existing;

      if (found === undefined) {
        yield* client
          .execute(
            `INSERT INTO holdings (
              id, profile_id, platform_id, symbol, name, asset_type,
              quantity_micros, cost_basis_minor, cost_basis_currency,
              currency, state, opened_on, notes,
              last_price_minor, last_price_currency, priced_at,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)`,
            [
              holding.id,
              profileId,
              holding.platformId,
              holding.symbol,
              holding.name,
              holding.assetType,
              holding.quantity,
              costBasis === null ? null : costBasis.minor,
              costBasis === null ? null : costBasis.currency,
              holding.currency,
              holding.state,
              holding.openedOn,
              lastPrice === null ? null : lastPrice.minor,
              lastPrice === null ? null : lastPrice.currency,
              pricedAt,
              now,
              now,
            ]
          )
          .pipe(Effect.mapError(unavailable("insert holding in upsert")));

        const created: UpsertOutcome = "created";

        return created;
      }

      yield* client
        .execute(
          `UPDATE holdings
           SET name = ?,
               asset_type = ?,
               quantity_micros = ?,
               cost_basis_minor = ?,
               cost_basis_currency = ?,
               currency = ?,
               state = ?,
               last_price_minor = ?,
               last_price_currency = ?,
               priced_at = ?,
               updated_at = ?
           WHERE profile_id = ? AND id = ?`,
          [
            holding.name,
            holding.assetType,
            holding.quantity,
            costBasis === null ? null : costBasis.minor,
            costBasis === null ? null : costBasis.currency,
            holding.currency,
            holding.state,
            lastPrice === null ? null : lastPrice.minor,
            lastPrice === null ? null : lastPrice.currency,
            pricedAt,
            now,
            profileId,
            found.id,
          ]
        )
        .pipe(Effect.mapError(unavailable("update holding in upsert")));

      const updated: UpsertOutcome = "updated";

      return updated;
    });

    return {
      holdings,
      insert,
      platforms,
      remove,
      update,
      upsert,
    } as const;
  })
);

export const d1ProfileCurrenciesLayer = Layer.effect(
  ProfileCurrencies,
  Effect.gen(function* makeD1ProfileCurrencies() {
    const client = yield* SqliteClient;

    return ProfileCurrencies.of({
      baseCurrency: Effect.fn("D1ProfileCurrencies.baseCurrency")(
        function* baseCurrency(profileId: ProfileId) {
          const rows = yield* client
            .query(
              "SELECT base_currency FROM profiles WHERE id = ? AND archived_at IS NULL",
              [profileId],
              ProfileCurrencyRowSchema
            )
            .pipe(Effect.mapError(unavailable("read profile base currency")));

          const [first] = rows;

          if (first === undefined) {
            return yield* new UnknownProfile({ profileId });
          }

          return first.base_currency;
        }
      ),
    });
  })
);

export const d1ExchangeRatesLayer = Layer.effect(
  ExchangeRates,
  Effect.gen(function* makeD1ExchangeRates() {
    const client = yield* SqliteClient;

    return ExchangeRates.of({
      read: Effect.fn("D1ExchangeRates.read")(function* read() {
        const rows = yield* client
          .query(
            "SELECT base_currency, quote_currency, as_of, rate, fetched_at FROM exchange_rates ORDER BY as_of DESC",
            [],
            ExchangeRateRowSchema
          )
          .pipe(Effect.mapError(unavailable("read exchange rates")));

        const decoded: ExchangeRate[] = [];

        for (const row of rows) {
          decoded.push(
            yield* Schema.decodeEffect(ExchangeRateSchema)({
              asOf: row.as_of,
              base: row.base_currency,
              fetchedAt: isoOfMillis(row.fetched_at),
              quote: row.quote_currency,
              rate: formatRateText(row.rate),
            }).pipe(Effect.mapError(unavailable("decode exchange rate row")))
          );
        }

        return decoded;
      }),
    });
  })
);

export const d1InvestmentsLayer = Layer.mergeAll(
  d1InvestmentStoreLayer,
  d1ProfileCurrenciesLayer,
  d1ExchangeRatesLayer
);
