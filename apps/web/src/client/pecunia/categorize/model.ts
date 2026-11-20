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
import { parseMajorText } from "./amount.js";
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

export const categoryRefusal = "Name: enter a category name such as Groceries.";

export const parentRefusal =
  "Parent: pick a category from the list, or leave it empty for a top-level category.";

export const patternRefusal =
  "Pattern: enter text a payment shows, such as Demo Grocer.";

export const colourRefusal = "Colour: pick one of the colours in the palette.";

export const spendingRefusal = "Spending: pick business, personal or mixed.";

export const directionRefusal = "Direction: pick in, out or any.";

export const amountsRefusal =
  "Amounts: enter the least and the most amount as numbers such as 25 or 25.50.";

export const sameAmountsRefusal =
  "Amounts: the least amount is larger than the most amount. Fix: swap the two amounts.";

export const mergeRefusal =
  "Merge: pick two different merchants to combine in `/app/aliases`.";

export const categoryChoiceRefusal = "Category: pick a category from the list.";

export const merchantRefusal =
  "Merchant: search a merchant name in `/app/aliases` and pick a match.";

export const renameRefusal =
  "Name: enter the merchant name to show on every payment.";

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
