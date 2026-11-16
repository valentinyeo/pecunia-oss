import { Effect, Option, Result, Schema } from "effect";

import { domainClass } from "./codec.js";
import { convertMinor } from "./convert-minor.js";
import type {
  ConversionInputInvalid,
  ConversionOverflow,
  RateUnavailable,
} from "./errors.js";
import { rateUnavailable } from "./errors.js";
import {
  callbackResult,
  codeArgument,
  codeSample,
  effectOperation,
  moneyArgument,
  moneySample,
  resultOperation,
} from "./operation.js";
import type { Operation } from "./operation.js";
import type { CurrencyCode, MinorUnits, Money } from "./primitives.js";
import type { Rate } from "./rate.js";
import { RateSchema, rateArgument, rateSample } from "./rate.js";

export interface ConversionQuery {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
}

export type RateLookup = (query: ConversionQuery) => Option.Option<Rate>;

const conversionProof: unique symbol = Symbol("Converted");

const lookupSample = (): RateLookup => (): Option.Option<Rate> =>
  Option.some(rateSample());

export class BaseAmount {
  declare readonly amount?: never;
  declare readonly asOf?: never;
  readonly currency: CurrencyCode;
  readonly minor: MinorUnits;
  declare readonly rate?: never;
  declare readonly source?: never;
  readonly #proof: typeof conversionProof;

  private constructor(currency: CurrencyCode, minor: MinorUnits) {
    this.#proof = conversionProof;
    this.currency = currency;
    this.minor = minor;
  }

  static readonly atRateOperation: Operation<
    [Money, CurrencyCode, Rate],
    Result.Result<
      BaseAmount,
      ConversionInputInvalid | ConversionOverflow | Schema.SchemaError
    >
  > = resultOperation({
    arguments: [moneyArgument(), codeArgument(), rateArgument()],
    name: "BaseAmount.atRate",
    run: (money: Money, baseCurrency: CurrencyCode, rate: Rate) =>
      money.currency === baseCurrency
        ? Result.succeed(new BaseAmount(money.currency, money.minor))
        : Result.map(
            convertMinor(money.minor, money.currency, baseCurrency, rate),
            (minor) => new BaseAmount(baseCurrency, minor)
          ),
    samples: () => [moneySample(), codeSample(), rateSample()],
  });

  static readonly convertOperation: Operation<
    [Money, CurrencyCode, RateLookup],
    Effect.Effect<
      BaseAmount,
      | ConversionInputInvalid
      | ConversionOverflow
      | RateUnavailable
      | Schema.SchemaError
    >
  > = effectOperation({
    arguments: [
      moneyArgument(),
      codeArgument(),
      callbackResult("RateLookup", Schema.Option(RateSchema), lookupSample),
    ],
    name: "BaseAmount.convert",
    run: (
      money: Money,
      baseCurrency: CurrencyCode,
      lookup: RateLookup
    ): Effect.Effect<
      BaseAmount,
      | ConversionInputInvalid
      | ConversionOverflow
      | RateUnavailable
      | Schema.SchemaError
    > =>
      money.currency === baseCurrency
        ? Effect.succeed(new BaseAmount(money.currency, money.minor))
        : Option.match(lookup({ from: money.currency, to: baseCurrency }), {
            onNone: () =>
              Effect.fail(
                rateUnavailable({ from: money.currency, to: baseCurrency })
              ),
            onSome: (rate) =>
              Effect.fromResult(
                Result.map(
                  convertMinor(money.minor, money.currency, baseCurrency, rate),
                  (minor) => new BaseAmount(baseCurrency, minor)
                )
              ),
          }),
    samples: () => [moneySample(), codeSample("GBP"), lookupSample()],
  });

  static readonly atRate: typeof BaseAmount.atRateOperation.apply =
    BaseAmount.atRateOperation.apply;

  static readonly convert: typeof BaseAmount.convertOperation.apply =
    BaseAmount.convertOperation.apply;

  static isBaseAmount(value: unknown): value is BaseAmount {
    return value instanceof BaseAmount && value.#proof === conversionProof;
  }
}

export const atRateOperation: typeof BaseAmount.atRateOperation =
  BaseAmount.atRateOperation;

export const convertOperation: typeof BaseAmount.convertOperation =
  BaseAmount.convertOperation;

domainClass(BaseAmount);
