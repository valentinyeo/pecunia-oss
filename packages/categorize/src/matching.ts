import { Option, Order, Predicate } from "effect";

import { ClassificationSchema, CategorizationSchema } from "./decision.js";
import type { Classification, LineDecision } from "./decision.js";
import type { MatchableLine } from "./line.js";
import type { AliasMatchType, MerchantAlias } from "./payee.js";
import type {
  CategorizeRule,
  ClassificationRule,
  MatchField,
  MatchType,
  Rule,
} from "./rule.js";
import { isCategorizeRule, isClassificationRule } from "./rule.js";

const normalizeText = (text: string): string =>
  text.normalize("NFKC").toLowerCase().replaceAll(/\s+/gu, " ").trim();

const digitsOf = (text: string): string => text.replaceAll(/\D/gu, "");

export const normalizeName = (name: string): string =>
  normalizeText(name)
    .replaceAll(/[^\p{L}\p{N}]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");

const textMatchers: Readonly<
  Record<MatchType, (value: string, pattern: string) => boolean>
> = {
  contains: (value, pattern) =>
    normalizeText(value).includes(normalizeText(pattern)),
  digits_only: (value, pattern) => {
    const digits = digitsOf(pattern);

    return digits.length > 0 && digitsOf(value).includes(digits);
  },
  exact: (value, pattern) => normalizeText(value) === normalizeText(pattern),
  prefix: (value, pattern) =>
    normalizeText(value).startsWith(normalizeText(pattern)),
};

const aliasSpecificity: Readonly<Record<AliasMatchType, number>> = {
  contains: 2,
  exact: 0,
  prefix: 1,
};

export const ruleOrder: Order.Order<Rule> = Order.combine(
  Order.flip(Order.mapInput(Order.Number, (rule: Rule) => rule.priority)),
  Order.mapInput(Order.String, (rule: Rule) => rule.id)
);

export const aliasOrder: Order.Order<MerchantAlias> = Order.combine(
  Order.mapInput(
    Order.Number,
    (alias: MerchantAlias) => aliasSpecificity[alias.matchType]
  ),
  Order.combine(
    Order.flip(
      Order.mapInput(
        Order.Number,
        (alias: MerchantAlias) => normalizeText(alias.pattern).length
      )
    ),
    Order.mapInput(Order.String, (alias: MerchantAlias) => alias.id)
  )
);

const lineFields = (
  line: MatchableLine
): Readonly<Record<MatchField, string>> => ({
  description: line.description,
  merchant: line.merchant,
  reference: line.reference,
});

export const ruleMatches = (rule: Rule, line: MatchableLine): boolean => {
  if (!rule.enabled) {
    return false;
  }

  if (rule.direction === "in" && line.direction !== "in") {
    return false;
  }

  if (rule.direction === "out" && line.direction !== "out") {
    return false;
  }

  const amount = Math.abs(line.minorAmount);

  if (Option.isSome(rule.minAmount) && amount < rule.minAmount.value) {
    return false;
  }

  if (Option.isSome(rule.maxAmount) && amount > rule.maxAmount.value) {
    return false;
  }

  return textMatchers[rule.matchType](
    lineFields(line)[rule.matchField],
    rule.pattern
  );
};

export const enabledRulesByPriority = (
  rules: readonly Rule[]
): readonly Rule[] => rules.filter((rule) => rule.enabled).toSorted(ruleOrder);

export const payeeForLine = (
  line: MatchableLine,
  aliases: readonly MerchantAlias[]
): Option.Option<MerchantAlias["payeeId"]> => {
  const alias = aliases
    .toSorted(aliasOrder)
    .find((candidate) =>
      textMatchers[candidate.matchType](line.merchant, candidate.pattern)
    );

  return alias === undefined ? Option.none() : Option.some(alias.payeeId);
};

const classificationOf = (rule: ClassificationRule): Classification => {
  switch (rule.kind) {
    case "exclude": {
      return ClassificationSchema.cases.Excluded.make({ ruleId: rule.id });
    }

    case "income_client": {
      return ClassificationSchema.cases.Income.make({
        clientPayeeId: rule.clientPayeeId,
        ruleId: rule.id,
      });
    }

    case "internal_transfer": {
      return ClassificationSchema.cases.InternalTransfer.make({
        ruleId: rule.id,
      });
    }

    case "refund": {
      return ClassificationSchema.cases.Refund.make({ ruleId: rule.id });
    }

    case "self_transfer": {
      return ClassificationSchema.cases.SelfTransfer.make({
        counterpartProfileId: Option.getOrNull(rule.counterpartProfileId),
        ruleId: rule.id,
      });
    }

    case "tax_payment": {
      return ClassificationSchema.cases.TaxPayment.make({
        obligationKind: rule.obligationKind,
        ruleId: rule.id,
      });
    }

    default: {
      return rule satisfies never;
    }
  }
};

export interface RuleCatalog {
  readonly aliases: readonly MerchantAlias[];
  readonly rules: readonly Rule[];
}

const firstMatching = <Selected extends Rule>(
  rules: readonly Rule[],
  select: (rule: Rule) => rule is Selected,
  line: MatchableLine
): Selected | undefined => {
  const selected = rules.filter(select).find((rule) => ruleMatches(rule, line));

  return selected;
};

export const sortLine = (
  line: MatchableLine,
  catalog: RuleCatalog
): LineDecision => {
  const ordered = enabledRulesByPriority(catalog.rules);

  const categorizationRule: CategorizeRule | undefined = firstMatching(
    ordered,
    isCategorizeRule,
    line
  );

  const classificationRule: ClassificationRule | undefined = firstMatching(
    ordered,
    isClassificationRule,
    line
  );

  const classification =
    classificationRule === undefined
      ? ClassificationSchema.cases.None.make({})
      : classificationOf(classificationRule);

  const categorization =
    categorizationRule === undefined ||
    Predicate.isTagged(classification, "Excluded")
      ? CategorizationSchema.cases.None.make({})
      : CategorizationSchema.cases.Applied.make({
          categoryId: categorizationRule.categoryId,
          ruleId: categorizationRule.id,
        });

  return {
    categorization,
    classification,
    payeeId: Option.getOrNull(payeeForLine(line, catalog.aliases)),
  };
};
