// oxlint-disable eslint/max-classes-per-file -- the six tagged errors share one strict factory pair so each has exactly one door
import { Schema } from "effect";

import type { Exact } from "./codec.js";
import { codec, verified } from "./codec.js";
import { CurrencyCodeSchema, MinorUnitsSchema } from "./primitives.js";
import { RateSchema, rateText } from "./rate.js";

declare const errorBrand: unique symbol;

const conversionInputInvalidFields = {
  from: CurrencyCodeSchema,
  reason: Schema.Literals(["fractional", "not-finite", "unsafe"]),
  to: CurrencyCodeSchema,
};

const ConversionInputInvalidSchema = Schema.Struct(
  conversionInputInvalidFields
);

export type ConversionInputInvalidFields = Exact<
  typeof ConversionInputInvalidSchema.Type
>;

class ConversionInputInvalidError extends Schema.TaggedError<
  ConversionInputInvalidError,
  { readonly brand: unique symbol }
>()("ConversionInputInvalid", conversionInputInvalidFields) {
  declare readonly [errorBrand]: true;

  static of(input: ConversionInputInvalidFields): ConversionInputInvalidError {
    return new ConversionInputInvalidError(
      verified(ConversionInputInvalidSchema, input)
    );
  }

  override get message(): string {
    return `Converting ${this.from} into ${this.to} needs whole minor units that a number holds exactly, but this amount is ${this.reason}. Fix: pass a safe integer number of minor units.`;
  }
}

export type ConversionInputInvalid = ConversionInputInvalidError;

export const conversionInputInvalid = (
  input: ConversionInputInvalidFields
): ConversionInputInvalid => ConversionInputInvalidError.of(input);

const conversionOverflowFields = {
  baseCurrency: CurrencyCodeSchema,
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
  rate: RateSchema,
};

const ConversionOverflowSchema = Schema.Struct(conversionOverflowFields);

export type ConversionOverflowFields = Exact<
  typeof ConversionOverflowSchema.Type
>;

class ConversionOverflowError extends Schema.TaggedError<
  ConversionOverflowError,
  { readonly brand: unique symbol }
>()("ConversionOverflow", conversionOverflowFields) {
  declare readonly [errorBrand]: true;

  static of(input: ConversionOverflowFields): ConversionOverflowError {
    return new ConversionOverflowError(
      verified(ConversionOverflowSchema, input)
    );
  }

  override get message(): string {
    return `Converting ${this.minor} ${this.currency} at ${rateText(this.rate)} into ${this.baseCurrency} leaves the safe integer range. Fix: convert a smaller amount, or store the amount in ${this.currency}.`;
  }
}

export type ConversionOverflow = ConversionOverflowError;

export const conversionOverflow = (
  input: ConversionOverflowFields
): ConversionOverflow => ConversionOverflowError.of(input);

const currencyMismatchFields = {
  left: CurrencyCodeSchema,
  right: CurrencyCodeSchema,
};

const CurrencyMismatchSchema = Schema.Struct(currencyMismatchFields);

export type CurrencyMismatchFields = Exact<typeof CurrencyMismatchSchema.Type>;

class CurrencyMismatchError extends Schema.TaggedError<
  CurrencyMismatchError,
  { readonly brand: unique symbol }
>()("CurrencyMismatch", currencyMismatchFields) {
  declare readonly [errorBrand]: true;

  static of(input: CurrencyMismatchFields): CurrencyMismatchError {
    return new CurrencyMismatchError(verified(CurrencyMismatchSchema, input));
  }

  override get message(): string {
    return `Cannot combine ${this.left} with ${this.right}. Fix: convert both amounts into one currency with convert().`;
  }
}

export type CurrencyMismatch = CurrencyMismatchError;

export const currencyMismatch = (
  input: CurrencyMismatchFields
): CurrencyMismatch => CurrencyMismatchError.of(input);

