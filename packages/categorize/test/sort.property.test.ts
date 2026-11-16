import { expect, it } from "@effect/vitest";
import { Option, Predicate, Schema } from "effect";

import {
  AliasIdSchema,
  CategoryIdSchema,
  ClassificationSchema,
  CategorizationSchema,
  LineDecisionSchema,
  MerchantAliasSchema,
  MinorUnitsSchema,
  PayeeIdSchema,
  PayeeSchema,
  ProfileIdSchema,
  RuleIdSchema,
  RuleSchema,
  isCategorizeRule,
  isClassificationRule,
  normalizeName,
  sortLine,
} from "../src/index.js";
import type {
  AliasMatchType,
  Category,
  Classification,
  ClassificationRule,
  LineDecision,
  LineDirection,
  MatchableLine,
  MerchantAlias,
  Payee,
  PayeeKind,
  Rule,
  SpendingType,
} from "../src/index.js";

const CASES = 500;

const makeRandom = (seed: number) => {
  let state = (seed % 2_147_483_646) + 1;

  return () => {
    state = (state * 48_271) % 2_147_483_647;

    return state / 2_147_483_647;
  };
};

type Random = ReturnType<typeof makeRandom>;

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

const nextUuid = (random: Random) => {
  counter += 1;

  return `${counter.toString(16).padStart(8, "0")}-${hex(random, 4)}-7${hex(random, 3)}-${pick(random, ["8", "9", "a", "b"])}${hex(random, 3)}-${hex(random, 12)}`;
};

const profileId = Schema.decodeSync(ProfileIdSchema)(
  "0192f0c1-0001-702d-8484-48490b729601"
);

const merchantNames = [
  "Demo Cloud Hosting",
  "Example Ltd",
  "Demo Coffee",
  "Demo Rail",
  "Demo Design Tool",
] as const;

const referenceTexts = [
  "",
  "0000123",
  "TAX-VAT-2025",
  "INV-42",
  "9990",
] as const;

const descriptionTexts = [
  "",
  "Cloud hosting",
  "Refund from Demo Design Tool",
  "Transfer to Demo Person",
  "Moved to Demo Savings",
  "Client lunch",
] as const;

const spendingTypes: readonly SpendingType[] = [
  "business",
  "mixed",
  "personal",
];

const payeeKinds: readonly PayeeKind[] = [
  "client",
  "employer",
  "merchant",
  "tax_authority",
];

const directions: readonly LineDirection[] = ["in", "neutral", "out"];

const matchFields = ["description", "merchant", "reference"] as const;

const matchTypes = ["contains", "digits_only", "exact", "prefix"] as const;

const directionsForRules = ["any", "in", "out"] as const;

const matchTypesForAliases: readonly AliasMatchType[] = [
  "contains",
  "exact",
  "prefix",
];

const classificationKinds = [
  "exclude",
  "income_client",
  "internal_transfer",
  "refund",
  "self_transfer",
  "tax_payment",
] as const;

const patternPool = ["Demo", "Example", "Not On Any Line", "TAX"] as const;

const patternFor = (random: Random, value: string) => {
  if (value.trim().length === 0) {
    return pick(random, patternPool);
  }

  const words = value.split(" ").filter((word) => word.length > 0);

  return pick(random, [
    value,
    value.toUpperCase(),
    value.toLowerCase(),
    words[0] ?? value,
    words.slice(0, -1).join(" ") || value,
    `  ${value}  `,
    ...patternPool,
  ]);
};

const digitsPatternFor = (random: Random, value: string) => {
  const found = value.replaceAll(/\D/gu, "");

  const candidates = [
    found,
    found.slice(0, 2),
    found.slice(-2),
    "0",
    "0000",
    "123",
    "9999",
  ].filter((candidate) => /\d/u.test(candidate));

  return pick(random, candidates);
};

const amountFor = (random: Random) => {
  const magnitude = between(random, 1_000_000);

  return Schema.decodeSync(MinorUnitsSchema)(
    pick(random, [magnitude, -magnitude, 0])
  );
};

interface GeneratedCase {
  readonly aliases: readonly MerchantAlias[];
  readonly classifications: readonly ClassificationRule[];
  readonly categorizes: readonly Rule[];
  readonly line: MatchableLine;
  readonly payees: readonly Payee[];
  readonly rules: readonly Rule[];
}

const generateCategories = (random: Random) =>
  Array.from({ length: 1 + between(random, 3) }, () => ({
    archived: random() < 0.2,
    color: pick(random, ["accent", "ink"]),
    id: Schema.decodeSync(CategoryIdSchema)(nextUuid(random)),
    name: `Category ${hex(random, 4)}`,
    parentId: null,
    profileId,
    spendingType: pick(random, spendingTypes),
  }));

