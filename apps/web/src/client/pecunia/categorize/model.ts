import {
  AliasMatchTypeSchema,
  CategoryIdSchema,
  DisplayNameSchema,
  PayeeIdSchema,
  RuleDirectionSchema,
  SpendingTypeSchema,
} from "@pecunia/categorize";
import type { AliasMatchType } from "@pecunia/categorize";
import { Option, Result, Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

import type { Minor } from "../money.js";
import { amountRefusal, parseMajorText } from "./amount.js";
import { MerchantFilterSchema } from "./catalog.js";
import type { MerchantFilter } from "./catalog.js";
import { demoCatalog, demoLatestMonth } from "./demo.js";
import { MonthSchema } from "./period.js";
import { CatalogSnapshotSchema } from "./snapshot.js";
import type { CatalogSnapshot } from "./snapshot.js";
import { AliasPayeeSchema } from "./write.js";
import type { AliasPayee, CategorizeRuleDraft } from "./write.js";

export const CategoryColorSchema = Schema.Literals([
  "#0f766e",
  "#15803d",
  "#0369a1",
  "#6d28d9",
  "#b45309",
  "#be123c",
  "#525252",
  "#7c2d12",
]);

export type CategoryColor = typeof CategoryColorSchema.Type;

export const CATEGORY_COLORS: readonly CategoryColor[] =
  CategoryColorSchema.literals;

export const Notice = defineTaggedUnion({
  Done: { text: Schema.NonEmptyString },
  None: {},
  Refused: { message: Schema.NonEmptyString },
});

export type NoticeValue = typeof Notice.Type;

export const CategoryDraftSchema = Schema.Struct({
  color: Schema.String,
  name: Schema.String,
  parentId: Schema.String,
  spendingType: Schema.String,
});

export type CategoryDraft = typeof CategoryDraftSchema.Type;

export const emptyCategoryDraft: CategoryDraft = {
  color: "#0f766e",
  name: "",
  parentId: "",
  spendingType: "personal",
};

export const CategoryForm = defineTaggedUnion({
  Closed: {},
  Creating: { draft: CategoryDraftSchema },
  Editing: { draft: CategoryDraftSchema, id: CategoryIdSchema },
});

export type CategoryFormValue = typeof CategoryForm.Type;

export const CategoryFieldSchema = Schema.Literals([
  "color",
  "name",
  "parentId",
  "spendingType",
]);

export type CategoryField = typeof CategoryFieldSchema.Type;

export const RuleDraftSchema = Schema.Struct({
  categoryId: Schema.String,
  direction: Schema.String,
  maxAmount: Schema.String,
  minAmount: Schema.String,
  pattern: Schema.String,
});

export type RuleDraft = typeof RuleDraftSchema.Type;

export const RuleForm = defineTaggedUnion({
  Closed: {},
  Creating: { draft: RuleDraftSchema },
});

export type RuleFormValue = typeof RuleForm.Type;

export const RuleFieldSchema = Schema.Literals([
  "categoryId",
  "direction",
  "maxAmount",
  "minAmount",
  "pattern",
]);

export type RuleField = typeof RuleFieldSchema.Type;

export const AliasDraftSchema = Schema.Struct({
  matchType: AliasMatchTypeSchema,
  payeeId: Schema.String,
  payeeName: Schema.String,
  pattern: Schema.String,
  query: Schema.String,
});

export type AliasDraft = typeof AliasDraftSchema.Type;

export const AliasForm = defineTaggedUnion({
  Closed: {},
  Creating: { draft: AliasDraftSchema },
  Editing: { draft: AliasDraftSchema, id: Schema.NonEmptyString },
});

export type AliasFormValue = typeof AliasForm.Type;

export const AliasFieldSchema = Schema.Literals([
  "matchType",
  "payeeName",
  "pattern",
  "query",
]);

export type AliasField = typeof AliasFieldSchema.Type;

export const MergeDraftSchema = Schema.Struct({
  from: Schema.String,
  into: Schema.String,
});

export type MergeDraft = typeof MergeDraftSchema.Type;

export const MergeFieldSchema = Schema.Literals(["from", "into"]);

export type MergeField = typeof MergeFieldSchema.Type;

export const UNSET_SELECT = "";

export const CategorizeScreen = Schema.Struct({
  aliasForm: AliasForm,
  catalog: CatalogSnapshotSchema,
  categoryForm: CategoryForm,
  merchantFilter: MerchantFilterSchema,
  merchantQuery: Schema.String,
  mergeDraft: MergeDraftSchema,
  notice: Notice,
  page: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  period: MonthSchema,
  renameDraft: Schema.String,
  ruleForm: RuleForm,
});

export type CategorizeScreenValue = typeof CategorizeScreen.Type;

export const emptyAliasDraft: AliasDraft = {
  matchType: "contains",
  payeeId: "",
  payeeName: "",
  pattern: "",
  query: "",
};

export const emptyRuleDraft: RuleDraft = {
  categoryId: "",
  direction: "out",
  maxAmount: "",
  minAmount: "",
  pattern: "",
};

export const emptyMergeDraft: MergeDraft = { from: "", into: "" };

export const initialCategorize: CategorizeScreenValue = {
  aliasForm: AliasForm.Closed(),
  catalog: demoCatalog,
  categoryForm: CategoryForm.Closed(),
  merchantFilter: MerchantFilterSchema.cases.All.make({}),
  merchantQuery: "",
  mergeDraft: emptyMergeDraft,
  notice: Notice.None(),
  page: 1,
  period: demoLatestMonth,
  renameDraft: "",
  ruleForm: RuleForm.Closed(),
};

const decodeName = Schema.decodeResult(DisplayNameSchema);

const decodeCategoryId = Schema.decodeResult(CategoryIdSchema);

const decodePayeeId = Schema.decodeResult(PayeeIdSchema);

const decodeColor = Schema.decodeUnknownResult(CategoryColorSchema);

const decodeSpendingType = Schema.decodeUnknownResult(SpendingTypeSchema);

const decodeDirection = Schema.decodeUnknownResult(RuleDirectionSchema);

export const categoryRefusal =
  "The name is empty. A category needs a name before it can be saved. Fix: type a name such as `Groceries` in the Name field.";

export const parentRefusal =
  "That parent is not in this book. The category list changed since this page loaded. Fix: choose a parent again from the Parent list, or `No parent` for a top-level category.";

export const patternRefusal =
  "The pattern is empty. A rule needs text a payment shows before it can be saved. Fix: type text such as `Demo Grocer` in the Pattern field.";

export const colourRefusal =
  "That colour is not in the palette. A category colour is one of the eight palette colours. Fix: choose one of them, such as `#0f766e`, from the Colour list.";

export const spendingRefusal =
  "That spending type is unknown. A category is business, personal or mixed. Fix: pick `business`, `personal` or `mixed` from the Spending list.";

export const directionRefusal =
  "That direction is unknown. A rule looks at money out, money in, or both. Fix: pick `out`, `in` or `any` from the Direction list.";

export const amountsRefusal =
  "That amount is not a number. Amounts are in pounds (£) with up to two decimals. Fix: type a number such as `25` or `25.50` in the amount field.";

export const sameAmountsRefusal =
  "The least amount is larger than the most amount. No payment can sit above the most and below the least. Fix: swap the two numbers in the `Least amount` and `Most amount` fields.";

export const mergeRefusal =
  "The merge needs two different merchants. A merge keeps one row, so the two sides must differ. Fix: pick a second merchant from the list in `/app/aliases`.";

export const categoryChoiceRefusal =
  "That category is not in this book. The category list changed since this page loaded. Fix: pick a category again from the list in `/app/categories`.";

export const aliasChoiceRefusal =
  "That alias is not in this book. The alias list changed since this page loaded. Fix: pick an alias again from the list in `/app/aliases`.";

export const merchantRefusal =
  "No merchant matches that name. An alias needs a merchant the book holds. Fix: search a merchant in `/app/aliases` and pick a match.";

export const renameRefusal =
  "The name is empty. Every payment needs a merchant name to show. Fix: type the new name in the `Merchant name` field, then press Rename.";

export const readOnlyRefusal =
  "Nothing was saved. Your access to this book is read-only, so it refuses changes. Fix: ask an owner to give you write access in `/app/settings`.";

export const formRefusals: readonly string[] = [
  aliasChoiceRefusal,
  amountsRefusal,
  amountRefusal,
  categoryChoiceRefusal,
  categoryRefusal,
  colourRefusal,
  directionRefusal,
  merchantRefusal,
  mergeRefusal,
  parentRefusal,
  patternRefusal,
  readOnlyRefusal,
  renameRefusal,
  sameAmountsRefusal,
  spendingRefusal,
];

export interface ParsedCategoryDraft {
  readonly color: CategoryColor;
  readonly name: string;
  readonly parentId: Option.Option<typeof CategoryIdSchema.Type>;
  readonly spendingType: typeof SpendingTypeSchema.Type;
}

export interface ParsedRuleDraft {
  readonly draft: CategorizeRuleDraft;
}

export interface ParsedAliasDraft {
  readonly matchType: AliasMatchType;
  readonly pattern: string;
  readonly payee: AliasPayee;
}

export interface ParsedMergeDraft {
  readonly from: typeof PayeeIdSchema.Type;
  readonly into: typeof PayeeIdSchema.Type;
}

export const parseCategoryDraft = (
  catalog: CatalogSnapshot,
  draft: CategoryDraft
): Result.Result<ParsedCategoryDraft, string> => {
  const name = decodeName(draft.name.trim());

  if (Result.isFailure(name)) {
    return Result.fail(categoryRefusal);
  }

  const color = decodeColor(draft.color);

  if (Result.isFailure(color)) {
    return Result.fail(colourRefusal);
  }

  const spendingType = decodeSpendingType(draft.spendingType);

  if (Result.isFailure(spendingType)) {
    return Result.fail(spendingRefusal);
  }

  if (draft.parentId === UNSET_SELECT) {
    return Result.succeed({
      color: color.success,
      name: name.success,
      parentId: Option.none(),
      spendingType: spendingType.success,
    });
  }

  const parentId = decodeCategoryId(draft.parentId);

  if (
    Result.isFailure(parentId) ||
    !catalog.categories.some((category) => category.id === parentId.success)
  ) {
    return Result.fail(parentRefusal);
  }

  return Result.succeed({
    color: color.success,
    name: name.success,
    parentId: Option.some(parentId.success),
    spendingType: spendingType.success,
  });
};

const optionalAmount = (
  text: string
): Result.Result<Option.Option<Minor>, string> => {
  if (text.trim().length === 0) {
    return Result.succeed(Option.none());
  }

  const parsed = parseMajorText(text);

  return Result.isFailure(parsed)
    ? Result.fail(amountsRefusal)
    : Result.succeed(Option.some(parsed.success));
};

export const parseRuleDraft = (
  catalog: CatalogSnapshot,
  draft: RuleDraft
): Result.Result<ParsedRuleDraft, string> => {
  const pattern = decodeName(draft.pattern.trim());

  if (Result.isFailure(pattern)) {
    return Result.fail(patternRefusal);
  }

  const categoryId = decodeCategoryId(draft.categoryId);

  if (
    Result.isFailure(categoryId) ||
    !catalog.categories.some((category) => category.id === categoryId.success)
  ) {
    return Result.fail(categoryChoiceRefusal);
  }

  const direction = decodeDirection(draft.direction);

  if (Result.isFailure(direction)) {
    return Result.fail(directionRefusal);
  }

  const least = optionalAmount(draft.minAmount);
  const most = optionalAmount(draft.maxAmount);

  if (Result.isFailure(least)) {
    return Result.fail(least.failure);
  }

  if (Result.isFailure(most)) {
    return Result.fail(most.failure);
  }

  const leastMinor = Option.getOrNull(least.success);
  const mostMinor = Option.getOrNull(most.success);

  if (leastMinor !== null && mostMinor !== null && leastMinor > mostMinor) {
    return Result.fail(sameAmountsRefusal);
  }

  return Result.succeed({
    draft: {
      categoryId: categoryId.success,
      direction: direction.success,
      enabled: true,
      kind: "categorize",
      matchField: "merchant",
      matchType: "contains",
      maxAmount: most.success,
      minAmount: least.success,
      pattern: pattern.success,
      priority: 0,
    },
  });
};

export const parseAliasDraft = (
  draft: AliasDraft
): Result.Result<ParsedAliasDraft, string> => {
  const pattern = decodeName(draft.pattern.trim());

  if (Result.isFailure(pattern)) {
    return Result.fail(patternRefusal);
  }

  if (draft.payeeId !== UNSET_SELECT) {
    const payeeId = decodePayeeId(draft.payeeId);

    return Result.isFailure(payeeId)
      ? Result.fail(merchantRefusal)
      : Result.succeed({
          matchType: draft.matchType,
          pattern: pattern.success,
          payee: AliasPayeeSchema.cases.Existing.make({
            payeeId: payeeId.success,
          }),
        });
  }

  const name = decodeName(draft.payeeName.trim());

  return Result.isFailure(name)
    ? Result.fail(merchantRefusal)
    : Result.succeed({
        matchType: draft.matchType,
        pattern: pattern.success,
        payee: AliasPayeeSchema.cases.New.make({ name: name.success }),
      });
};

export const parseMergeDraft = (
  draft: MergeDraft
): Result.Result<ParsedMergeDraft, string> => {
  const from = decodePayeeId(draft.from);
  const into = decodePayeeId(draft.into);

  if (
    Result.isFailure(from) ||
    Result.isFailure(into) ||
    from.success === into.success
  ) {
    return Result.fail(mergeRefusal);
  }

  return Result.succeed({ from: from.success, into: into.success });
};

export const merchantFilterOf = (
  catalog: CatalogSnapshot,
  value: string
): MerchantFilter => {
  if (value === "all") {
    return MerchantFilterSchema.cases.All.make({});
  }

  if (value === "uncategorised") {
    return MerchantFilterSchema.cases.Uncategorised.make({});
  }

  const chosen = catalog.categories.find((category) => category.id === value);

  return chosen === undefined
    ? MerchantFilterSchema.cases.All.make({})
    : MerchantFilterSchema.cases.Of.make({ categoryId: chosen.id });
};

export const merchantFilterValue = (filter: MerchantFilter): string =>
  MerchantFilterSchema.match(filter, {
    All: () => "all",
    Of: ({ categoryId }) => categoryId,
    Uncategorised: () => "uncategorised",
  });
