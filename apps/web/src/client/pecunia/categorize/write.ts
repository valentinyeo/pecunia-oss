import {
  AliasIdSchema,
  AliasMatchTypeSchema,
  CategoryIdSchema,
  DisplayNameSchema,
  PayeeIdSchema,
  RuleDraftSchema,
  RuleIdSchema,
  SpendingTypeSchema,
  normalizeName,
  sortLine,
} from "@pecunia/categorize";
import type {
  CategorizeRule,
  Category,
  MerchantAlias,
  Payee,
  RuleDraft,
} from "@pecunia/categorize";
import { Match, Option, Predicate, Result, Schema } from "effect";

import { lineOf, payeeForName, paymentsForMerchant } from "./catalog.js";
import type { CatalogRefusal } from "./refusal.js";
import {
  categoryHasChildren,
  duplicateAlias,
  duplicateCategoryName,
  merchantTaken,
  parentCycle,
  sameMerchant,
  selfParent,
  unknownAlias,
  unknownCategory,
  unknownMerchant,
  unknownPayee,
  unknownRule,
} from "./refusal.js";
import type { CatalogSnapshot } from "./snapshot.js";
import { directChildrenOf } from "./tree.js";

export type CategorizeRuleDraft = Extract<RuleDraft, { kind: "categorize" }>;

const isCategorizeDraft = (draft: RuleDraft): draft is CategorizeRuleDraft =>
  draft.kind === "categorize";

export const CategorizeRuleDraftSchema = RuleDraftSchema.pipe(
  Schema.refine(isCategorizeDraft, { expected: "a rule that picks a category" })
);

export const AliasPayeeSchema = Schema.TaggedUnion({
  Existing: { payeeId: PayeeIdSchema },
  New: { name: DisplayNameSchema },
});

export type AliasPayee = typeof AliasPayeeSchema.Type;

const categoryFields = {
  color: DisplayNameSchema,
  name: DisplayNameSchema,
  parentId: Schema.OptionFromNullishOr(CategoryIdSchema),
  spendingType: SpendingTypeSchema,
} as const;

export const CatalogWriteSchema = Schema.TaggedUnion({
  ApplyRules: {},
  AssignMerchantCategory: {
    categoryId: Schema.OptionFromNullishOr(CategoryIdSchema),
    key: Schema.NonEmptyString,
  },
  ConfirmMerchant: { key: Schema.NonEmptyString },
  CreateCategory: { ...categoryFields },
  CreateRule: { draft: CategorizeRuleDraftSchema },
  DeleteAlias: { id: AliasIdSchema },
  DeleteCategory: { id: CategoryIdSchema },
  DeleteRule: { id: RuleIdSchema },
  MergePayees: { from: PayeeIdSchema, into: PayeeIdSchema },
  MoveRule: { categoryId: CategoryIdSchema, id: RuleIdSchema },
  RenameMerchant: { key: Schema.NonEmptyString, name: DisplayNameSchema },
  SaveAlias: {
    id: Schema.OptionFromNullishOr(AliasIdSchema),
    matchType: AliasMatchTypeSchema,
    pattern: DisplayNameSchema,
    payee: AliasPayeeSchema,
  },
  SetRuleEnabled: { enabled: Schema.Boolean, id: RuleIdSchema },
  UpdateCategory: { ...categoryFields, id: CategoryIdSchema },
});

export type CatalogWrite = typeof CatalogWriteSchema.Type;

export interface WriteContext {
  readonly newId: () => string;
}

export interface WriteOutcome {
  readonly catalog: CatalogSnapshot;
  readonly notice: string;
}

type WriteResult = Result.Result<WriteOutcome, CatalogRefusal>;

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

const decodeCategoryId = (value: string): Category["id"] =>
  Schema.decodeSync(CategoryIdSchema)(value);

const decodeAliasId = (value: string): MerchantAlias["id"] =>
  Schema.decodeSync(AliasIdSchema)(value);

const decodePayeeId = (value: string): Payee["id"] =>
  Schema.decodeSync(PayeeIdSchema)(value);

const decodeName = (value: string): string =>
  Schema.decodeSync(DisplayNameSchema)(value);

const done = (catalog: CatalogSnapshot, notice: string): WriteResult =>
  Result.succeed({ catalog, notice });