const generatePayees = (random: Random) =>
  Array.from({ length: 1 + between(random, 3) }, () => {
    const name = pick(random, merchantNames);

    return Schema.decodeSync(PayeeSchema)({
      archived: random() < 0.2,
      defaultCategoryId: null,
      id: Schema.decodeSync(PayeeIdSchema)(nextUuid(random)),
      kind: pick(random, payeeKinds),
      name,
      normalizedName: normalizeName(name),
      profileId,
    });
  });

const generateAliases = (
  random: Random,
  payees: readonly Payee[],
  merchant: string
): readonly MerchantAlias[] =>
  Array.from({ length: between(random, 5) }, () => {
    const payee = pick(random, payees);
    const source = random() < 0.8 ? merchant : payee.name;

    return Schema.decodeSync(MerchantAliasSchema)({
      id: Schema.decodeSync(AliasIdSchema)(nextUuid(random)),
      matchType: pick(random, matchTypesForAliases),
      pattern: patternFor(random, source),
      payeeId: payee.id,
      profileId,
    });
  });

const generateRules = (
  random: Random,
  cases: {
    readonly categories: readonly Category[];
    readonly line: MatchableLine;
    readonly payees: readonly Payee[];
  }
): readonly Rule[] =>
  Array.from({ length: 2 + between(random, 8) }, () => {
    const matchField = pick(random, matchFields);
    const matchType = pick(random, matchTypes);
    const source = fieldOf(cases.line, matchField);

    const pattern =
      matchType === "digits_only"
        ? digitsPatternFor(random, source)
        : patternFor(
            random,
            random() < 0.85 || source.trim().length === 0
              ? source
              : pick(random, merchantNames)
          );

    const minAmount = between(random, 20_000);

    const bounds =
      random() < 0.2
        ? {
            maxAmount: minAmount + 10_000 + between(random, 900_000),
            minAmount,
          }
        : { maxAmount: null, minAmount: null };

    const common = {
      direction: pick(random, directionsForRules),
      enabled: random() < 0.7,
      id: Schema.decodeSync(RuleIdSchema)(nextUuid(random)),
      matchField,
      matchType,
      pattern,
      priority: between(random, 4),
      profileId,
      ...bounds,
    };

    const kind = pick(random, ["categorize", ...classificationKinds] as const);

    switch (kind) {
      case "categorize": {
        return Schema.decodeSync(RuleSchema)({
          ...common,
          categoryId: pick(random, cases.categories).id,
          kind,
        });
      }

      case "income_client": {
        return Schema.decodeSync(RuleSchema)({
          ...common,
          clientPayeeId: pick(random, cases.payees).id,
          kind,
        });
      }

      case "self_transfer": {
        return Schema.decodeSync(RuleSchema)({
          ...common,
          counterpartProfileId: null,
          kind,
        });
      }

      case "tax_payment": {
        return Schema.decodeSync(RuleSchema)({
          ...common,
          kind,
          obligationKind: pick(random, ["corporation_tax", "vat"]),
        });
      }

      case "exclude":
      case "internal_transfer":
      case "refund": {
        return Schema.decodeSync(RuleSchema)({ ...common, kind });
      }

      default: {
        return kind satisfies never;
      }
    }
  });

const generate = (seed: number): GeneratedCase => {
  const random = makeRandom(seed);

  const line: MatchableLine = {
    description: pick(random, descriptionTexts),
    direction: pick(random, directions),
    merchant: random() < 0.8 ? pick(random, merchantNames) : "Demo Mystery",
    minorAmount: amountFor(random),
    reference: pick(random, referenceTexts),
  };

  const categories = generateCategories(random);
  const payees = generatePayees(random);
  const aliases = generateAliases(random, payees, line.merchant);
  const rules = generateRules(random, { categories, line, payees });

  return {
    aliases,
    categorizes: rules.filter((rule) => rule.kind === "categorize"),
    classifications: rules.filter(
      (rule): rule is ClassificationRule => rule.kind !== "categorize"
    ),
    line,
    payees,
    rules,
  };
};

const normalize = (text: string) =>
  text.normalize("NFKC").toLowerCase().replaceAll(/\s+/gu, " ").trim();

const digits = (text: string) => text.replaceAll(/\D/gu, "");

const fieldOf = (line: MatchableLine, field: Rule["matchField"]): string => {
  const fields: Record<Rule["matchField"], string> = {
    description: line.description,
    merchant: line.merchant,
    reference: line.reference,
  };

  return fields[field];
};

