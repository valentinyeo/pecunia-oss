// oxlint-disable anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- the one error factory copies exactly the declared primitive field names into the table's field type
// oxlint-disable anti-slop/no-object-parameters, anti-slop/no-reflect-get -- an error owner is any verified error instance, and its declared field names are read by the table that defines them
import { Schema, SchemaGetter } from "effect";

import type { Exact, Handle, ModelCodec } from "./codec.js";
import { assertNoForeignKeys, codec, parse } from "./codec.js";
import { CurrencyCodeSchema, MinorUnitsSchema } from "./primitives.js";

declare const errorBrand: unique symbol;

const kindSchemas = {
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
  operation: Schema.Literals(["add", "subtract"]),
  reason: Schema.Literals(["fractional", "not-finite", "unsafe"]),
  text: Schema.String,
} as const;

const kindValues: readonly Schema.Top[] = Object.values(kindSchemas);

type FieldSchemas = Record<string, Schema.Top>;

type FieldsOf<F extends FieldSchemas> = {
  readonly [K in keyof F]: F[K]["Type"];
};

type ErrorOf<F extends FieldSchemas> = Error & {
  readonly _tag: string;
  readonly [errorBrand]: true;
} & FieldsOf<F>;

interface ErrorSpec<Tag extends string, F extends FieldSchemas> {
  readonly fields: F;
  readonly message: (fields: FieldsOf<F>) => string;
  readonly tag: Tag;
}

const declaredFields = <F extends FieldSchemas>(
  fields: F,
  source: object
): FieldsOf<F> =>
  Object.fromEntries(
    Object.keys(fields).map((name) => [name, Reflect.get(source, name)])
  ) as FieldsOf<F>;

const defineError = <const Tag extends string, const F extends FieldSchemas>(
  spec: ErrorSpec<Tag, F>
) => {
  const { fields, tag } = spec;

  for (const schema of Object.values(fields)) {
    if (!kindValues.includes(schema)) {
      throw new Error(`${tag} declares a field that is not a primitive kind.`);
    }
  }

  const wire = Schema.TaggedStruct(tag, fields);

  const ErrorClass = class extends Error {
    declare readonly [errorBrand]: true;
    declare readonly _tag: Tag;
  };

  const instance = Schema.declare<ErrorOf<F>>(
    (value): value is ErrorOf<F> => value instanceof ErrorClass
  );

  const build = (
    input: object
  ): InstanceType<typeof ErrorClass> & FieldsOf<F> =>
    Object.assign(new ErrorClass(), declaredFields(fields, input));

  const schema = wire.pipe(
    Schema.decodeTo(instance, {
      decode: SchemaGetter.transform(build),
      encode: SchemaGetter.transform((value: object) => ({
        ...declaredFields(fields, value),
        _tag: tag,
      })),
    })
  );

  Object.defineProperties(ErrorClass.prototype, {
    constructor: { value: undefined },
    message: {
      get(this: object): string {
        return spec.message(declaredFields(fields, this));
      },
    },
    name: { value: tag },
    _tag: { value: tag },
  });

  return { fields, schema, tag };
};

const conversionInputInvalidError = defineError({
  fields: {
    from: kindSchemas.currency,
    reason: kindSchemas.reason,
    to: kindSchemas.currency,
  },
  message: ({ from, reason, to }) =>
    `Converting ${from} into ${to} needs whole minor units that a number holds exactly, but this amount is ${reason}. Fix: pass a safe integer number of minor units.`,
  tag: "ConversionInputInvalid",
});

export type ConversionInputInvalidFields = Exact<
  FieldsOf<typeof conversionInputInvalidError.fields>
>;

export type ConversionInputInvalid = ErrorOf<
  typeof conversionInputInvalidError.fields
>;

const conversionOverflowError = defineError({
  fields: {
    baseCurrency: kindSchemas.currency,
    currency: kindSchemas.currency,
    minor: kindSchemas.minor,
    rate: kindSchemas.text,
  },
  message: ({ baseCurrency, currency, minor, rate }) =>
    `Converting ${minor} ${currency} at ${rate} into ${baseCurrency} leaves the safe integer range. Fix: convert a smaller amount, or store the amount in ${currency}.`,
  tag: "ConversionOverflow",
});

export type ConversionOverflowFields = Exact<
  FieldsOf<typeof conversionOverflowError.fields>
>;

export type ConversionOverflow = ErrorOf<typeof conversionOverflowError.fields>;

const currencyMismatchError = defineError({
  fields: {
    left: kindSchemas.currency,
    right: kindSchemas.currency,
  },
  message: ({ left, right }) =>
    `Cannot combine ${left} with ${right}. Fix: convert both amounts into one currency with convert().`,
  tag: "CurrencyMismatch",
});

