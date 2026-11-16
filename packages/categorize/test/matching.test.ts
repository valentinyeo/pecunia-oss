import { expect, it } from "@effect/vitest";
import { Option, Schema } from "effect";

import {
  AliasIdSchema,
  CategoryIdSchema,
  CategorySchema,
  CategorizationSchema,
  ClassificationSchema,
  MatchableLineSchema,
  MerchantAliasSchema,
  MinorUnitsSchema,
  PayeeIdSchema,
  PayeeSchema,
  ProfileIdSchema,
  RuleIdSchema,
  RuleSchema,
  normalizeName,
  ruleMatches,
  sortLine,
} from "../src/index.js";
import type {
  LineDirection,
  ClassificationRule,
  MatchableLine,
  Rule,
} from "../src/index.js";

const uuid = (counter: number) =>
  `0192f0c1-${counter.toString(16).padStart(4, "0")}-7abc-8abc-000000000000`;

const profileId = Schema.decodeSync(ProfileIdSchema)(uuid(1));

const categoryId = (counter: number) =>
  Schema.decodeSync(CategoryIdSchema)(uuid(counter));

const payeeId = (counter: number) =>
  Schema.decodeSync(PayeeIdSchema)(uuid(counter));

const ruleId = (counter: number) =>
  Schema.decodeSync(RuleIdSchema)(uuid(counter));

interface LineOverrides {
  readonly description?: string;
  readonly direction?: LineDirection;
  readonly merchant?: string;
  readonly minorAmount?: number;
  readonly reference?: string;
}

const line = (overrides: LineOverrides = {}): MatchableLine =>
  Schema.decodeSync(MatchableLineSchema)({
    description: "",
    direction: "out",
    merchant: "",
    minorAmount: 0,
    reference: "",
    ...overrides,
  });

const amount = (value: number) => Schema.decodeSync(MinorUnitsSchema)(value);

const baseRule = (counter: number) => ({
  direction: "any" as const,
  enabled: true,
  id: ruleId(counter),
  matchField: "merchant" as const,
  matchType: "contains" as const,
  maxAmount: Option.none(),
  minAmount: Option.none(),
  pattern: "Demo",
  priority: 0,
  profileId,
});

const categorizeRule = (
  counter: number,
  pattern: string,
  category: number,
  priority = 0
): Rule => ({
  ...baseRule(counter),
  categoryId: categoryId(category),
  kind: "categorize",
  pattern,
  priority,
});

const classificationRule = (
  counter: number,
  kind: ClassificationRule["kind"],
  pattern: string,
  priority = 0
): ClassificationRule => {
  const base = { ...baseRule(counter), pattern, priority };

  switch (kind) {
    case "income_client": {
      return { ...base, clientPayeeId: payeeId(counter), kind };
    }

    case "self_transfer": {
      return { ...base, counterpartProfileId: Option.none(), kind };
    }

    case "tax_payment": {
      return { ...base, kind, obligationKind: "vat" };
    }

    case "exclude":
    case "internal_transfer":
    case "refund": {
      return { ...base, kind };
    }

    default: {
      return kind satisfies never;
    }
  }
};

const alias = (
  counter: number,
  pattern: string,
  matchType: "contains" | "exact" | "prefix",
  payee: number
) => ({
  id: Schema.decodeSync(AliasIdSchema)(uuid(counter)),
  matchType,
  pattern,
  payeeId: payeeId(payee),
  profileId,
});

it("matches each match type over the line field it reads", () => {
  const merchant = line({ merchant: "  DEMO  Cloud   Hosting " });

  const matches = (matchType: Rule["matchType"], pattern: string) =>
    ruleMatches({ ...categorizeRule(10, pattern, 2), matchType }, merchant);

  expect(matches("exact", "demo cloud hosting")).toBe(true);
  expect(matches("exact", "demo cloud")).toBe(false);
  expect(matches("prefix", "demo cloud")).toBe(true);
  expect(matches("prefix", "cloud")).toBe(false);
  expect(matches("contains", "cloud")).toBe(true);
  expect(matches("contains", "rail")).toBe(false);
});

it("matches a digits_only rule against the digits of the field", () => {
  const reference = line({ reference: "TAX-VAT-0000123" });

  expect(
    ruleMatches(
      {
        ...categorizeRule(11, "0000", 2),
        matchField: "reference",
        matchType: "digits_only",
      },
      reference
    )
  ).toBe(true);

  expect(
    ruleMatches(
      {
        ...categorizeRule(12, "9999", 2),
        matchField: "reference",
        matchType: "digits_only",
      },
      reference
    )
  ).toBe(false);

  expect(
    ruleMatches(
      {
        ...categorizeRule(13, "0000", 2),
        matchField: "merchant",
        matchType: "digits_only",
      },
      reference
    )
  ).toBe(false);
});

it("refuses a line that is on the wrong side or outside the amount bounds", () => {
  const bounded: Rule = {
    ...categorizeRule(14, "Demo", 2),
    maxAmount: Option.some(amount(50_000)),
    minAmount: Option.some(amount(1000)),
  };

  const at = (minorAmount: number) =>
    ruleMatches(bounded, line({ merchant: "Demo Coffee", minorAmount }));

  expect(at(-1000)).toBe(true);
  expect(at(50_000)).toBe(true);
  expect(at(999)).toBe(false);
  expect(at(50_001)).toBe(false);

  const incoming: Rule = { ...categorizeRule(15, "Demo", 2), direction: "in" };

  const side = (direction: LineDirection) =>
    ruleMatches(incoming, line({ direction, merchant: "Demo Coffee" }));

  expect(side("in")).toBe(true);
  expect(side("out")).toBe(false);
  expect(side("neutral")).toBe(false);
});

