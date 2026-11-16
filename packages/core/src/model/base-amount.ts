import { Effect, Option, Result } from "effect";

import type { ConversionInputInvalid } from "./conversion-input-invalid.js";
import type { ConversionOverflow } from "./conversion-overflow.js";
import { convertMinor } from "./convert-minor.js";
import type { CurrencyCode, MinorUnits, Money } from "./primitives.js";
import { RateUnavailable } from "./rate-unavailable.js";
import type { Rate } from "./rate.js";

export interface ConversionQuery {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
}

export type RateLookup = (query: ConversionQuery) => Option.Option<Rate>;

const conversionProof: unique symbol = Symbol("Converted");

export class BaseAmount {
  readonly currency: CurrencyCode;
  readonly minor: MinorUnits;
  readonly #proof: typeof conversionProof;

  private constructor(currency: CurrencyCode, minor: MinorUnits) {
    this.#proof = conversionProof;
    this.currency = currency;
    this.minor = minor;
  }

  static convert(
    money: Money,
    baseCurrency: CurrencyCode,
    lookup: RateLookup
  ): Effect.Effect<
    BaseAmount,
    ConversionInputInvalid | ConversionOverflow | RateUnavailable
  > {
    if (money.currency === baseCurrency) {
      return Effect.succeed(new BaseAmount(money.currency, money.minor));
    }

    return Option.match(lookup({ from: money.currency, to: baseCurrency }), {
      onNone: () =>
        Effect.fail(
          new RateUnavailable({ from: money.currency, to: baseCurrency })
        ),
      onSome: (rate) =>
        Effect.fromResult(BaseAmount.atRate(money, baseCurrency, rate)),
    });
  }

  static atRate(
    money: Money,
    baseCurrency: CurrencyCode,
    rate: Rate
  ): Result.Result<BaseAmount, ConversionInputInvalid | ConversionOverflow> {
    return money.currency === baseCurrency
      ? Result.succeed(new BaseAmount(money.currency, money.minor))
      : Result.map(
          convertMinor(money.minor, money.currency, baseCurrency, rate),
          (minor) => new BaseAmount(baseCurrency, minor)
        );
  }

  static isBaseAmount(value: unknown): value is BaseAmount {
    return value instanceof BaseAmount && value.#proof === conversionProof;
  }
}
