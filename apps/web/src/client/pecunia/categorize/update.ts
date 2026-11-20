import { AliasIdSchema } from "@pecunia/categorize";
import type { Category, CategoryId } from "@pecunia/categorize";
import { Option, Result, Schema } from "effect";
import type { Update } from "foldkit";

import { WriteCatalog } from "./command.js";
import type { CategorizeGateway } from "./gateway.js";
import { Message } from "./message.js";
import type { CategorizeMessageValue, FormSlot } from "./message.js";
import {
  AliasForm,
  CATEGORY_COLORS,
  CategoryForm,
  RuleForm,
  Notice,
  UNSET_SELECT,
  categoryChoiceRefusal,
  emptyAliasDraft,
  emptyCategoryDraft,
  emptyMergeDraft,
  emptyRuleDraft,
  parseAliasDraft,
  parseCategoryDraft,
  parseMergeDraft,
  parseRuleDraft,
  renameRefusal,
} from "./model.js";
import type {
  AliasDraft,
  AliasField,
  AliasFormValue,
  CategorizeScreenValue,
  CategoryDraft,
  CategoryField,
  CategoryFormValue,
  MergeField,
  RuleDraft,
  RuleField,
  RuleFormValue,
} from "./model.js";
import { MonthSchema } from "./period.js";
import type { CatalogWrite } from "./write.js";
import { CatalogWriteSchema } from "./write.js";

export type CategorizeUpdate = Update.Return<
  CategorizeScreenValue,
  CategorizeMessageValue,
  CategorizeGateway
>;

const { cases } = CatalogWriteSchema;

const refused = (
  screen: CategorizeScreenValue,
  message: string
): CategorizeUpdate => ({
  model: { ...screen, notice: Notice.Refused({ message }) },
});

const send = (
  screen: CategorizeScreenValue,
  form: FormSlot,
  write: CatalogWrite
): CategorizeUpdate => ({
  commands: [WriteCatalog({ form, write })],
  model: { ...screen, notice: Notice.None() },
});

const untouched = (screen: CategorizeScreenValue): CategorizeUpdate => ({
  model: screen,
});

const categoryDraftOf = (category: Category): CategoryDraft => ({
  color: category.color,
  name: category.name,
  parentId: category.parentId ?? UNSET_SELECT,
  spendingType: category.spendingType,
});

const editCategoryForm = (
  form: CategoryFormValue,
  field: CategoryField,
  value: string
): CategoryFormValue =>
  CategoryForm.match(form, {
    Closed: () => form,
    Creating: ({ draft }) =>
      CategoryForm.Creating({ draft: { ...draft, [field]: value } }),
    Editing: ({ draft, id }) =>
      CategoryForm.Editing({ draft: { ...draft, [field]: value }, id }),
  });

const editRuleForm = (
  form: RuleFormValue,
  field: RuleField,
  value: string
): RuleFormValue =>
  RuleForm.match(form, {
    Closed: () => form,
    Creating: ({ draft }) =>
      RuleForm.Creating({ draft: { ...draft, [field]: value } }),
  });

const editAliasForm = (
  form: AliasFormValue,
  field: AliasField,
  value: string
): AliasFormValue =>
  AliasForm.match(form, {
    Closed: () => form,
    Creating: ({ draft }) =>
      AliasForm.Creating({ draft: { ...draft, [field]: value } }),
    Editing: ({ draft, id }) =>
      AliasForm.Editing({ draft: { ...draft, [field]: value }, id }),
  });

const submitCategory = (
  screen: CategorizeScreenValue,
  draft: CategoryDraft,
  id: Option.Option<CategoryId>
): CategorizeUpdate => {
  const parsed = parseCategoryDraft(screen.catalog, draft);

  if (Result.isFailure(parsed)) {
    return refused(screen, parsed.failure);
  }

  return Option.match(id, {
    onNone: () =>
      send(
        screen,
        "category",
        cases.CreateCategory.make({ ...parsed.success })
      ),
    onSome: (categoryId) =>
      send(
        screen,
        "category",
        cases.UpdateCategory.make({ ...parsed.success, id: categoryId })
      ),
  });
};

