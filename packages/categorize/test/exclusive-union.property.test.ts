import { expect, it } from "@effect/vitest";
import { Option, Schema } from "effect";

import type { ExclusiveUnionTable, UnionFields } from "../src/index.js";
import {
  CategoryIdSchema,
  ClassificationSchema,
  CategorizationSchema,
  DisplayNameSchema,
  LineDecisionSchema,
  MatchFieldSchema,
  MatchTypeSchema,
  PayeeIdSchema,
  ProfileIdSchema,
  RuleDirectionSchema,
  RuleDraftSchema,
  RuleIdSchema,
  RuleSchema,
  exclusiveUnionTables,
} from "../src/index.js";

const CASES = 600;

const ATTEMPTS = 40;

const makeRandom = (seed: number) => {
  let state = (seed % 2_147_483_646) + 1;

  return () => {
    state = (state * 48_271) % 2_147_483_647;

    return state / 2_147_483_647;
  };
};

type Random = ReturnType<typeof makeRandom>;

type Sample = boolean | number | string | null;

interface Payload {
  readonly [field: string]: Payload | Sample;
}

type ObjectSchema = Schema.Codec<object, unknown>;

const schemaNamed = (name: string): ObjectSchema => {
  switch (name) {
    case "CategorizationSchema": {
      return CategorizationSchema;
    }

    case "ClassificationSchema": {
      return ClassificationSchema;
    }

    case "LineDecisionSchema": {
      return LineDecisionSchema;
    }

    case "RuleDraftSchema": {
      return RuleDraftSchema;
    }

    case "RuleSchema": {
      return RuleSchema;
    }

    default: {
      throw new Error(`Add ${name} to the schema map in this test.`);
    }
  }
};

const between = (random: Random, maximum: number) =>
  Math.floor(random() * maximum);

const pick = <Value>(random: Random, values: readonly Value[]): Value => {
  const value = values[between(random, values.length)];

  if (value === undefined) {
    throw new Error("The generator picked from an empty list.");
  }

  return value;
};

const hexDigit = (random: Random) =>
  "0123456789abcdef"[between(random, 16)] ?? "0";

const hex = (random: Random, length: number) =>
  Array.from({ length }, () => hexDigit(random)).join("");

let counter = 0;

const nextUuid = (random: Random): string => {
  counter += 1;

  return `${counter.toString(16).padStart(8, "0")}-${hex(random, 4)}-7${hex(random, 3)}-${pick(random, ["8", "9", "a", "b"])}${hex(random, 3)}-${hex(random, 12)}`;
};

const words = ["Demo", "Example", "Rail", "Cloud", "Studio", "Tax"] as const;

const samples = (random: Random): readonly Sample[] => [
  nextUuid(random),
  `${pick(random, words)} ${between(random, 99)}`,
  between(random, 100_000),
  null,
  true,
];

const atomSample = (
  schema: Schema.Codec<unknown>,
  random: Random
): Sample | undefined => {
  if (schema === Schema.Boolean) {
    return random() < 0.5;
  }

  if (schema === Schema.Int) {
    return between(random, 2000);
  }

  if (
    schema === CategoryIdSchema ||
    schema === PayeeIdSchema ||
    schema === ProfileIdSchema ||
    schema === RuleIdSchema
  ) {
    return nextUuid(random);
  }

  if (schema === DisplayNameSchema) {
    return `${pick(random, words)} ${between(random, 99)}`;
  }

  if (schema === MatchFieldSchema) {
    return pick(random, ["description", "merchant", "reference"]);
  }

  if (schema === MatchTypeSchema) {
    return pick(random, ["contains", "digits_only", "exact", "prefix"]);
  }

  if (schema === RuleDirectionSchema) {
    return pick(random, ["any", "in", "out"]);
  }

  return undefined;
};

const sampleFor = (
  schema: Schema.Codec<unknown>,
  random: Random,
  field: string
): Sample => {
  const atom = atomSample(schema, random);

  if (atom !== undefined) {
    return atom;
  }

  const candidates = samples(random);
  const offset = between(random, candidates.length);
  const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];

  for (const candidate of rotated) {
    if (Option.isSome(Schema.decodeOption(schema)(candidate))) {
      return candidate;
    }
  }

  throw new Error(
    `Add a generator for field "${field}": no sample survives its schema.`
  );
};

const fieldsWithSample = (fields: UnionFields, random: Random) => {
  const value: Record<string, Sample> = {};

  for (const [field, schema] of Object.entries(fields)) {
    value[field] = sampleFor(schema, random, field);
  }

  return value;
};

const decodedOnce = (schema: ObjectSchema, value: Payload) =>
  Option.flatMap(Schema.decodeOption(schema)(value), (decoded) =>
    Option.map(
      Schema.encodeOption(schema)(decoded),
      (encoded) => ({ decoded, encoded }) as const
    )
  );