const moneyOverflowFields = {
  currency: CurrencyCodeSchema,
  left: MinorUnitsSchema,
  operation: Schema.Literals(["add", "subtract"]),
  right: MinorUnitsSchema,
};

const MoneyOverflowSchema = Schema.Struct(moneyOverflowFields);

export type MoneyOverflowFields = Exact<typeof MoneyOverflowSchema.Type>;

class MoneyOverflowError extends Schema.TaggedError<
  MoneyOverflowError,
  { readonly brand: unique symbol }
>()("MoneyOverflow", moneyOverflowFields) {
  declare readonly [errorBrand]: true;

  static of(input: MoneyOverflowFields): MoneyOverflowError {
    return new MoneyOverflowError(verified(MoneyOverflowSchema, input));
  }

  override get message(): string {
    return `${this.left} ${this.operation === "add" ? "+" : "-"} ${this.right} in ${this.currency} leaves the safe integer range. Fix: split the amount across two rows, or add the parts in another order that stays in range.`;
  }
}

export type MoneyOverflow = MoneyOverflowError;

export const moneyOverflow = (input: MoneyOverflowFields): MoneyOverflow =>
  MoneyOverflowError.of(input);

const rateOnSameCurrencyFields = {
  currency: CurrencyCodeSchema,
};

const RateOnSameCurrencySchema = Schema.Struct(rateOnSameCurrencyFields);

export type RateOnSameCurrencyFields = Exact<
  typeof RateOnSameCurrencySchema.Type
>;

class RateOnSameCurrencyError extends Schema.TaggedError<
  RateOnSameCurrencyError,
  { readonly brand: unique symbol }
>()("RateOnSameCurrency", rateOnSameCurrencyFields) {
  declare readonly [errorBrand]: true;

  static of(input: RateOnSameCurrencyFields): RateOnSameCurrencyError {
    return new RateOnSameCurrencyError(
      verified(RateOnSameCurrencySchema, input)
    );
  }

  override get message(): string {
    return `A ${this.currency} amount cannot be converted into ${this.currency} with a rate. Fix: store it with SameCurrency and no rate.`;
  }
}

export type RateOnSameCurrency = RateOnSameCurrencyError;

export const rateOnSameCurrency = (
  input: RateOnSameCurrencyFields
): RateOnSameCurrency => RateOnSameCurrencyError.of(input);

const rateUnavailableFields = {
  from: CurrencyCodeSchema,
  to: CurrencyCodeSchema,
};

const RateUnavailableSchema = Schema.Struct(rateUnavailableFields);

export type RateUnavailableFields = Exact<typeof RateUnavailableSchema.Type>;

class RateUnavailableError extends Schema.TaggedError<
  RateUnavailableError,
  { readonly brand: unique symbol }
>()("RateUnavailable", rateUnavailableFields) {
  declare readonly [errorBrand]: true;

  static of(input: RateUnavailableFields): RateUnavailableError {
    return new RateUnavailableError(verified(RateUnavailableSchema, input));
  }

  override get message(): string {
    return `No ${this.from} to ${this.to} rate is known. Fix: store the rate before converting, or keep the amount in ${this.from}.`;
  }
}

export type RateUnavailable = RateUnavailableError;

export const rateUnavailable = (
  input: RateUnavailableFields
): RateUnavailable => RateUnavailableError.of(input);

export const errorCodecs = {
  conversionInputInvalid: codec(
    "ConversionInputInvalid",
    ConversionInputInvalidError
  ),
  conversionOverflow: codec("ConversionOverflow", ConversionOverflowError),
  currencyMismatch: codec("CurrencyMismatch", CurrencyMismatchError),
  moneyOverflow: codec("MoneyOverflow", MoneyOverflowError),
  rateOnSameCurrency: codec("RateOnSameCurrency", RateOnSameCurrencyError),
  rateUnavailable: codec("RateUnavailable", RateUnavailableError),
} as const;
