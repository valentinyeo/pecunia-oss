import { Effect, Layer, Option, Schema } from "effect";

import { BrokerPayloadRejected } from "./broker-payload-rejected.js";
import { BrokerUnavailable } from "./broker-unavailable.js";
import { BrokerHoldings } from "./broker.js";
import { moneyOfText, quantityOfText } from "./decimal.js";
import {
  CurrencyCodeSchema,
  DateOnlySchema,
  HoldingNameSchema,
  HoldingSymbolSchema,
  TimestampSchema,
} from "./model.js";
import type {
  AssetType,
  BrokerAccountId,
  BrokerHolding,
  CurrencyCode,
  Money,
  Timestamp,
} from "./model.js";
import { positionValue } from "./valuation.js";

export const TRADING212_INSTRUMENT_TYPES = [
  "STOCK",
  "ETF",
  "FUND",
  "CRYPTO",
  "CASH",
] as const;

export type Trading212InstrumentType =
  (typeof TRADING212_INSTRUMENT_TYPES)[number];

export const assetTypeOfTrading212 = (
  instrumentType: Trading212InstrumentType
): AssetType => {
  const assetTypes: Readonly<Record<Trading212InstrumentType, AssetType>> = {
    CASH: "cash",
    CRYPTO: "crypto",
    ETF: "etf",
    FUND: "fund",
    STOCK: "stock",
  };

  return assetTypes[instrumentType];
};

export const Trading212InstrumentSchema = Schema.Struct({
  averagePrice: Schema.String,
  currentPrice: Schema.NullOr(Schema.String),
  currency: Schema.String,
  name: Schema.String,
  quantity: Schema.String,
  ticker: Schema.String,
  type: Schema.Literals(TRADING212_INSTRUMENT_TYPES),
});

export type Trading212Instrument = typeof Trading212InstrumentSchema.Type;

export const Trading212PayloadSchema = Schema.Struct({
  asOf: TimestampSchema,
  instruments: Schema.Array(Trading212InstrumentSchema),
});

export type Trading212Payload = typeof Trading212PayloadSchema.Type;

const rejection = (
  accountId: BrokerAccountId,
  field: string,
  message: string
) =>
  new BrokerPayloadRejected({
    accountId,
    field,
    message,
    repair: `Fix the recorded Trading 212 payload field ${field} so it holds an exact decimal string and an ISO currency code.`,
  });

const priceOf = (
  accountId: BrokerAccountId,
  currency: CurrencyCode,
  index: number,
  text: string | null
): Effect.Effect<Option.Option<Money>, BrokerPayloadRejected> => {
  if (text === null) {
    return Effect.succeedNone;
  }

  const money = moneyOfText(text, currency);

  return Option.isSome(money)
    ? Effect.succeed(money)
    : Effect.fail(
        rejection(
          accountId,
          `instruments[${index}].currentPrice`,
          `Trading 212 returned ${text} as a current price, which is not exact in ${currency}.`
        )
      );
};

const instrumentHolding = (
  accountId: BrokerAccountId,
  at: Timestamp,
  index: number,
  instrument: Trading212Instrument
): Effect.Effect<BrokerHolding, BrokerPayloadRejected> =>
  Effect.gen(function* instrumentToHolding() {
    const currency = yield* Schema.decodeEffect(CurrencyCodeSchema)(
      instrument.currency
    ).pipe(
      Effect.mapError(() =>
        rejection(
          accountId,
          `instruments[${index}].currency`,
          `Trading 212 returned ${instrument.currency} as a currency code.`
        )
      )
    );

    const quantity = yield* Effect.fromOption(
      quantityOfText(instrument.quantity),
      () =>
        rejection(
          accountId,
          `instruments[${index}].quantity`,
          `Trading 212 returned ${instrument.quantity} as a quantity.`
        )
    );

    const price = yield* priceOf(
      accountId,
      currency,
      index,
      instrument.currentPrice
    );

    const name = yield* Schema.decodeEffect(HoldingNameSchema)(
      instrument.name
    ).pipe(
      Effect.mapError(() =>
        rejection(
          accountId,
          `instruments[${index}].name`,
          "Trading 212 returned an empty instrument name."
        )
      )
    );

    const symbol = yield* Schema.decodeEffect(HoldingSymbolSchema)(
      instrument.ticker
    ).pipe(
      Effect.mapError(() =>
        rejection(
          accountId,
          `instruments[${index}].ticker`,
          "Trading 212 returned an empty ticker."
        )
      )
    );

    const openedOn = yield* Schema.decodeEffect(DateOnlySchema)(
      at.slice(0, 10)
    ).pipe(
      Effect.mapError(() =>
        rejection(
          accountId,
          "asOf",
          "The Trading 212 payload instant does not start with a calendar date."
        )
      )
    );

    const averagePrice = moneyOfText(instrument.averagePrice, currency);

    const costBasis = Option.isSome(averagePrice)
      ? positionValue(quantity, averagePrice.value)
      : Option.none();

    return {
      assetType: assetTypeOfTrading212(instrument.type),
      costBasis,
      currency,
      name,
      openedOn,
      price,
      pricedAt: Option.isSome(price) ? Option.some(at) : Option.none(),
      quantity,
      symbol,
    };
  });

export const trading212Holdings = (
  accountId: BrokerAccountId,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The broker's HTTP payload is untrusted boundary input, parsed by Trading212PayloadSchema inside.
  payload: unknown
): Effect.Effect<readonly BrokerHolding[], BrokerPayloadRejected> =>
  Effect.gen(function* readTrading212Holdings() {
    const decoded = yield* Schema.decodeUnknownEffect(Trading212PayloadSchema)(
      payload
    ).pipe(
      Effect.mapError(() =>
        rejection(
          accountId,
          "payload",
          "The recorded Trading 212 payload is not the shape its API returns."
        )
      )
    );

    const holdings: BrokerHolding[] = [];

    for (const [index, instrument] of decoded.instruments.entries()) {
      holdings.push(
        yield* instrumentHolding(accountId, decoded.asOf, index, instrument)
      );
    }

    return holdings;
  });

export const trading212BrokerLayer = (
  accountId: BrokerAccountId,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The recorded payload is the broker boundary and is parsed by Trading212PayloadSchema on each sync.
  payload: unknown
) =>
  Layer.succeed(BrokerHoldings, {
    fetch: (requested) =>
      requested === accountId
        ? trading212Holdings(accountId, payload)
        : Effect.fail(
            new BrokerUnavailable({
              accountId,
              message: `This Trading 212 adapter holds the recorded portfolio for ${accountId}, not ${requested}.`,
              repair:
                "Sync the account this adapter was built for, or build one adapter per broker account.",
            })
          ),
  });