const refused = (refusal: CatalogRefusal): WriteResult => Result.fail(refusal);

const findCategory = (
  snapshot: CatalogSnapshot,
  id: Category["id"]
): Option.Option<Category> =>
  Option.fromNullishOr(
    snapshot.categories.find((category) => category.id === id)
  );

const findRule = (
  snapshot: CatalogSnapshot,
  id: CategorizeRule["id"]
): Option.Option<CategorizeRule> =>
  Option.fromNullishOr(snapshot.rules.find((rule) => rule.id === id));

const findAlias = (
  snapshot: CatalogSnapshot,
  id: MerchantAlias["id"]
): Option.Option<MerchantAlias> =>
  Option.fromNullishOr(snapshot.aliases.find((alias) => alias.id === id));

const findPayee = (
  snapshot: CatalogSnapshot,
  id: Payee["id"]
): Option.Option<Payee> =>
  Option.fromNullishOr(snapshot.payees.find((payee) => payee.id === id));

const nameTaken = (
  snapshot: CatalogSnapshot,
  name: string,
  except: Option.Option<Category["id"]>
): boolean =>
  snapshot.categories.some(
    (category) =>
      normalizeName(category.name) === normalizeName(name) &&
      Option.getOrNull(except) !== category.id
  );

const descendantOf = (
  snapshot: CatalogSnapshot,
  ancestor: Category["id"],
  candidate: Category["id"]
): boolean =>
  directChildrenOf(snapshot.categories, ancestor).some(
    (child) =>
      child.id === candidate || descendantOf(snapshot, child.id, candidate)
  );

const checkParent = (
  snapshot: CatalogSnapshot,
  claim: Readonly<{
    categoryId: Option.Option<Category["id"]>;
    parentId: Option.Option<Category["id"]>;
  }>
): Option.Option<CatalogRefusal> =>
  Option.match(claim.parentId, {
    onNone: () => Option.none(),
    onSome: (parentId) => {
      const parent = findCategory(snapshot, parentId);

      if (Option.isNone(parent)) {
        return Option.some(unknownCategory());
      }

      if (Option.getOrNull(claim.categoryId) === parentId) {
        return Option.some(selfParent());
      }

      const loops = Option.match(claim.categoryId, {
        onNone: () => false,
        onSome: (own) => descendantOf(snapshot, own, parentId),
      });

      return loops
        ? Option.some(parentCycle(parent.value.name))
        : Option.none();
    },
  });

const withCategory = (
  snapshot: CatalogSnapshot,
  category: Category
): CatalogSnapshot => ({
  ...snapshot,
  categories: snapshot.categories.map((row) =>
    row.id === category.id ? category : row
  ),
});

const withRule = (
  snapshot: CatalogSnapshot,
  rule: CategorizeRule
): CatalogSnapshot => ({
  ...snapshot,
  rules: snapshot.rules.map((row) => (row.id === rule.id ? rule : row)),
});

const withPayments = (
  snapshot: CatalogSnapshot,
  change: (payment: Payment) => Payment
): CatalogSnapshot => ({
  ...snapshot,
  payments: snapshot.payments.map(change),
});

type Payment = CatalogSnapshot["payments"][number];

const paymentIds = (
  snapshot: CatalogSnapshot,
  key: string
): ReadonlySet<string> =>
  new Set(paymentsForMerchant(snapshot, key).map((payment) => payment.id));

const createCategory = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "CreateCategory" }>,
  context: WriteContext
): WriteResult => {
  if (nameTaken(snapshot, write.name, Option.none())) {
    return refused(duplicateCategoryName(write.name));
  }

  const problem = checkParent(snapshot, {
    categoryId: Option.none(),
    parentId: write.parentId,
  });

  if (Option.isSome(problem)) {
    return refused(problem.value);
  }

  const category: Category = {
    archived: false,
    color: write.color,
    id: decodeCategoryId(context.newId()),
    name: write.name,
    parentId: Option.getOrNull(write.parentId),
    profileId: snapshot.profileId,
    spendingType: write.spendingType,
  };

  return done(
    { ...snapshot, categories: [...snapshot.categories, category] },
    "Category added."
  );
};

