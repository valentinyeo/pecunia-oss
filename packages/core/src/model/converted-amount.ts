import {
  Effect,
  Option,
  Result,
  Schema,
  SchemaGetter,
  SchemaIssue,
} from "effect";

import { BaseAmount } from "./base-amount.js";
// oxlint-disable anti-slop/no-unknown-parameters -- restore is a boundary that parses stored rows
// oxlint-disable eslint/prefer-object-spread, typescript/no-misused-spread -- the encoded row keeps every own key of the class instance so the strict encoder can reject strays
import { domainClass, verified } from "./codec.js";
import type {
  ConversionInputInvalid,
  ConversionOverflow,
  RateOnSameCurrency,
} from "./errors.js";
import { rateOnSameCurrency } from "./errors.js";
import type { Operation } from "./operation.js";
import {
  codeArgument,
  codeSample,
  dateArgument,
  dateSample,
  moneyArgument,
  moneySample,
  resultOperation,
} from "./operation.js";
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
import { RateSchema, rateArgument, rateSample } from "./rate.js";
import type { Rate } from "./rate.js";
import { ownedNone, ownedSome, seal } from "./registry.js";

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
    seal("ConvertedAmount", this);
  }

  static readonly convertingOperation: Operation<
    [Money, CurrencyCode, Rate, DateOnly],
    Result.Result<
      ConvertedAmount,
      | ConversionInputInvalid
      | ConversionOverflow
      | RateOnSameCurrency
      | Schema.SchemaError
    >
  > = resultOperation({
    arguments: [
      moneyArgument(),
      codeArgument(),
      rateArgument(),
      dateArgument(),
    ],
    name: "ConvertedAmount.converting",
    run: (
      source: Money,
      baseCurrency: CurrencyCode,
      rate: Rate,
      asOf: DateOnly
    ): Result.Result<
      ConvertedAmount,
      | ConversionInputInvalid
      | ConversionOverflow
      | RateOnSameCurrency
      | Schema.SchemaError
    > =>
      source.currency === baseCurrency
        ? Result.fail(rateOnSameCurrency({ currency: source.currency }))
        : Result.map(
            BaseAmount.atRateOperation.apply(source, baseCurrency, rate),
            (base) => new ConvertedAmount({ asOf, base, rate, source })
          ),
    samples: () => [
      moneySample(),
      codeSample("GBP"),
      rateSample(),
      dateSample(),
    ],
  });

  static readonly converting: typeof ConvertedAmount.convertingOperation.apply =
    ConvertedAmount.convertingOperation.apply;

  static restore(stored: unknown): Option.Option<ConvertedAmount> {
    return ConvertedAmount.#fromStored(
      verified(StoredConvertedAmountSchema, stored)
    );
  }

  static #fromStored(stored: StoredConversion): Option.Option<ConvertedAmount> {
    if (stored.source.currency === stored.base.currency) {
      return ownedNone();
    }

    const base = BaseAmount.atRate(
      stored.source,
      stored.base.currency,
      stored.rate
    );

    if (Result.isFailure(base) || base.success.minor !== stored.base.minor) {
      return ownedNone();
    }

    return ownedSome(
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

export const convertingOperation: typeof ConvertedAmount.convertingOperation =
  ConvertedAmount.convertingOperation;

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
  Object.assign({}, amount, {
    _tag: "Converted" as const,
    base: Object.assign({}, amount.base),
  });

const convertedAmountEncode = SchemaGetter.transformEffect<
  StoredConversion,
  ConvertedAmount
>((amount, options) =>
  BaseAmount.isBaseAmount(amount.base)
    ? Effect.succeed(encodedConvertedAmount(amount))
    : Effect.fail(
        new SchemaIssue.InvalidValue(
          { message: "base must be a converted base amount" },
          amount,
          options
        )
      )
);

domainClass(ConvertedAmount);

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