const decodeError = (
  schema: ObjectSchema,
  value: Payload
): string | undefined => {
  try {
    Schema.decodeSync(schema)(value);

    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const encodeError = (
  schema: ObjectSchema,
  value: Payload
): string | undefined => {
  try {
    Schema.encodeSync(schema)(value);

    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const memberFields = (
  table: ExclusiveUnionTable,
  member: string
): UnionFields => {
  const fields = table.members[member];

  if (fields === undefined) {
    throw new Error(`Union ${table.name} has no member ${member}.`);
  }

  return { ...table.common, ...fields };
};

const foreignFields = (
  table: ExclusiveUnionTable,
  member: string
): readonly string[] => {
  const own = table.members[member] ?? {};
  const names = new Set<string>();

  for (const sibling of Object.values(table.members)) {
    for (const name of Object.keys(sibling)) {
      names.add(name);
    }
  }

  return [...names].filter((name) => !(name in own) && !(name in table.common));
};

const siblingSchema = (table: ExclusiveUnionTable, field: string) => {
  for (const sibling of Object.values(table.members)) {
    const schema = sibling[field];

    if (schema !== undefined) {
      return schema;
    }
  }

  throw new Error(`No member of ${table.name} declares the field "${field}".`);
};

const validSample = (
  table: ExclusiveUnionTable,
  member: string,
  random: Random
): Payload => {
  const schema = schemaNamed(table.name);

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const value: Payload = {
      ...fieldsWithSample(memberFields(table, member), random),
      [table.tag]: member,
    };

    if (Option.isSome(decodedOnce(schema, value))) {
      return value;
    }
  }

  throw new Error(
    `Could not build a valid ${table.name} value for member ${member}.`
  );
};

const tables = exclusiveUnionTables();

const tableNamed = (name: string): ExclusiveUnionTable => {
  const table = tables.find((entry) => entry.name === name);

  if (table === undefined) {
    throw new Error(`The exclusive union table has no entry named ${name}.`);
  }

  return table;
};

it("declares every tagged union the package builds from one table", () => {
  expect(tables.map((entry) => entry.name).toSorted()).toEqual([
    "CategorizationSchema",
    "ClassificationSchema",
    "RuleDraftSchema",
    "RuleSchema",
  ]);
});

for (const [index, table] of tables.entries()) {
  it(`${table.name} refuses every sibling field and round-trips a valid member`, () => {
    const random = makeRandom(index + 11);
    const members = Object.keys(table.members);
    const schema = schemaNamed(table.name);

    for (let testCase = 0; testCase < CASES; testCase += 1) {
      const member = pick(random, members);
      const value = validSample(table, member, random);
      const round = decodedOnce(schema, value);

      if (Option.isNone(round)) {
        throw new Error(
          `${table.name} did not round-trip member ${member}: ${decodeError(schema, value)}`
        );
      }

      expect(
        Schema.decodeUnknownOption(schema)(round.value.encoded),
        `${table.name} did not round-trip member ${member}`
      ).toEqual(Option.some(round.value.decoded));

      expect(
        Schema.encodeOption(schema)(round.value.decoded),
        `${table.name} re-encoded member ${member} differently`
      ).toEqual(Option.some(round.value.encoded));

      for (const field of foreignFields(table, member)) {
        const refused: Payload = {
          ...value,
          [field]: sampleFor(siblingSchema(table, field), random, field),
        };

        const message = decodeError(schema, refused);

        expect(
          message,
          `${table.name} accepted member ${member} with the sibling field "${field}"`
        ).toBeDefined();

        expect(
          message,
          `${table.name} refused member ${member} with "${field}" without naming the field`
        ).toContain(field);

        expect(
          encodeError(schema, refused),
          `${table.name} encoded member ${member} with the sibling field "${field}"`
        ).toBeDefined();
      }
    }
  });
}

it("refuses an excluded line that also carries an applied category", () => {
  const random = makeRandom(7);
  const categorization = tableNamed("CategorizationSchema");
  const classification = tableNamed("ClassificationSchema");
  const decisionSchema = schemaNamed("LineDecisionSchema");
  const categorizationMembers = Object.keys(categorization.members);
  const classificationMembers = Object.keys(classification.members);

  for (let testCase = 0; testCase < CASES; testCase += 1) {
    const categoryMember = pick(random, categorizationMembers);
    const classMember = pick(random, classificationMembers);

    const line: Payload = {
      categorization: {
        ...fieldsWithSample(
          memberFields(categorization, categoryMember),
          random
        ),
        _tag: categoryMember,
      },
      classification: {
        ...fieldsWithSample(memberFields(classification, classMember), random),
        _tag: classMember,
      },
      payeeId: sampleFor(Schema.NullOr(PayeeIdSchema), random, "payeeId"),
    };

    const message = decodeError(decisionSchema, line);

    if (categoryMember === "Applied" && classMember === "Excluded") {
      expect(
        message,
        "LineDecisionSchema accepted an excluded line that also carries an applied category"
      ).toBeDefined();

      expect(
        encodeError(decisionSchema, line),
        "LineDecisionSchema encoded an excluded line that also carries an applied category"
      ).toBeDefined();

      continue;
    }

    expect(
      message,
      `LineDecisionSchema refused a legal ${classMember} line with ${categoryMember}`
    ).toBeUndefined();

    const round = decodedOnce(decisionSchema, line);

    if (Option.isNone(round)) {
      throw new Error(
        `LineDecisionSchema did not round-trip a ${classMember} line with ${categoryMember}.`
      );
    }

    expect(
      Schema.decodeUnknownOption(decisionSchema)(round.value.encoded),
      `LineDecisionSchema changed a ${classMember} line with ${categoryMember}`
    ).toEqual(Option.some(round.value.decoded));
  }

  const excludedWithCategory: Payload = {
    ...CategorizationSchema.cases.None.make({}),
    categoryId: Schema.decodeSync(CategoryIdSchema)(nextUuid(random)),
    classification: ClassificationSchema.cases.Excluded.make({
      ruleId: Schema.decodeSync(RuleIdSchema)(nextUuid(random)),
    }),
    payeeId: null,
  };

  const message = decodeError(decisionSchema, excludedWithCategory);

  expect(message, "a no-rule categorization kept a category").toBeDefined();

  expect(message, "the failure did not point at the categorization").toContain(
    "categorization"
  );
});
