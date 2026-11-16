import {
  Effect,
  Option,
  Result,
  Schema,
  SchemaGetter,
  SchemaIssue,
} from "effect";
import type { SchemaAST } from "effect";

import { BaseAmount, baseAmountFields } from "./base-amount.js";
import type { ConversionInputInvalid } from "./conversion-input-invalid.js";
import type { ConversionOverflow } from "./conversion-overflow.js";
import type {
  CurrencyCode,
  DateOnly,
  MinorUnits,
  Money,
} from "./primitives.js";
import {
  CurrencyCodeSchema,
  DateOnlySchema,
  MinorUnitsSchema,
  MoneySchema,
} from "./primitives.js";
import { RateOnSameCurrency } from "./rate-on-same-currency.js";
import { RateSchema } from "./rate.js";
import type { Rate } from "./rate.js";

const conversionProof: unique symbol = Symbol("Converted");

interface ConvertedAmountFields {
  readonly asOf: DateOnly;
  readonly base: BaseAmount;
  readonly rate: Rate;
  readonly source: Money;
}

export interface StoredConversion {
  readonly _tag: "Converted";
  readonly asOf: DateOnly;
  readonly base: {
    readonly currency: CurrencyCode;
    readonly minor: MinorUnits;
  };
  readonly rate: Rate;
  readonly source: Money;
}

export class ConvertedAmount {
  readonly _tag = "Converted";
  declare readonly amount?: never;
  readonly asOf: DateOnly;
  readonly base: BaseAmount;
  readonly rate: Rate;
  readonly source: Money;
  readonly #proof: typeof conversionProof;

  private constructor(fields: ConvertedAmountFields) {
    this.#proof = conversionProof;
    this.asOf = fields.asOf;
    this.base = fields.base;
    this.rate = fields.rate;
    this.source = fields.source;
  }

  static converting(
    source: Money,
    baseCurrency: CurrencyCode,
    rate: Rate,
    asOf: DateOnly
  ): Result.Result<
    ConvertedAmount,
    ConversionInputInvalid | ConversionOverflow | RateOnSameCurrency
  > {
    if (source.currency === baseCurrency) {
      return Result.fail(new RateOnSameCurrency({ currency: source.currency }));
    }

    return Result.map(
      BaseAmount.atRate(source, baseCurrency, rate),
      (base) => new ConvertedAmount({ asOf, base, rate, source })
    );
  }

  static restore(stored: StoredConversion): Option.Option<ConvertedAmount> {
    if (stored.source.currency === stored.base.currency) {
      return Option.none();
    }

    const base = BaseAmount.atRate(
      stored.source,
      stored.base.currency,
      stored.rate
    );

    if (Result.isFailure(base) || base.success.minor !== stored.base.minor) {
      return Option.none();
    }

    return Option.some(
      new ConvertedAmount({
        asOf: stored.asOf,
        base: base.success,
        rate: stored.rate,
        source: stored.source,
      })
    );
  }

  static isConvertedAmount(value: unknown): value is ConvertedAmount {
    return value instanceof ConvertedAmount && value.#proof === conversionProof;
  }
}

const StoredBaseAmountSchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
});

const StoredConvertedAmountSchema = Schema.TaggedStruct("Converted", {
  asOf: DateOnlySchema,
  base: StoredBaseAmountSchema,
  rate: RateSchema,
  source: MoneySchema,
});

const conversionIsExact = (amount: ConvertedAmount): boolean => {
  const base = BaseAmount.atRate(
    amount.source,
    amount.base.currency,
    amount.rate
  );

  return (
    BaseAmount.isBaseAmount(amount.base) &&
    amount.source.currency !== amount.base.currency &&
    Result.isSuccess(base) &&
    base.success.minor === amount.base.minor
  );
};

const decodedConvertedAmount = (
  stored: StoredConversion
): Option.Option<ConvertedAmount> => ConvertedAmount.restore(stored);

const encodedConvertedAmount = (amount: ConvertedAmount): StoredConversion =>
  StoredConvertedAmountSchema.make({
    asOf: amount.asOf,
    base: { currency: amount.base.currency, minor: amount.base.minor },
    rate: amount.rate,
    source: amount.source,
  });

const convertedAmountFields = ["_tag", "asOf", "base", "rate", "source"];

const strayField = (
  value: BaseAmount | ConvertedAmount,
  allowed: readonly string[]
): string | undefined =>
  Object.keys(value).find((key) => !allowed.includes(key));

const unexpectedField = (
  field: string,
  input: BaseAmount | ConvertedAmount,
  options: SchemaAST.ParseOptions
): SchemaIssue.Issue =>
  new SchemaIssue.InvalidValue(
    { message: `unexpected field "${field}"` },
    input,
    options
  );

const convertedAmountEncode = SchemaGetter.transformEffect<
  StoredConversion,
  ConvertedAmount
>((amount, options) => {
  const stray = strayField(amount, convertedAmountFields);

  if (stray !== undefined) {
    return Effect.fail(unexpectedField(stray, amount, options));
  }

  if (!BaseAmount.isBaseAmount(amount.base)) {
    return Effect.fail(
      new SchemaIssue.InvalidValue(
        { message: "base must be a converted base amount" },
        amount,
        options
      )
    );
  }

  const baseStray = strayField(amount.base, baseAmountFields);

  return baseStray === undefined
    ? Effect.succeed(encodedConvertedAmount(amount))
    : Effect.fail(unexpectedField(baseStray, amount.base, options));
});

export const ConvertedAmountSchema = StoredConvertedAmountSchema.pipe(
  Schema.decodeTo(
    Schema.declare((value: unknown): value is ConvertedAmount =>
      ConvertedAmount.isConvertedAmount(value)
    ).check(
      Schema.makeFilter(conversionIsExact, {
        expected: "a conversion that matches its own source, rate, and base",
      })
    ),
    {
      decode: SchemaGetter.transformOptional((stored) =>
        stored.pipe(Option.flatMap(decodedConvertedAmount))
      ),
      encode: convertedAmountEncode,
    }
  )
);
