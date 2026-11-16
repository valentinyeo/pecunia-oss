// oxlint-disable anti-slop/no-unknown-parameters -- this module is the boundary that parses untrusted values

import type { Result, SchemaAST } from "effect";
import { Schema } from "effect";

type Codec = Schema.Top & {
  readonly DecodingServices: never;
  readonly EncodingServices: never;
};

type UnionKeys<T> = T extends unknown ? keyof T : never;

type Key = string | number | symbol;

export type Exact<T, AllKeys extends Key = UnionKeys<T>> = T extends unknown
  ? T & Partial<Record<Exclude<AllKeys, keyof T>, never>>
  : never;

export const strictOptions: SchemaAST.ParseOptions = {
  onExcessProperty: "error",
};

export interface ModelCodec<S extends Codec> {
  readonly schema: S;
  readonly decode: (
    input: unknown
  ) => Result.Result<S["Type"], Schema.SchemaError>;
  readonly encode: (
    value: S["Type"]
  ) => Result.Result<S["Encoded"], Schema.SchemaError>;
}

export const codec = <S extends Codec>(schema: S): ModelCodec<S> => ({
  decode: (input) => Schema.decodeUnknownResult(schema, strictOptions)(input),
  encode: (value) => Schema.encodeUnknownResult(schema, strictOptions)(value),
  schema,
});

export const parse = <S extends Codec>(schema: S, input: unknown): S["Type"] =>
  Schema.decodeUnknownSync(schema, strictOptions)(input);

export const render = <S extends Codec>(
  schema: S,
  value: S["Type"]
): S["Encoded"] => Schema.encodeSync(schema, strictOptions)(value);

export const verified = <S extends Codec>(
  schema: S,
  value: unknown
): S["Type"] =>
  parse(schema, Schema.encodeUnknownSync(schema, strictOptions)(value));
