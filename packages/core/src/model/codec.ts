// oxlint-disable anti-slop/no-unknown-parameters -- this module is the boundary that parses untrusted values
// oxlint-disable typescript/no-unsafe-type-assertion -- the schema registry is keyed by handles and the AST is reached through one documented lookup
// oxlint-disable typescript/non-nullable-type-assertion-style, typescript/only-throw-error, anti-slop/require-safety-comment-for-type-assertion -- the stray-key failure is built as a SchemaIssue so callers see one Result channel
// oxlint-disable anti-slop/no-unknown-parameters, no-throw-literal -- verification throws the same SchemaError that decode returns
// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-reflect-get -- a handle and a schema are told apart by their own decode function, which no schema AST can describe
// oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-unknown-returns -- every public function is an overload whose implementation speaks unknown, so the API surface stays named
// oxlint-disable typescript/no-non-null-assertion -- the branch above already proves the schema argument is present

import type { SchemaAST } from "effect";
import { Option, Result, Schema, SchemaIssue } from "effect";

type Codec = Schema.Top & {
  readonly DecodingServices: never;
  readonly EncodingServices: never;
};

type UnionKeys<T> = T extends unknown ? keyof T : never;

type Key = string | number | symbol;

declare const opaque: unique symbol;

export type Opaque<T> = T & { readonly [opaque]: never };

export type Exact<T, AllKeys extends Key = UnionKeys<T>> = T extends unknown
  ? T & Partial<Record<Exclude<AllKeys, keyof T>, never>>
  : never;

export const strictOptions: SchemaAST.ParseOptions = {
  onExcessProperty: "error",
};

export interface ModelCodec<T, Encoded> {
  readonly name: string;
  readonly decode: (input: unknown) => Result.Result<T, Schema.SchemaError>;
  readonly encode: (value: T) => Result.Result<Encoded, Schema.SchemaError>;
}

export type Handle = Codec | ModelCodec<never, unknown>;

const schemas = new WeakMap<object, Codec>();

const isHandle = (value: Handle): value is ModelCodec<never, unknown> =>
  typeof Reflect.get(value, "decode") === "function";

const strayKey = (
  value: unknown,
  seen: WeakSet<object>
): string | undefined => {
  if (Array.isArray(value)) {
    for (const child of value) {
      const stray = strayKey(child, seen);

      if (stray !== undefined) {
        return stray;
      }
    }

    return undefined;
  }

  if (typeof value !== "object" || value === null || seen.has(value)) {
    return undefined;
  }

  seen.add(value);

  if (Option.isOption(value)) {
    for (const key of Object.keys(value)) {
      if (key !== "_tag" && key !== "value") {
        return key;
      }
    }
  }

  for (const child of Object.values(value)) {
    const stray = strayKey(child, seen);

    if (stray !== undefined) {
      return stray;
    }
  }

  return undefined;
};

const strayError = (value: unknown): Schema.SchemaError | undefined => {
  const stray = strayKey(value, new WeakSet());

  return stray === undefined
    ? undefined
    : (new SchemaIssue.InvalidValue(
        {
          message: `Expected no "${stray}" property: an unknown key is never stripped`,
        },
        value
      ) as unknown as Schema.SchemaError);
};

export const schemaOf = (handle: Handle): Codec => {
  if (!isHandle(handle)) {
    return handle;
  }

  const schema = schemas.get(handle);

  if (schema === undefined) {
    throw new Error(`${handle.name} is not a model codec.`);
  }

  return schema;
};

export function codec<S extends Codec>(
  schema: S
): ModelCodec<S["Type"], S["Encoded"]>;
export function codec<S extends Codec>(
  name: string,
  schema: S
): ModelCodec<S["Type"], S["Encoded"]>;
export function codec<S extends Codec>(
  nameOrSchema: string | S,
  maybeSchema?: S
): ModelCodec<S["Type"], S["Encoded"]> {
  const name = typeof nameOrSchema === "string" ? nameOrSchema : "Model";

  const schema = (
    typeof nameOrSchema === "string" ? maybeSchema : nameOrSchema
  )!;

  const handle: ModelCodec<S["Type"], S["Encoded"]> = {
    decode: (input) => {
      const stray = strayError(input);

      return stray === undefined
        ? Schema.decodeUnknownResult(schema, strictOptions)(input)
        : Result.fail(stray);
    },
    encode: (value) => {
      const stray = strayError(value);

      return stray === undefined
        ? Schema.encodeUnknownResult(schema, strictOptions)(value)
        : Result.fail(stray);
    },
    name,
  };

  schemas.set(handle, schema);

  return handle;
}

export function parse<S extends Codec>(schema: S, input: unknown): S["Type"];
export function parse<T, E>(handle: ModelCodec<T, E>, input: unknown): T;
export function parse(handle: unknown, input: unknown): unknown {
  return Schema.decodeUnknownSync(
    schemaOf(handle as Handle),
    strictOptions
  )(input);
}

export function render<S extends Codec>(
  schema: S,
  value: S["Type"]
): S["Encoded"];
export function render<T, E>(handle: ModelCodec<T, E>, value: T): E;
export function render(handle: unknown, value: unknown): unknown {
  return Schema.encodeSync(schemaOf(handle as Handle), strictOptions)(value);
}

export function verified<S extends Codec>(schema: S, value: unknown): S["Type"];
export function verified<T, E>(handle: ModelCodec<T, E>, value: unknown): T;
export function verified(handle: unknown, value: unknown): unknown {
  const stray = strayKey(value, new WeakSet());

  if (stray !== undefined) {
    throw new SchemaIssue.InvalidValue(
      {
        message: `Expected no "${stray}" property: an unknown key is never stripped`,
      },
      value
    );
  }

  const schema = schemaOf(handle as Handle);

  return Schema.decodeUnknownSync(
    schema,
    strictOptions
  )(Schema.encodeUnknownSync(schema, strictOptions)(value));
}