const updateCategory = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "UpdateCategory" }>
): WriteResult => {
  const found = findCategory(snapshot, write.id);

  if (Option.isNone(found)) {
    return refused(unknownCategory());
  }

  if (nameTaken(snapshot, write.name, Option.some(write.id))) {
    return refused(duplicateCategoryName(write.name));
  }

  const problem = checkParent(snapshot, {
    categoryId: Option.some(write.id),
    parentId: write.parentId,
  });

  if (Option.isSome(problem)) {
    return refused(problem.value);
  }

  return done(
    withCategory(snapshot, {
      ...found.value,
      color: write.color,
      name: write.name,
      parentId: Option.getOrNull(write.parentId),
      spendingType: write.spendingType,
    }),
    "Category saved."
  );
};

const deleteCategory = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "DeleteCategory" }>
): WriteResult => {
  const found = findCategory(snapshot, write.id);

  if (Option.isNone(found)) {
    return refused(unknownCategory());
  }

  const children = directChildrenOf(snapshot.categories, write.id);

  if (children.length > 0) {
    return refused(categoryHasChildren(found.value.name, children.length));
  }

  const cleared = withPayments(snapshot, (payment) =>
    payment.categoryId === write.id
      ? { ...payment, categoryId: null, source: "rule" }
      : payment
  );

  return done(
    {
      ...cleared,
      categories: cleared.categories.filter(
        (category) => category.id !== write.id
      ),
    },
    "Category deleted."
  );
};

const createRule = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "CreateRule" }>,
  context: WriteContext
): WriteResult => {
  let priority = 1;

  for (const rule of snapshot.rules) {
    priority = Math.max(priority, rule.priority + 1);
  }

  const rule: CategorizeRule = {
    categoryId: write.draft.categoryId,
    direction: write.draft.direction,
    enabled: write.draft.enabled,
    id: Schema.decodeSync(RuleIdSchema)(context.newId()),
    kind: "categorize",
    matchField: write.draft.matchField,
    matchType: write.draft.matchType,
    maxAmount: write.draft.maxAmount,
    minAmount: write.draft.minAmount,
    pattern: write.draft.pattern,
    priority,
    profileId: snapshot.profileId,
  };

  return done({ ...snapshot, rules: [...snapshot.rules, rule] }, "Rule added.");
};

const setRuleEnabled = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "SetRuleEnabled" }>
): WriteResult => {
  const found = findRule(snapshot, write.id);

  return Option.isNone(found)
    ? refused(unknownRule())
    : done(
        withRule(snapshot, { ...found.value, enabled: write.enabled }),
        write.enabled ? "Rule is on." : "Rule is off."
      );
};

const moveRule = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "MoveRule" }>
): WriteResult => {
  const found = findRule(snapshot, write.id);

  if (Option.isNone(found)) {
    return refused(unknownRule());
  }

  if (Option.isNone(findCategory(snapshot, write.categoryId))) {
    return refused(unknownCategory());
  }

  return done(
    withRule(snapshot, { ...found.value, categoryId: write.categoryId }),
    "Rule moved."
  );
};

const deleteRule = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "DeleteRule" }>
): WriteResult =>
  Option.isNone(findRule(snapshot, write.id))
    ? refused(unknownRule())
    : done(
        {
          ...snapshot,
          rules: snapshot.rules.filter((rule) => rule.id !== write.id),
        },
        "Rule deleted."
      );

const applyRules = (snapshot: CatalogSnapshot): WriteResult => {
  const rules = snapshot.rules.filter((rule) =>
    Option.isSome(findCategory(snapshot, rule.categoryId))
  );

  let changed = 0;

  const payments: readonly Payment[] = snapshot.payments.map((payment) => {
    if (payment.source === "manual") {
      return payment;
    }

    const filed = sortLine(lineOf(payment), {
      aliases: snapshot.aliases,
      rules,
    }).categorization;

    if (
      !Predicate.isTagged(filed, "Applied") ||
      filed.categoryId === payment.categoryId
    ) {
      return payment;
    }

    changed += 1;

    return { ...payment, categoryId: filed.categoryId, source: "rule" };
  });

  return done(
    { ...snapshot, payments },
    `${plural(changed, "payment")} sorted.`
  );
};

interface ResolvedPayee {
  readonly catalog: CatalogSnapshot;
  readonly payeeId: Payee["id"];
}