const independentRuleMatch = (rule: Rule, line: MatchableLine) => {
  if (!rule.enabled) {
    return false;
  }

  if (rule.direction === "in" && line.direction !== "in") {
    return false;
  }

  if (rule.direction === "out" && line.direction !== "out") {
    return false;
  }

  const value = fieldOf(line, rule.matchField);
  const magnitude = Math.abs(line.minorAmount);

  if (Option.isSome(rule.minAmount) && magnitude < rule.minAmount.value) {
    return false;
  }

  if (Option.isSome(rule.maxAmount) && magnitude > rule.maxAmount.value) {
    return false;
  }

  switch (rule.matchType) {
    case "contains": {
      return normalize(value).includes(normalize(rule.pattern));
    }

    case "digits_only": {
      const needle = digits(rule.pattern);

      return needle.length > 0 && digits(value).includes(needle);
    }

    case "exact": {
      return normalize(value) === normalize(rule.pattern);
    }

    case "prefix": {
      return normalize(value).startsWith(normalize(rule.pattern));
    }

    default: {
      return rule.matchType satisfies never;
    }
  }
};

const better = <Selected extends Rule>(
  candidate: Selected,
  current: Selected
): Selected => {
  if (candidate.priority !== current.priority) {
    return candidate.priority > current.priority ? candidate : current;
  }

  return candidate.id <= current.id ? candidate : current;
};

const oracleWinner = <Selected extends Rule>(
  rules: readonly Rule[],
  keep: (rule: Rule) => rule is Selected,
  line: MatchableLine
): Selected | undefined => {
  let winner: Selected | undefined;

  for (const rule of rules) {
    if (!keep(rule) || !independentRuleMatch(rule, line)) {
      continue;
    }

    const selected: Selected = rule;

    winner = winner === undefined ? selected : better(selected, winner);
  }

  return winner;
};

const aliasSpecificity: Readonly<Record<AliasMatchType, number>> = {
  contains: 2,
  exact: 0,
  prefix: 1,
};

const independentAliasMatch = (alias: MerchantAlias, line: MatchableLine) => {
  const value = normalize(line.merchant);
  const pattern = normalize(alias.pattern);

  switch (alias.matchType) {
    case "contains": {
      return value.includes(pattern);
    }

    case "exact": {
      return value === pattern;
    }

    case "prefix": {
      return value.startsWith(pattern);
    }

    default: {
      return alias.matchType satisfies never;
    }
  }
};

const oraclePayee = (
  aliases: readonly MerchantAlias[],
  line: MatchableLine
) => {
  let winner: MerchantAlias | undefined;

  for (const alias of aliases) {
    if (!independentAliasMatch(alias, line)) {
      continue;
    }

    if (winner === undefined) {
      winner = alias;
      continue;
    }

    const aliasRank = aliasSpecificity[alias.matchType];
    const winnerRank = aliasSpecificity[winner.matchType];
    const aliasLength = normalize(alias.pattern).length;
    const winnerLength = normalize(winner.pattern).length;

    if (
      aliasRank < winnerRank ||
      (aliasRank === winnerRank && aliasLength > winnerLength) ||
      (aliasRank === winnerRank &&
        aliasLength === winnerLength &&
        alias.id <= winner.id)
    ) {
      winner = alias;
    }
  }

  return winner;
};

const shuffled = <Value>(random: Random, values: readonly Value[]) => {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = between(random, index + 1);
    const held = copy[index];
    const swap = copy[other];

    if (held === undefined || swap === undefined) {
      continue;
    }

    copy[index] = swap;
    copy[other] = held;
  }

  return copy;
};

const expectedClassification = (
  winner: ClassificationRule | undefined
): Classification => {
  if (winner === undefined) {
    return ClassificationSchema.cases.None.make({});
  }

  switch (winner.kind) {
    case "exclude": {
      return ClassificationSchema.cases.Excluded.make({ ruleId: winner.id });
    }

    case "income_client": {
      return ClassificationSchema.cases.Income.make({
        clientPayeeId: winner.clientPayeeId,
        ruleId: winner.id,
      });
    }

    case "internal_transfer": {
      return ClassificationSchema.cases.InternalTransfer.make({
        ruleId: winner.id,
      });
    }

    case "refund": {
      return ClassificationSchema.cases.Refund.make({ ruleId: winner.id });
    }

    case "self_transfer": {
      return ClassificationSchema.cases.SelfTransfer.make({
        counterpartProfileId: Option.getOrNull(winner.counterpartProfileId),
        ruleId: winner.id,
      });
    }

    case "tax_payment": {
      return ClassificationSchema.cases.TaxPayment.make({
        obligationKind: winner.obligationKind,
        ruleId: winner.id,
      });
    }

    default: {
      return winner satisfies never;
    }
  }
};