export type CurrencyMismatchFields = Exact<
  FieldsOf<typeof currencyMismatchError.fields>
>;

export type CurrencyMismatch = ErrorOf<typeof currencyMismatchError.fields>;

const moneyOverflowError = defineError({
  fields: {
    currency: kindSchemas.currency,
    left: kindSchemas.minor,
    operation: kindSchemas.operation,
    right: kindSchemas.minor,
  },
  message: ({ currency, left, operation, right }) =>
    `${left} ${operation === "add" ? "+" : "-"} ${right} in ${currency} leaves the safe integer range. Fix: split the amount across two rows, or add the parts in another order that stays in range.`,
  tag: "MoneyOverflow",
});

export type MoneyOverflowFields = Exact<
  FieldsOf<typeof moneyOverflowError.fields>
>;

export type MoneyOverflow = ErrorOf<typeof moneyOverflowError.fields>;

const rateOnSameCurrencyError = defineError({
  fields: {
    currency: kindSchemas.currency,
  },
  message: ({ currency }) =>
    `A ${currency} amount cannot be converted into ${currency} with a rate. Fix: store it with SameCurrency and no rate.`,
  tag: "RateOnSameCurrency",
});

export type RateOnSameCurrencyFields = Exact<
  FieldsOf<typeof rateOnSameCurrencyError.fields>
>;

export type RateOnSameCurrency = ErrorOf<typeof rateOnSameCurrencyError.fields>;

const rateUnavailableError = defineError({
  fields: {
    from: kindSchemas.currency,
    to: kindSchemas.currency,
  },
  message: ({ from, to }) =>
    `No ${from} to ${to} rate is known. Fix: store the rate before converting, or keep the amount in ${from}.`,
  tag: "RateUnavailable",
});

export type RateUnavailableFields = Exact<
  FieldsOf<typeof rateUnavailableError.fields>
>;

export type RateUnavailable = ErrorOf<typeof rateUnavailableError.fields>;

export interface ErrorCodecs {
  readonly conversionInputInvalid: ModelCodec<ConversionInputInvalid, unknown>;
  readonly conversionOverflow: ModelCodec<ConversionOverflow, unknown>;
  readonly currencyMismatch: ModelCodec<CurrencyMismatch, unknown>;
  readonly moneyOverflow: ModelCodec<MoneyOverflow, unknown>;
  readonly rateOnSameCurrency: ModelCodec<RateOnSameCurrency, unknown>;
  readonly rateUnavailable: ModelCodec<RateUnavailable, unknown>;
}

export const errorCodecs: ErrorCodecs = {
  conversionInputInvalid: codec(
    "ConversionInputInvalid",
    conversionInputInvalidError.schema
  ),
  conversionOverflow: codec(
    "ConversionOverflow",
    conversionOverflowError.schema
  ),
  currencyMismatch: codec("CurrencyMismatch", currencyMismatchError.schema),
  moneyOverflow: codec("MoneyOverflow", moneyOverflowError.schema),
  rateOnSameCurrency: codec(
    "RateOnSameCurrency",
    rateOnSameCurrencyError.schema
  ),
  rateUnavailable: codec("RateUnavailable", rateUnavailableError.schema),
};

const make = <T>(
  handle: ModelCodec<T, unknown>,
  tag: string,
  input: object
): T => {
  const failure = assertNoForeignKeys(input, handle as Handle);

  if (failure !== undefined) {
    throw failure;
  }

  return parse(handle, { _tag: tag, ...input });
};

export const conversionInputInvalid = (
  input: ConversionInputInvalidFields
): ConversionInputInvalid =>
  make(errorCodecs.conversionInputInvalid, "ConversionInputInvalid", input);

export const conversionOverflow = (
  input: ConversionOverflowFields
): ConversionOverflow =>
  make(errorCodecs.conversionOverflow, "ConversionOverflow", input);

export const currencyMismatch = (
  input: CurrencyMismatchFields
): CurrencyMismatch =>
  make(errorCodecs.currencyMismatch, "CurrencyMismatch", input);

export const moneyOverflow = (input: MoneyOverflowFields): MoneyOverflow =>
  make(errorCodecs.moneyOverflow, "MoneyOverflow", input);

export const rateOnSameCurrency = (
  input: RateOnSameCurrencyFields
): RateOnSameCurrency =>
  make(errorCodecs.rateOnSameCurrency, "RateOnSameCurrency", input);

export const rateUnavailable = (
  input: RateUnavailableFields
): RateUnavailable =>
  make(errorCodecs.rateUnavailable, "RateUnavailable", input);