const resolvePayee = (
  snapshot: CatalogSnapshot,
  payee: AliasPayee,
  context: WriteContext
): Result.Result<ResolvedPayee, CatalogRefusal> =>
  AliasPayeeSchema.match(payee, {
    Existing: ({ payeeId }) => {
      const found = findPayee(snapshot, payeeId);

      return Option.isNone(found)
        ? Result.fail(unknownPayee())
        : Result.succeed({ catalog: snapshot, payeeId });
    },
    New: ({ name }) => {
      const existing = snapshot.payees.find(
        (candidate) => candidate.normalizedName === normalizeName(name)
      );

      if (existing !== undefined) {
        return Result.succeed({ catalog: snapshot, payeeId: existing.id });
      }

      const created: Payee = {
        archived: false,
        defaultCategoryId: null,
        id: decodePayeeId(context.newId()),
        kind: "merchant",
        name,
        normalizedName: decodeName(normalizeName(name)),
        profileId: snapshot.profileId,
      };

      return Result.succeed({
        catalog: { ...snapshot, payees: [...snapshot.payees, created] },
        payeeId: created.id,
      });
    },
  });

const saveAlias = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "SaveAlias" }>,
  context: WriteContext
): WriteResult => {
  const pattern = normalizeName(write.pattern);

  const duplicate = snapshot.aliases.some(
    (alias) =>
      normalizeName(alias.pattern) === pattern &&
      Option.getOrNull(write.id) !== alias.id
  );

  if (duplicate) {
    return refused(duplicateAlias(write.pattern));
  }

  if (
    Option.isSome(write.id) &&
    Option.isNone(findAlias(snapshot, write.id.value))
  ) {
    return refused(unknownAlias());
  }

  const resolved = resolvePayee(snapshot, write.payee, context);

  if (Result.isFailure(resolved)) {
    return refused(resolved.failure);
  }

  const { catalog } = resolved.success;

  if (Option.isNone(write.id)) {
    const alias: MerchantAlias = {
      id: decodeAliasId(context.newId()),
      matchType: write.matchType,
      pattern: write.pattern,
      payeeId: resolved.success.payeeId,
      profileId: snapshot.profileId,
    };

    return done(
      { ...catalog, aliases: [...catalog.aliases, alias] },
      "Alias added."
    );
  }

  const editedId = Option.getOrThrow(write.id);

  return done(
    {
      ...catalog,
      aliases: catalog.aliases.map((alias) =>
        alias.id === editedId
          ? {
              ...alias,
              matchType: write.matchType,
              pattern: write.pattern,
              payeeId: resolved.success.payeeId,
            }
          : alias
      ),
    },
    "Alias saved."
  );
};

const deleteAlias = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "DeleteAlias" }>
): WriteResult =>
  Option.isNone(findAlias(snapshot, write.id))
    ? refused(unknownAlias())
    : done(
        {
          ...snapshot,
          aliases: snapshot.aliases.filter((alias) => alias.id !== write.id),
        },
        "Alias deleted."
      );

const mergePayees = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "MergePayees" }>
): WriteResult => {
  if (write.from === write.into) {
    return refused(sameMerchant());
  }

  const from = findPayee(snapshot, write.from);
  const into = findPayee(snapshot, write.into);

  if (Option.isNone(from) || Option.isNone(into)) {
    return refused(unknownPayee());
  }

  const merged = Option.getOrThrow(from);
  const target = Option.getOrThrow(into);
  let renamed = 0;

  const payments = snapshot.payments.map((payment) => {
    const owner = payeeForName(snapshot, payment.merchant);

    if (Option.isNone(owner) || owner.value.id !== merged.id) {
      return payment;
    }

    renamed += 1;

    return { ...payment, merchant: target.name };
  });

  return done(
    {
      ...snapshot,
      aliases: snapshot.aliases.map((alias) =>
        alias.payeeId === merged.id ? { ...alias, payeeId: target.id } : alias
      ),
      payees: snapshot.payees.filter((payee) => payee.id !== merged.id),
      payments,
    },
    `${merged.name} is now ${target.name} on ${plural(renamed, "payment")}.`
  );
};