const submitRule = (
  screen: CategorizeScreenValue,
  draft: RuleDraft
): CategorizeUpdate => {
  const parsed = parseRuleDraft(screen.catalog, draft);

  return Result.isFailure(parsed)
    ? refused(screen, parsed.failure)
    : send(
        screen,
        "rule",
        cases.CreateRule.make({ draft: parsed.success.draft })
      );
};

const submitAlias = (
  screen: CategorizeScreenValue,
  form: AliasFormValue
): CategorizeUpdate =>
  AliasForm.match(form, {
    Closed: () => untouched(screen),
    Creating: ({ draft }) => {
      const parsed = parseAliasDraft(draft);

      return Result.isFailure(parsed)
        ? refused(screen, parsed.failure)
        : send(
            screen,
            "alias",
            cases.SaveAlias.make({
              id: Option.none(),
              matchType: parsed.success.matchType,
              pattern: parsed.success.pattern,
              payee: parsed.success.payee,
            })
          );
    },
    Editing: ({ draft, id }) => {
      const parsed = parseAliasDraft(draft);

      if (Result.isFailure(parsed)) {
        return refused(screen, parsed.failure);
      }

      const aliasId = Schema.decodeResult(AliasIdSchema)(id);

      return Result.isFailure(aliasId)
        ? refused(screen, "Alias: pick an alias from the list.")
        : send(
            screen,
            "alias",
            cases.SaveAlias.make({
              id: Option.some(aliasId.success),
              matchType: parsed.success.matchType,
              pattern: parsed.success.pattern,
              payee: parsed.success.payee,
            })
          );
    },
  });

const submitMerge = (screen: CategorizeScreenValue): CategorizeUpdate => {
  const parsed = parseMergeDraft(screen.mergeDraft);

  return Result.isFailure(parsed)
    ? refused(screen, parsed.failure)
    : send(
        screen,
        "merge",
        cases.MergePayees.make({
          from: parsed.success.from,
          into: parsed.success.into,
        })
      );
};

const submitRename = (
  screen: CategorizeScreenValue,
  key: string
): CategorizeUpdate => {
  const name = Schema.decodeResult(Schema.NonEmptyString)(
    screen.renameDraft.trim()
  );

  return Result.isFailure(name)
    ? refused(screen, renameRefusal)
    : send(
        screen,
        "none",
        cases.RenameMerchant.make({ key, name: name.success })
      );
};

const assignCategory = (
  screen: CategorizeScreenValue,
  key: string,
  value: string
): CategorizeUpdate => {
  if (value === UNSET_SELECT) {
    return send(
      screen,
      "none",
      cases.AssignMerchantCategory.make({ categoryId: Option.none(), key })
    );
  }

  const category = screen.catalog.categories.find(
    (candidate) => candidate.id === value
  );

  return category === undefined
    ? refused(screen, categoryChoiceRefusal)
    : send(
        screen,
        "none",
        cases.AssignMerchantCategory.make({
          categoryId: Option.some(category.id),
          key,
        })
      );
};

const closeForm = (
  screen: CategorizeScreenValue,
  form: FormSlot
): CategorizeScreenValue => {
  switch (form) {
    case "alias": {
      return { ...screen, aliasForm: AliasForm.Closed() };
    }

    case "category": {
      return { ...screen, categoryForm: CategoryForm.Closed() };
    }

    case "merge": {
      return { ...screen, mergeDraft: emptyMergeDraft };
    }

    case "rule": {
      return { ...screen, ruleForm: RuleForm.Closed() };
    }

    case "none": {
      return screen;
    }

    default: {
      return form satisfies never;
    }
  }
};

