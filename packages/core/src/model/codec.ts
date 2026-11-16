// oxlint-disable anti-slop/no-unknown-parameters -- this module is the boundary that parses untrusted values
// oxlint-disable typescript/no-unsafe-type-assertion -- the schema registry is keyed by handles and the AST is reached through one documented lookup
// oxlint-disable typescript/non-nullable-type-assertion-style, typescript/only-throw-error, anti-slop/require-safety-comment-for-type-assertion -- the stray-key failure is built as a SchemaError so callers see one Result channel
// oxlint-disable anti-slop/no-unknown-parameters, no-throw-literal -- verification throws the same SchemaError that decode returns
// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-reflect-get -- a handle and a schema are told apart by their own decode function, which no schema AST can describe
// oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-unknown-returns -- every public function is an overload whose implementation speaks unknown, so the API surface stays named
// oxlint-disable typescript/no-non-null-assertion -- the branch above already proves the schema argument is present
// oxlint-disable anti-slop/no-shape-in-symbol-names -- the one shape gate is named assertExactShape by the review that asked for it
// oxlint-disable anti-slop/no-index-signature, anti-slop/no-any, anti-slop/no-unsafe-dictionary-type -- the walker reads AST nodes and decoded values that no single declared type describes

import type { SchemaAST } from "effect";
import {
  DateTime,
  Option,
  Predicate,
  Result,
  Schema,
  SchemaIssue,
} from "effect";

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

export interface CodecHandle<T, Encoded> {
  readonly name: string;
  readonly decode: (input: unknown) => Result.Result<T, Schema.SchemaError>;
  readonly encode: (value: T) => Result.Result<Encoded, Schema.SchemaError>;
}

export type ModelCodec<T, Encoded> = CodecHandle<T, Encoded>;

export type Handle = Codec | ModelCodec<unknown, unknown>;

const schemaTable = new WeakMap<object, Codec>();

const isHandle = (value: Handle): value is ModelCodec<unknown, unknown> =>
  typeof Reflect.get(value, "decode") === "function";

export const schemaOf = (handle: Handle): Codec => {
  if (!isHandle(handle)) {
    return handle;
  }

  const schema = schemaTable.get(handle);

  if (schema === undefined) {
    throw new Error(`${handle.name} is not a model codec.`);
  }

  return schema;
};

type Fields = readonly SchemaAST.PropertySignature[];

const ownNamesOf = (value: unknown): readonly string[] =>
  Object.getOwnPropertyNames(value);

const keysOf = (value: Record<string, unknown>): readonly string[] =>
  Object.keys(value);

const namesOf = (value: unknown): ReadonlySet<string> =>
  new Set(ownNamesOf(value));

const someNames = namesOf(Option.some(null));

const noneNames = namesOf(Option.none());

const tagOf = (value: Record<string, unknown>): string | undefined =>
  typeof value._tag === "string" ? value._tag : undefined;

const optionWireNames = (
  value: Record<string, unknown>
): ReadonlySet<string> | undefined => {
  if (Predicate.isTagged(value, "Some")) {
    return new Set([...someNames, "_tag", "_id"]);
  }

  return Predicate.isTagged(value, "None")
    ? new Set([...noneNames, "_tag", "_id"])
    : undefined;
};

const undeclaredName = (
  names: readonly string[],
  declared: ReadonlySet<string>
): string | undefined => names.find((name) => !declared.has(name));

const isTagLiteral = (ast: SchemaAST.AST, tag: string): boolean =>
  Predicate.isTagged(ast, "Literal") &&
  (Array.isArray(ast.literal)
    ? ast.literal.some((literal) => literal === tag)
    : ast.literal === tag);

const fieldsOf = (
  ast: SchemaAST.AST | undefined,
  tag: string | undefined
): Fields | undefined => {
  if (ast === undefined) {
    return undefined;
  }

  if (Predicate.isTagged(ast, "Objects")) {
    return ast.indexSignatures.length === 0
      ? ast.propertySignatures
      : undefined;
  }

  if (Predicate.isTagged(ast, "Declaration")) {
    const [parameter] = ast.typeParameters;

    return ast.typeParameters.length === 1 && parameter !== undefined
      ? fieldsOf(parameter, tag)
      : undefined;
  }

  if (Predicate.isTagged(ast, "Suspend")) {
    return fieldsOf(ast.thunk(), tag);
  }

  if (!Predicate.isTagged(ast, "Union") || tag === undefined) {
    return undefined;
  }

  const tagged = ast.types.find(
    (member) =>
      Predicate.isTagged(member, "Objects") &&
      member.propertySignatures.some(
        (field) => field.name === "_tag" && isTagLiteral(field.type, tag)
      )
  );

  return fieldsOf(tagged, tag);
};

