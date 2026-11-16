import { Schema } from "effect";

export type UnionFields = Readonly<Record<string, Schema.Codec<unknown>>>;

export type UnionMembers = Readonly<Record<string, UnionFields>>;

export interface ExclusiveUnionTable {
  readonly common: UnionFields;
  readonly members: UnionMembers;
  readonly name: string;
  readonly tag: string;
}

const tables: ExclusiveUnionTable[] = [];

export const exclusiveUnionTables = (): readonly ExclusiveUnionTable[] => [
  ...tables,
];

type MemberFieldNames<Members extends UnionMembers> =
  keyof Members[keyof Members] & string;

type ForeignFields<
  Members extends UnionMembers,
  Own extends UnionFields,
  Common extends UnionFields,
> = Partial<
  Record<
    Exclude<MemberFieldNames<Members>, keyof Own | keyof Common>,
    Schema.optionalKey<typeof Schema.Never>
  >
>;

export const siblingExclusions = <
  const Common extends UnionFields,
  const Members extends UnionMembers,
  const Own extends UnionFields,
>(
  common: Common,
  members: Members,
  own: Own
): ForeignFields<Members, Own, Common> => {
  const foreign: Record<string, Schema.optionalKey<typeof Schema.Never>> = {};

  for (const sibling of Object.values(members)) {
    for (const field of Object.keys(sibling)) {
      if (!(field in own) && !(field in common)) {
        foreign[field] = Schema.optionalKey(Schema.Never);
      }
    }
  }

  return foreign;
};

export const exclusiveUnion = <
  const Structs extends readonly [Schema.Constraint, ...Schema.Constraint[]],
>(
  name: string,
  tag: string,
  common: UnionFields,
  members: UnionMembers,
  structs: Structs
): Schema.Union<Structs> => {
  tables.push({ common, members, name, tag });

  return Schema.Union(structs);
};

export const exclusiveTaggedUnion = <
  const Cases extends Readonly<Record<string, Schema.Struct.Fields>>,
>(
  name: string,
  common: UnionFields,
  members: UnionMembers,
  cases: Cases
): Schema.TaggedUnion<{
  readonly [Name in keyof Cases & string]: Schema.TaggedStruct<
    Name,
    Cases[Name]
  >;
}> => {
  const memberNames = Object.keys(members);
  const caseNames = Object.keys(cases);

  if (
    caseNames.length === memberNames.length &&
    caseNames.every((caseName) => memberNames.includes(caseName))
  ) {
    tables.push({ common, members, name, tag: "_tag" });
  }

  return Schema.TaggedUnion(cases);
};

export const exclusiveStructUnion = <
  const Schemas extends readonly [Schema.Constraint, ...Schema.Constraint[]],
>(
  schemas: Schemas
): Schema.Union<Schemas> => Schema.Union(schemas);