const openEditCategory = (
  screen: CategorizeScreenValue,
  id: CategoryId
): CategorizeUpdate => {
  const found = screen.catalog.categories.find(
    (category) => category.id === id
  );

  return found === undefined
    ? refused(
        screen,
        "No category with that id is in this book. Fix: reload `/app/categories`."
      )
    : {
        model: {
          ...screen,
          categoryForm: CategoryForm.Editing({
            draft: categoryDraftOf(found),
            id: found.id,
          }),
          notice: Notice.None(),
        },
      };
};

const openEditAlias = (
  screen: CategorizeScreenValue,
  id: string
): CategorizeUpdate => {
  const found = screen.catalog.aliases.find((alias) => alias.id === id);

  if (found === undefined) {
    return refused(
      screen,
      "No alias with that id is in this book. Fix: reload `/app/aliases`."
    );
  }

  const payee = screen.catalog.payees.find(
    (candidate) => candidate.id === found.payeeId
  );

  return {
    model: {
      ...screen,
      aliasForm: AliasForm.Editing({
        draft: {
          matchType: found.matchType,
          payeeId: found.payeeId,
          payeeName: payee?.name ?? found.payeeId,
          pattern: found.pattern,
          query: "",
        },
        id: found.id,
      }),
      notice: Notice.None(),
    },
  };
};

const chosePayee = (
  screen: CategorizeScreenValue,
  payeeId: string
): CategorizeUpdate => {
  const payee = screen.catalog.payees.find(
    (candidate) => candidate.id === payeeId
  );

  if (payee === undefined) {
    return untouched(screen);
  }

  const draft = (current: AliasDraft): AliasDraft => ({
    ...current,
    payeeId: payee.id,
    payeeName: payee.name,
    query: "",
  });

  return {
    model: {
      ...screen,
      aliasForm: AliasForm.match<AliasFormValue>(screen.aliasForm, {
        Closed: () => screen.aliasForm,
        Creating: ({ draft: current }) =>
          AliasForm.Creating({ draft: draft(current) }),
        Editing: ({ draft: current, id }) =>
          AliasForm.Editing({ draft: draft(current), id }),
      }),
    },
  };
};

