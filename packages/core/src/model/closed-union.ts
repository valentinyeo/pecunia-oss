import {
  Effect,
  Predicate,
  Result,
  Schema,
  SchemaGetter,
  SchemaIssue,
} from "effect";
import type { SchemaAST } from "effect";

import { strictParseOptions } from "./parse-options.js";

type Member = Schema.Top & {
  readonly DecodingServices: never;
  readonly EncodingServices: never;
};

type TypeOf<S> = S extends { readonly Type: infer T } ? T : never;

type KeysOf<T> = T extends unknown ? keyof T : never;

type AllKeys<Members extends readonly Member[]> = KeysOf<
  TypeOf<Members[number]>
>;

type ClosedMember<
  Members extends readonly Member[],
  Index extends keyof Members,
> = TypeOf<Members[Index]> &
  Partial<
    Record<Exclude<AllKeys<Members>, keyof TypeOf<Members[Index]>>, never>
  >;

type ClosedMembers<Members extends readonly Member[]> = {
  [Index in keyof Members]: Members[Index] & {
    readonly Type: ClosedMember<Members, Index>;
  };
};

const fieldsOf = (
  ast: SchemaAST.AST
): readonly (readonly [string, SchemaAST.AST])[] => {
  if (Predicate.isTagged(ast, "Objects")) {
    return ast.propertySignatures.flatMap((signature) =>
      Predicate.isString(signature.name) &&
      !Predicate.isTagged(signature.type, "Never")
        ? [[signature.name, signature.type] as const]
        : []
    );
  }

  if (Predicate.isTagged(ast, "Union")) {
    return ast.types.flatMap(fieldsOf);
  }

  return [];
};

const ownKeys = (member: Member): readonly string[] => [
  ...new Set([
    ...fieldsOf(Schema.toEncoded(member).ast).map(([key]) => key),
    ...fieldsOf(Schema.toType(member).ast).map(([key]) => key),
  ]),
];

const isSchemaRecord = (value: unknown): value is Record<string, Schema.Top> =>
  Predicate.isObject(value) && Object.values(value).every(Schema.isSchema);

const closedFields = (
  fields: Record<string, Schema.Top>,
  forbidden: readonly string[]
): Schema.Top => {
  const closed: Record<string, Schema.Top> = {};

  for (const [key, field] of Object.entries(fields)) {
    closed[key] = field;
  }

  for (const key of forbidden) {
    if (!Object.hasOwn(closed, key)) {
      closed[key] = Schema.optionalKey(Schema.Never);
    }
  }

  return Schema.Struct(closed);
};

const closedStruct = (
  ast: SchemaAST.AST,
  forbidden: readonly string[]
): Schema.Top => {
  const fields: Record<string, Schema.Top> = {};

  for (const [key, type] of fieldsOf(ast)) {
    fields[key] = Schema.make(type);
  }

  return closedFields(fields, forbidden);
};

const asInvalid = (
  result: Result.Result<unknown, Schema.SchemaError>,
  options: SchemaAST.ParseOptions
): Effect.Effect<unknown, SchemaIssue.Issue> =>
  Result.isFailure(result)
    ? Effect.fail(
        new SchemaIssue.InvalidValue(
          { message: result.failure.message },
          undefined,
          options
        )
      )
    : Effect.succeed(result.success);

const declaredNames = (ast: SchemaAST.AST): readonly string[] =>
  fieldsOf(ast).map(([key]) => key);

const StrayCandidateSchema = Schema.Record(Schema.String, Schema.Unknown);

type StrayCandidate = typeof StrayCandidateSchema.Type;

const declaredFields = (
  ast: SchemaAST.AST
): ReadonlyMap<string, SchemaAST.AST> => new Map(fieldsOf(ast));

const nestedStrayField = (
  ast: SchemaAST.AST,
  value: StrayCandidate
): string | undefined => {
  if (!Predicate.isTagged(ast, "Objects") || ast.indexSignatures.length > 0) {
    return undefined;
  }

  const fields = declaredFields(ast);

  for (const [key, child] of Object.entries(value)) {
    const type = fields.get(key);

    if (!Predicate.isTagged(type, "Objects") || !Predicate.isObject(child)) {
      continue;
    }

    const nested = strayField(
      type,
      Schema.decodeSync(StrayCandidateSchema)(child)
    );

    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
};

const strayField = (
  ast: SchemaAST.AST,
  value: StrayCandidate
): string | undefined => {
  const stray = Object.keys(value).find(
    (key) => !declaredNames(ast).includes(key)
  );

  return stray ?? nestedStrayField(ast, value);
};

const rejectsStrayKeys = <T extends Schema.Top>(schema: T) =>
  schema.check(
    Schema.makeFilter<T["Type"]>((value) => {
      const stray = Predicate.isObject(value)
        ? strayField(
            Schema.toEncoded(schema).ast,
            Schema.decodeSync(StrayCandidateSchema)(value)
          )
        : undefined;

      return stray === undefined ? true : `unexpected field "${stray}"`;
    })
  );

const closedMember = (
  member: Member,
  forbidden: readonly string[]
): Schema.Top => {
  const encoded = Schema.toEncoded(member).ast;
  const decoded = Schema.toType(member).ast;

  if (
    Predicate.isTagged(decoded, "Objects") &&
    Predicate.isTagged(encoded, "Objects") &&
    Predicate.hasProperty(member, "fields") &&
    isSchemaRecord(member.fields)
  ) {
    return rejectsStrayKeys(closedFields(member.fields, forbidden));
  }

  if (!Predicate.isTagged(encoded, "Objects")) {
    return rejectsStrayKeys(member);
  }

  return closedStruct(encoded, forbidden).pipe(
    Schema.decodeTo(Schema.toType(member), {
      decode: SchemaGetter.transformEffect((stored, options) =>
        asInvalid(
          Schema.decodeUnknownResult(member, strictParseOptions)(stored),
          options
        )
      ),
      encode: SchemaGetter.transformEffect((value, options) => {
        const stray = Predicate.isObject(value)
          ? strayField(encoded, Schema.decodeSync(StrayCandidateSchema)(value))
          : undefined;

        return stray === undefined
          ? asInvalid(
              Schema.encodeUnknownResult(member, strictParseOptions)(value),
              options
            )
          : Effect.fail(
              new SchemaIssue.InvalidValue(
                { message: `unexpected field "${stray}"` },
                undefined,
                options
              )
            );
      }),
    })
  );
};

export const closedUnion = <
  const Members extends readonly [Member, ...Member[]],
>(
  members: Members
): Schema.Union<ClosedMembers<Members>> => {
  const declared = members.map(ownKeys);
  const everyKey = [...new Set(declared.flat())];

  const closed = members.map((member, index) =>
    closedMember(
      member,
      everyKey.filter((key) => !(declared[index] ?? []).includes(key))
    )
  );

  const union = Schema.make<Schema.Union<ClosedMembers<Members>>>(
    Schema.Union(closed).ast
  );

  attachMembers(union, closed);

  return union;
};

const attachMembers = (
  union: Schema.Top,
  members: readonly Schema.Top[]
): void => {
  Object.assign(union, { members });
};