const expectWinnerMatches = (winner: Rule | undefined, line: MatchableLine) => {
  if (winner !== undefined) {
    expect(independentRuleMatch(winner, line)).toBe(true);
  }
};

it("sorts the same line to the same decision whatever the catalog order", () => {
  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(index);
    const generated = generate(index);
    const { line } = generated;

    const decision = sortLine(line, {
      aliases: generated.aliases,
      rules: generated.rules,
    });

    expect(
      sortLine(line, { aliases: generated.aliases, rules: generated.rules })
    ).toEqual(decision);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(
        sortLine(line, {
          aliases: shuffled(random, generated.aliases),
          rules: shuffled(random, generated.rules),
        })
      ).toEqual(decision);
    }
  }
});

it("lets the highest priority matching rule win and breaks ties by id", () => {
  for (let index = 0; index < CASES; index += 1) {
    const generated = generate(index);
    const { line } = generated;

    const decision = sortLine(line, {
      aliases: generated.aliases,
      rules: generated.rules,
    });

    const categorizeWinner = oracleWinner(
      generated.rules,
      isCategorizeRule,
      line
    );

    const classificationWinner = oracleWinner(
      generated.rules,
      isClassificationRule,
      line
    );

    expectWinnerMatches(categorizeWinner, line);
    expectWinnerMatches(classificationWinner, line);

    for (const rule of generated.rules) {
      if (!independentRuleMatch(rule, line)) {
        continue;
      }

      if (rule.kind === "categorize" && categorizeWinner !== undefined) {
        expect(
          rule.priority < categorizeWinner.priority ||
            (rule.priority === categorizeWinner.priority &&
              rule.id >= categorizeWinner.id)
        ).toBe(true);
      }

      if (rule.kind !== "categorize" && classificationWinner !== undefined) {
        expect(
          rule.priority < classificationWinner.priority ||
            (rule.priority === classificationWinner.priority &&
              rule.id >= classificationWinner.id)
        ).toBe(true);
      }
    }

    expect(decision.classification).toEqual(
      expectedClassification(classificationWinner)
    );

    const excluded = classificationWinner?.kind === "exclude";

    expect(decision.categorization).toEqual(
      categorizeWinner === undefined || excluded
        ? CategorizationSchema.cases.None.make({})
        : CategorizationSchema.cases.Applied.make({
            categoryId: categorizeWinner.categoryId,
            ruleId: categorizeWinner.id,
          })
    );
  }
});

it("resolves the payee from the most specific alias that matches", () => {
  for (let index = 0; index < CASES; index += 1) {
    const generated = generate(index);
    const { line } = generated;

    const decision = sortLine(line, {
      aliases: generated.aliases,
      rules: generated.rules,
    });

    const winner = oraclePayee(generated.aliases, line);

    expect(decision.payeeId).toBe(winner?.payeeId ?? null);

    if (decision.payeeId !== null) {
      expect(
        generated.payees.some((payee) => payee.id === decision.payeeId)
      ).toBe(true);
    }
  }
});

it("emits a decision that parses against the decision schema", () => {
  for (let index = 0; index < CASES; index += 1) {
    const generated = generate(index);

    const decision = sortLine(generated.line, {
      aliases: generated.aliases,
      rules: generated.rules,
    });

    const parsed: LineDecision =
      Schema.decodeSync(LineDecisionSchema)(decision);

    expect(parsed).toEqual(decision);
  }
});

it("generates cases that reach every classification and a categorized line", () => {
  const tags = new Set<string>();
  let categorized = 0;
  let aliased = 0;

  for (let index = 0; index < CASES; index += 1) {
    const generated = generate(index);

    const decision = sortLine(generated.line, {
      aliases: generated.aliases,
      rules: generated.rules,
    });

    tags.add(decision.classification._tag);

    if (Predicate.isTagged(decision.categorization, "Applied")) {
      categorized += 1;
    }

    if (decision.payeeId !== null) {
      aliased += 1;
    }
  }

  expect([...tags].toSorted()).toEqual([
    "Excluded",
    "Income",
    "InternalTransfer",
    "None",
    "Refund",
    "SelfTransfer",
    "TaxPayment",
  ]);
  expect(categorized).toBeGreaterThan(CASES / 20);
  expect(aliased).toBeGreaterThan(CASES / 20);
});