const assignMerchantCategory = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "AssignMerchantCategory" }>
): WriteResult => {
  const ids = paymentIds(snapshot, write.key);

  if (ids.size === 0) {
    return refused(unknownMerchant());
  }

  const categoryId = Option.getOrNull(write.categoryId);

  if (
    categoryId !== null &&
    Option.isNone(findCategory(snapshot, categoryId))
  ) {
    return refused(unknownCategory());
  }

  const name = Option.match(
    Option.flatMap((id: Category["id"]) => findCategory(snapshot, id))(
      write.categoryId
    ),
    {
      onNone: () => "no category",
      onSome: (category) => category.name,
    }
  );

  const catalog = withPayments(snapshot, (payment) =>
    ids.has(payment.id) ? { ...payment, categoryId, source: "manual" } : payment
  );

  return done(
    catalog,
    categoryId === null
      ? `${plural(ids.size, "payment")} left unfiled.`
      : `${plural(ids.size, "payment")} filed under ${name}.`
  );
};

const renameMerchant = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "RenameMerchant" }>
): WriteResult => {
  const targets = paymentsForMerchant(snapshot, write.key);

  if (targets.length === 0) {
    return refused(unknownMerchant());
  }

  const owner = payeeForName(snapshot, targets[0]?.merchant ?? "");

  const taken = snapshot.payees.some(
    (payee) =>
      payee.normalizedName === normalizeName(write.name) &&
      Option.getOrNull(Option.map((found: Payee) => found.id)(owner)) !==
        payee.id
  );

  if (taken) {
    return refused(merchantTaken(write.name));
  }

  const ids = new Set(targets.map((payment) => payment.id));

  const payments = snapshot.payments.map((payment) =>
    ids.has(payment.id) ? { ...payment, merchant: write.name } : payment
  );

  const payees = snapshot.payees.map((payee) =>
    Option.isSome(owner) && payee.id === owner.value.id
      ? {
          ...payee,
          name: write.name,
          normalizedName: decodeName(normalizeName(write.name)),
        }
      : payee
  );

  return done(
    { ...snapshot, payees, payments },
    `Renamed to ${write.name} on ${plural(ids.size, "payment")}.`
  );
};

const confirmMerchant = (
  snapshot: CatalogSnapshot,
  write: Extract<CatalogWrite, { _tag: "ConfirmMerchant" }>
): WriteResult => {
  const ids = paymentIds(snapshot, write.key);

  if (ids.size === 0) {
    return refused(unknownMerchant());
  }

  let changed = 0;

  const payments = snapshot.payments.map((payment) => {
    if (!ids.has(payment.id) || payment.reviewed) {
      return payment;
    }

    changed += 1;

    return { ...payment, reviewed: true };
  });

  return done(
    { ...snapshot, payments },
    changed === 0
      ? "Nothing left to confirm."
      : `${plural(changed, "payment")} confirmed.`
  );
};

export const applyWrite = (
  snapshot: CatalogSnapshot,
  write: CatalogWrite,
  context: WriteContext
): WriteResult =>
  Match.value(write).pipe(
    Match.tag("ApplyRules", () => applyRules(snapshot)),
    Match.tag("AssignMerchantCategory", (value) =>
      assignMerchantCategory(snapshot, value)
    ),
    Match.tag("ConfirmMerchant", (value) => confirmMerchant(snapshot, value)),
    Match.tag("CreateCategory", (value) =>
      createCategory(snapshot, value, context)
    ),
    Match.tag("CreateRule", (value) => createRule(snapshot, value, context)),
    Match.tag("DeleteAlias", (value) => deleteAlias(snapshot, value)),
    Match.tag("DeleteCategory", (value) => deleteCategory(snapshot, value)),
    Match.tag("DeleteRule", (value) => deleteRule(snapshot, value)),
    Match.tag("MergePayees", (value) => mergePayees(snapshot, value)),
    Match.tag("MoveRule", (value) => moveRule(snapshot, value)),
    Match.tag("RenameMerchant", (value) => renameMerchant(snapshot, value)),
    Match.tag("SaveAlias", (value) => saveAlias(snapshot, value, context)),
    Match.tag("SetRuleEnabled", (value) => setRuleEnabled(snapshot, value)),
    Match.tag("UpdateCategory", (value) => updateCategory(snapshot, value)),
    Match.exhaustive
  );