it("never matches an archived rule", () => {
  const disabled: Rule = { ...categorizeRule(16, "Demo", 2), enabled: false };

  expect(ruleMatches(disabled, line({ merchant: "Demo Coffee" }))).toBe(false);
});

it("gives an excluded line no category even when a categorize rule matches", () => {
  const decision = sortLine(line({ merchant: "Demo Coffee" }), {
    aliases: [],
    rules: [
      categorizeRule(20, "Demo", 3, 1),
      classificationRule(21, "exclude", "Demo", 9),
    ],
  });

  expect(decision.classification).toEqual(
    ClassificationSchema.cases.Excluded.make({ ruleId: ruleId(21) })
  );
  expect(decision.categorization).toEqual(
    CategorizationSchema.cases.None.make({})
  );
});

it("carries the target of the winning classification rule", () => {
  const decision = sortLine(
    line({ merchant: "Example Ltd", direction: "in" }),
    {
      aliases: [],
      rules: [
        {
          ...classificationRule(30, "income_client", "Example"),
          direction: "in",
        },
        classificationRule(31, "refund", "Example"),
        classificationRule(32, "tax_payment", "Example"),
      ],
    }
  );

  expect(decision.classification).toEqual(
    ClassificationSchema.cases.Income.make({
      clientPayeeId: payeeId(30),
      ruleId: ruleId(30),
    })
  );
});

it("resolves a payee from the most specific matching alias", () => {
  const decision = sortLine(line({ merchant: "DEMO DESIGN TOOL" }), {
    aliases: [
      alias(40, "DEMO", "contains", 4),
      alias(41, "DEMO DESIGN", "prefix", 5),
      alias(42, "DEMO DESIGN TOOL", "exact", 6),
    ],
    rules: [],
  });

  expect(decision.payeeId).toBe(payeeId(6));
});

it("normalizes a payee name the same way the demo seed stores it", () => {
  expect(normalizeName("Demo Cloud Hosting")).toBe("demo-cloud-hosting");
  expect(normalizeName("  Example   Ltd ")).toBe("example-ltd");
  expect(normalizeName("Demo Tax Office")).toBe("demo-tax-office");
  expect(normalizeName("!!!")).toBe("");
});

it("parses a rule, a payee, a category, and an alias at the boundary", () => {
  expect(
    Schema.decodeSync(RuleSchema)({
      ...baseRule(50),
      categoryId: categoryId(2),
      kind: "categorize",
      maxAmount: null,
      minAmount: 0,
    })
  ).toMatchObject({ enabled: true, id: ruleId(50), kind: "categorize" });

  expect(
    Schema.decodeSync(PayeeSchema)({
      archived: false,
      defaultCategoryId: null,
      id: payeeId(3),
      kind: "merchant",
      name: "Demo Coffee",
      normalizedName: normalizeName("Demo Coffee"),
      profileId,
    })
  ).toMatchObject({ kind: "merchant" });

  expect(
    Schema.decodeSync(CategorySchema)({
      archived: false,
      color: "ink",
      id: categoryId(4),
      name: "Meals",
      parentId: null,
      profileId,
      spendingType: "mixed",
    })
  ).toMatchObject({ spendingType: "mixed" });

  expect(
    Schema.decodeSync(MerchantAliasSchema)(alias(51, "DEMO COFFEE", "exact", 3))
  ).toMatchObject({ matchType: "exact" });
});

it("refuses a rule that carries a sibling kind's target", () => {
  const encoded = {
    direction: "any",
    enabled: true,
    id: uuid(60),
    matchField: "merchant",
    matchType: "contains",
    maxAmount: null,
    minAmount: null,
    pattern: "Demo",
    priority: 0,
    profileId: uuid(1),
  };

  expect(
    Schema.decodeUnknownSync(RuleSchema)({ ...encoded, kind: "refund" })
  ).toMatchObject({ kind: "refund" });

  expect(() =>
    Schema.decodeUnknownSync(RuleSchema)({
      ...encoded,
      categoryId: uuid(2),
      kind: "refund",
    })
  ).toThrow();

  expect(() =>
    Schema.decodeUnknownSync(RuleSchema)({
      ...encoded,
      kind: "categorize",
    })
  ).toThrow();

  expect(() =>
    Schema.decodeUnknownSync(RuleSchema)({
      ...encoded,
      kind: "tax_payment",
    })
  ).toThrow();
});

it("refuses bounds and patterns that could never sort a line", () => {
  const encoded = {
    categoryId: uuid(2),
    direction: "any",
    enabled: true,
    id: uuid(61),
    kind: "categorize",
    matchField: "merchant",
    matchType: "contains",
    maxAmount: null,
    minAmount: null,
    pattern: "Demo",
    priority: 0,
    profileId: uuid(1),
  };

  expect(() =>
    Schema.decodeUnknownSync(RuleSchema)({
      ...encoded,
      maxAmount: 100,
      minAmount: 500,
    })
  ).toThrow();

  expect(() =>
    Schema.decodeUnknownSync(RuleSchema)({
      ...encoded,
      maxAmount: 100,
      minAmount: -1,
    })
  ).toThrow();

  expect(() =>
    Schema.decodeUnknownSync(RuleSchema)({
      ...encoded,
      matchType: "digits_only",
      pattern: "TAX",
    })
  ).toThrow();

  expect(() =>
    Schema.decodeUnknownSync(RuleSchema)({ ...encoded, pattern: "   " })
  ).toThrow();
});

it("refuses a category that is its own parent", () => {
  expect(() =>
    Schema.decodeSync(CategorySchema)({
      archived: false,
      color: "ink",
      id: uuid(2),
      name: "Meals",
      parentId: uuid(2),
      profileId: uuid(1),
      spendingType: "mixed",
    })
  ).toThrow();
});