const innerAst = (ast: SchemaAST.AST | undefined): SchemaAST.AST | undefined =>
  ast !== undefined && Predicate.isTagged(ast, "Declaration")
    ? ast.typeParameters[0]
    : undefined;

const elementAst = (
  ast: SchemaAST.AST | undefined
): SchemaAST.AST | undefined =>
  ast !== undefined && Predicate.isTagged(ast, "Arrays")
    ? ast.rest[0]
    : undefined;

const visitChildren = (
  value: Record<string, unknown>,
  seen: WeakSet<object>
): string | undefined => {
  for (const child of Object.values(value)) {
    const stray = strayName(child, undefined, seen);

    if (stray !== undefined) {
      return stray;
    }
  }

  return undefined;
};

const visitFields = (
  value: Record<string, unknown>,
  fields: Fields,
  seen: WeakSet<object>
): string | undefined => {
  const declared = new Set(fields.map((field) => String(field.name)));
  const stray = undeclaredName(keysOf(value), declared);

  if (stray !== undefined) {
    return stray;
  }

  for (const field of fields) {
    const key = String(field.name);

    if (Object.hasOwn(value, key)) {
      const child = strayName(value[key], field.type, seen);

      if (child !== undefined) {
        return child;
      }
    }
  }

  return undefined;
};

const strayName = (
  value: unknown,
  ast: SchemaAST.AST | undefined,
  seen: WeakSet<object>
): string | undefined => {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return undefined;
  }

  seen.add(value);

  if (DateTime.isDateTime(value)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const element = elementAst(ast);

    for (const child of value as readonly unknown[]) {
      const stray = strayName(child, element, seen);

      if (stray !== undefined) {
        return stray;
      }
    }

    return undefined;
  }

  const record = value as Record<string, unknown>;

  if (Option.isOption(record)) {
    const stray = undeclaredName(
      ownNamesOf(record),
      Option.isSome(record) ? someNames : noneNames
    );

    if (stray !== undefined) {
      return stray;
    }

    return Option.isSome(record)
      ? strayName(record.value, innerAst(ast), seen)
      : undefined;
  }

  let wire: ReadonlySet<string> | undefined;

  if (ast !== undefined && Predicate.isTagged(ast, "Declaration")) {
    wire = optionWireNames(record);
  }

  if (wire !== undefined) {
    const stray = undeclaredName(keysOf(record), wire);

    if (stray !== undefined) {
      return stray;
    }

    return strayName(record.value, innerAst(ast), seen);
  }

  const fields = fieldsOf(ast, tagOf(record));

  return fields === undefined
    ? visitChildren(record, seen)
    : visitFields(record, fields, seen);
};

const shapeFailure = (
  value: unknown,
  schema: Codec
): Schema.SchemaError | undefined => {
  const stray = strayName(value, schema.ast, new WeakSet());

  return stray === undefined
    ? undefined
    : new Schema.SchemaError(
        new SchemaIssue.InvalidValue(
          {
            message: `Expected no "${stray}" property: an unknown key is never stripped`,
          },
          value
        )
      );
};

export const assertExactShape = (
  value: unknown,
  handle: Handle
): Schema.SchemaError | undefined => shapeFailure(value, schemaOf(handle));

const strictResult = <A>(
  failure: Schema.SchemaError | undefined,
  run: () => Result.Result<A, Schema.SchemaError>
): Result.Result<A, Schema.SchemaError> =>
  failure === undefined ? run() : Result.fail(failure);

const ensureExactShape = (value: unknown, handle: Handle): void => {
  const failure = assertExactShape(value, handle);

  if (failure !== undefined) {
    throw failure;
  }
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
    decode: (input) =>
      strictResult(assertExactShape(input, handle), () =>
        Schema.decodeUnknownResult(schema, strictOptions)(input)
      ),
    encode: (value) =>
      strictResult(assertExactShape(value, handle), () =>
        Schema.encodeUnknownResult(schema, strictOptions)(value)
      ),
    name,
  };

  schemaTable.set(handle, schema);

  return handle;
}

export function parse<S extends Codec>(schema: S, input: unknown): S["Type"];
export function parse<T, E>(handle: ModelCodec<T, E>, input: unknown): T;
export function parse(handle: unknown, input: unknown): unknown {
  ensureExactShape(input, handle as Handle);

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
  ensureExactShape(value, handle as Handle);

  return Schema.encodeSync(schemaOf(handle as Handle), strictOptions)(value);
}

export function verified<S extends Codec>(schema: S, value: unknown): S["Type"];
export function verified<T, E>(handle: ModelCodec<T, E>, value: unknown): T;
export function verified(handle: unknown, value: unknown): unknown {
  ensureExactShape(value, handle as Handle);

  const schema = schemaOf(handle as Handle);

  return Schema.decodeUnknownSync(
    schema,
    strictOptions
  )(Schema.encodeUnknownSync(schema, strictOptions)(value));
}
