// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-runtime-typeof, anti-slop/no-known-value-widening -- the one wrapper gates arguments and callback results that arrive through the table, so it speaks unknown until the gate accepts them
// oxlint-disable anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- the wrapper hands a gated positional list back to the call it was built from

import { Effect, Result, Schema } from "effect";

import { assertNoForeignKeys, parse } from "./codec.js";
import type { Handle } from "./codec.js";
import type { CurrencyCode, DateOnly, Money } from "./primitives.js";
import {
  CurrencyCodeSchema,
  DateOnlySchema,
  MoneySchema,
} from "./primitives.js";

export interface CarriesArgument {
  readonly domain: string;
  readonly handle: Handle;
  readonly kind: "carries";
  readonly sample: () => unknown;
}

export interface CallbackArgument {
  readonly domain: string;
  readonly handle: Handle;
  readonly kind: "callback";
  readonly sample: () => unknown;
}

export type ArgumentSpec = CallbackArgument | CarriesArgument;

export type Channel = "effect" | "result" | "throwing";

export interface OperationEntry {
  readonly arguments: readonly ArgumentSpec[];
  readonly channel: Channel;
  readonly invoke: (args: readonly unknown[]) => unknown;
  readonly name: string;
  readonly samples: () => readonly unknown[];
}

export interface Operation<Args extends readonly unknown[], A> {
  readonly apply: (...args: Args) => A;
  readonly entry: OperationEntry;
}

export const carries = (
  domain: string,
  handle: Handle,
  sample: () => unknown
): CarriesArgument => ({ domain, handle, kind: "carries", sample });

export const moneySample = (): Money =>
  parse(MoneySchema, { currency: "EUR", minor: 1000 });

export const codeSample = (code = "EUR"): CurrencyCode =>
  parse(CurrencyCodeSchema, code);

export const dateSample = (): DateOnly => parse(DateOnlySchema, "2024-01-30");

export const moneyArgument = () => carries("Money", MoneySchema, moneySample);

export const codeArgument = () =>
  carries("CurrencyCode", CurrencyCodeSchema, codeSample);

export const dateArgument = () =>
  carries("DateOnly", DateOnlySchema, dateSample);

export const callbackResult = (
  domain: string,
  handle: Handle,
  sample: () => unknown
): CallbackArgument => ({ domain, handle, kind: "callback", sample });

type Guarded =
  | { readonly failure: Schema.SchemaError }
  | { readonly gated: readonly unknown[] };

const guardedCallback = (
  spec: CallbackArgument,
  argument: unknown
): unknown => {
  if (typeof argument !== "function") {
    return argument;
  }

  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- a callback is called positionally with the query its own signature names
  const call = argument as (input: unknown) => unknown;

  return (input: unknown): unknown => {
    const result: unknown = call(input);

    const failure = assertNoForeignKeys(result, spec.handle);

    if (failure !== undefined) {
      throw failure;
    }

    return result;
  };
};

const guarded = (
  specs: readonly ArgumentSpec[],
  args: readonly unknown[]
): Guarded => {
  const gated: unknown[] = [];

  for (const [index, spec] of specs.entries()) {
    const argument = args[index];

    if (spec.kind === "callback") {
      gated[index] = guardedCallback(spec, argument);

      continue;
    }

    const failure = assertNoForeignKeys(argument, spec.handle);

    if (failure !== undefined) {
      return { failure };
    }

    gated[index] = argument;
  }

  return { gated };
};

const schemaFailures = (error: unknown): Schema.SchemaError | undefined =>
  error instanceof Schema.SchemaError ? error : undefined;

const entryOf = <Args extends readonly unknown[], A>(
  name: string,
  channel: Channel,
  spec: {
    readonly arguments: readonly ArgumentSpec[];
    readonly samples: () => readonly unknown[];
  },
  apply: (...args: Args) => A
): Operation<Args, A> => ({
  apply,
  entry: {
    arguments: spec.arguments,
    channel,
    invoke: (args) => {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- the table hands the gated call the samples it declared itself
      const loose = apply as (...positional: readonly unknown[]) => unknown;

      return loose(...args);
    },
    name,
    samples: spec.samples,
  },
});

export interface EffectSpec<Args extends readonly unknown[], A, E> {
  readonly arguments: readonly ArgumentSpec[];
  readonly name: string;
  readonly run: (...args: Args) => Effect.Effect<A, E>;
  readonly samples: () => readonly unknown[];
}

export const effectOperation = <Args extends readonly unknown[], A, E>(
  spec: EffectSpec<Args, A, E>
): Operation<Args, Effect.Effect<A, E | Schema.SchemaError>> =>
  entryOf(
    spec.name,
    "effect",
    spec,
    (...args: Args): Effect.Effect<A, E | Schema.SchemaError> => {
      const outcome = guarded(spec.arguments, args);

      if ("failure" in outcome) {
        return Effect.fail(outcome.failure);
      }

      try {
        return spec.run(
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- the gate returned the same positional arguments it was given
          ...(outcome.gated as Args)
        );
      } catch (error) {
        const failure = schemaFailures(error);

        if (failure === undefined) {
          throw error;
        }

        return Effect.fail(failure);
      }
    }
  );

export interface ResultSpec<Args extends readonly unknown[], A, E> {
  readonly arguments: readonly ArgumentSpec[];
  readonly name: string;
  readonly run: (...args: Args) => Result.Result<A, E>;
  readonly samples: () => readonly unknown[];
}

export const resultOperation = <Args extends readonly unknown[], A, E>(
  spec: ResultSpec<Args, A, E>
): Operation<Args, Result.Result<A, E | Schema.SchemaError>> =>
  entryOf(
    spec.name,
    "result",
    spec,
    (...args: Args): Result.Result<A, E | Schema.SchemaError> => {
      const outcome = guarded(spec.arguments, args);

      if ("failure" in outcome) {
        return Result.fail(outcome.failure);
      }

      try {
        return spec.run(
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- the gate returned the same positional arguments it was given
          ...(outcome.gated as Args)
        );
      } catch (error) {
        const failure = schemaFailures(error);

        if (failure === undefined) {
          throw error;
        }

        return Result.fail(failure);
      }
    }
  );

export interface ValueSpec<Args extends readonly unknown[], A> {
  readonly arguments: readonly ArgumentSpec[];
  readonly name: string;
  readonly run: (...args: Args) => A;
  readonly samples: () => readonly unknown[];
}

export const valueOperation = <Args extends readonly unknown[], A>(
  spec: ValueSpec<Args, A>
): Operation<Args, A> =>
  entryOf(spec.name, "throwing", spec, (...args: Args): A => {
    const outcome = guarded(spec.arguments, args);

    if ("failure" in outcome) {
      throw outcome.failure;
    }

    return spec.run(
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- the gate returned the same positional arguments it was given
      ...(outcome.gated as Args)
    );
  });