export const update = (
  screen: CategorizeScreenValue,
  message: CategorizeMessageValue
): CategorizeUpdate =>
  Message.match<CategorizeUpdate>(message, {
    AppliedRules: () => send(screen, "rule", cases.ApplyRules.make({})),
    AssignedMerchantCategory: ({ categoryId, key }) =>
      assignCategory(screen, key, categoryId),
    CancelledAlias: () => ({
      model: { ...screen, aliasForm: AliasForm.Closed() },
    }),
    CancelledCategory: () => ({
      model: { ...screen, categoryForm: CategoryForm.Closed() },
    }),
    CancelledRule: () => ({
      model: { ...screen, ruleForm: RuleForm.Closed() },
    }),
    ChangedPage: ({ page }) => ({
      model: { ...screen, page: Math.max(1, page) },
    }),
    ChangedPeriod: ({ period }) => {
      const parsed = Schema.decodeResult(MonthSchema)(period);

      return Result.isSuccess(parsed)
        ? { model: { ...screen, period: parsed.success } }
        : untouched(screen);
    },
    ChoseAliasPayee: ({ payeeId }) => chosePayee(screen, payeeId),
    CompletedWrite: ({ catalog, form, notice }) => ({
      model: {
        ...closeForm(
          { ...screen, catalog, notice: Notice.Done({ text: notice }) },
          form
        ),
        renameDraft: "",
      },
    }),
    ConfirmedMerchant: ({ key }) =>
      send(screen, "none", cases.ConfirmMerchant.make({ key })),
    DeletedAlias: ({ id }) =>
      send(screen, "alias", cases.DeleteAlias.make({ id })),
    DeletedCategory: ({ id }) =>
      send(screen, "category", cases.DeleteCategory.make({ id })),
    DeletedRule: ({ id }) =>
      send(screen, "rule", cases.DeleteRule.make({ id })),
    FailedWrite: ({ reason }) => refused(screen, reason),
    FilteredMerchants: ({ filter }) => ({
      model: { ...screen, merchantFilter: filter, page: 1 },
    }),
    MovedRule: ({ categoryId, id }) => {
      const category = screen.catalog.categories.find(
        (candidate) => candidate.id === categoryId
      );

      return category === undefined
        ? refused(screen, categoryChoiceRefusal)
        : send(
            screen,
            "rule",
            cases.MoveRule.make({ categoryId: category.id, id })
          );
    },
    StartedCreateAlias: () => ({
      model: {
        ...screen,
        aliasForm: AliasForm.Creating({ draft: emptyAliasDraft }),
        notice: Notice.None(),
      },
    }),
    StartedCreateCategory: () => ({
      model: {
        ...screen,
        categoryForm: CategoryForm.Creating({
          draft: {
            ...emptyCategoryDraft,
            color: CATEGORY_COLORS[0] ?? "#0f766e",
          },
        }),
        notice: Notice.None(),
      },
    }),
    StartedCreateRule: () => ({
      model: {
        ...screen,
        notice: Notice.None(),
        ruleForm: RuleForm.Creating({
          draft: {
            ...emptyRuleDraft,
            categoryId: screen.catalog.categories[0]?.id ?? UNSET_SELECT,
          },
        }),
      },
    }),
    StartedEditAlias: ({ id }) => openEditAlias(screen, id),
    StartedEditCategory: ({ id }) => openEditCategory(screen, id),
    SubmittedAlias: () => submitAlias(screen, screen.aliasForm),
    SubmittedCategory: () =>
      CategoryForm.match<CategorizeUpdate>(screen.categoryForm, {
        Closed: () => untouched(screen),
        Creating: ({ draft }) => submitCategory(screen, draft, Option.none()),
        Editing: ({ draft, id }) =>
          submitCategory(screen, draft, Option.some(id)),
      }),
    SubmittedMerge: () => submitMerge(screen),
    SubmittedRename: ({ key }) => submitRename(screen, key),
    SubmittedRule: () =>
      RuleForm.match<CategorizeUpdate>(screen.ruleForm, {
        Closed: () => untouched(screen),
        Creating: ({ draft }) => submitRule(screen, draft),
      }),
    ToggledRule: ({ enabled, id }) =>
      send(screen, "rule", cases.SetRuleEnabled.make({ enabled, id })),
    TypedAlias: ({ field, value }) => ({
      model: {
        ...screen,
        aliasForm:
          field === "payeeName"
            ? AliasForm.match<AliasFormValue>(screen.aliasForm, {
                Closed: () => screen.aliasForm,
                Creating: ({ draft }) =>
                  AliasForm.Creating({
                    draft: {
                      ...draft,
                      payeeId: UNSET_SELECT,
                      payeeName: value,
                    },
                  }),
                Editing: ({ draft, id }) =>
                  AliasForm.Editing({
                    draft: {
                      ...draft,
                      payeeId: UNSET_SELECT,
                      payeeName: value,
                    },
                    id,
                  }),
              })
            : editAliasForm(screen.aliasForm, field, value),
      },
    }),
    TypedCategory: ({ field, value }) => ({
      model: {
        ...screen,
        categoryForm: editCategoryForm(screen.categoryForm, field, value),
      },
    }),
    TypedMerge: ({ field, value }) => ({
      model: {
        ...screen,
        mergeDraft: mergeFieldOf(screen.mergeDraft, field, value),
      },
    }),
    TypedMerchantQuery: ({ value }) => ({
      model: { ...screen, merchantQuery: value, page: 1 },
    }),
    TypedMerchantRename: ({ value }) => ({
      model: { ...screen, renameDraft: value },
    }),
    TypedRule: ({ field, value }) => ({
      model: {
        ...screen,
        ruleForm: editRuleForm(screen.ruleForm, field, value),
      },
    }),
  });

const mergeFieldOf = (
  draft: CategorizeScreenValue["mergeDraft"],
  field: MergeField,
  value: string
): CategorizeScreenValue["mergeDraft"] =>
  field === "from" ? { ...draft, from: value } : { ...draft, into: value };
