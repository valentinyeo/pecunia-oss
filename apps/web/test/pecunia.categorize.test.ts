import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Result, Schema } from "effect";

import { amountRefusal } from "../src/client/pecunia/categorize/amount.js";
import {
  MerchantFilterSchema,
  aliasCandidates,
  aliasGroups,
  categoryCount,
  filterMerchants,
  merchantRowOf,
  merchantRows,
  merchantSpendByCategory,
  paged,
  paymentsForMerchant,
  spendByCategory,
} from "../src/client/pecunia/categorize/catalog.js";
import { WriteCatalog } from "../src/client/pecunia/categorize/command.js";
import {
  demoCatalog,
  demoCategoryIds,
  demoLatestMonth,
} from "../src/client/pecunia/categorize/demo.js";
import { CategorizeGateway } from "../src/client/pecunia/categorize/gateway.js";
import {
  TimestampMillisSchema,
  uuidV7At,
} from "../src/client/pecunia/categorize/ids.js";
import { Message } from "../src/client/pecunia/categorize/message.js";
import type { CategorizeMessageValue } from "../src/client/pecunia/categorize/message.js";
import {
  AliasForm,
  CategoryForm,
  Notice,
  categoryChoiceRefusal,
  formRefusals,
  initialCategorize,
  parseAliasDraft,
  parseCategoryDraft,
  parseRuleDraft,
  readOnlyRefusal,
} from "../src/client/pecunia/categorize/model.js";
import type {
  AliasDraft,
  CategorizeScreenValue,
  CategoryDraft,
  RuleDraft,
} from "../src/client/pecunia/categorize/model.js";
import { BookCurrency } from "../src/client/pecunia/categorize/payment.js";
import {
  monthOfMillis,
  startOfMonth,
} from "../src/client/pecunia/categorize/period.js";
import { catalogRefusalSamples } from "../src/client/pecunia/categorize/refusal.js";
import { CatalogSnapshotSchema } from "../src/client/pecunia/categorize/snapshot.js";
import type { CatalogSnapshot } from "../src/client/pecunia/categorize/snapshot.js";
import { descendantIds } from "../src/client/pecunia/categorize/tree.js";
import { update as updateCategorize } from "../src/client/pecunia/categorize/update.js";
import {
  AliasPayeeSchema,
  CatalogWriteSchema,
  applyWrite,
} from "../src/client/pecunia/categorize/write.js";
import type { CatalogWrite } from "../src/client/pecunia/categorize/write.js";
import type { SettingsRoleValue } from "../src/client/pecunia/settings/model.js";

const { cases } = CatalogWriteSchema;

const counter = (start: number) => {
  let value = start;

  return (): string => {
    value += 1;

    return uuidV7At(1_780_000_000_000, value);
  };
};

const run = (catalog: CatalogSnapshot, write: CatalogWrite) =>
  applyWrite(catalog, write, { newId: counter(1000) });

const applied = (catalog: CatalogSnapshot, write: CatalogWrite) => {
  const outcome = run(catalog, write);

  if (Result.isFailure(outcome)) {
    throw new Error(
      `expected the write to land, refused with ${outcome.failure._tag}`
    );
  }

  return outcome.success;
};

const refusedWith = (catalog: CatalogSnapshot, write: CatalogWrite): string => {
  const outcome = run(catalog, write);

  if (Result.isSuccess(outcome)) {
    throw new Error("expected the write to be refused");
  }

  return outcome.failure.reason;
};

const categoryDraft = (draft: Partial<CategoryDraft> = {}): CategoryDraft => ({
  color: "#0369a1",
  name: "Coffee",
  parentId: "",
  spendingType: "personal",
  ...draft,
});

const parsedCategory = (draft: Partial<CategoryDraft> = {}) => {
  const parsed = parseCategoryDraft(demoCatalog, categoryDraft(draft));

  if (Result.isFailure(parsed)) {
    throw new Error(parsed.failure);
  }

  return parsed.success;
};

const ruleDraft = (draft: Partial<RuleDraft> = {}): RuleDraft => ({
  categoryId: demoCategoryIds.coffee,
  direction: "out",
  maxAmount: "",
  minAmount: "",
  pattern: "Demo Coffee",
  ...draft,
});

const aliasDraft = (draft: Partial<AliasDraft> = {}): AliasDraft => ({
  matchType: "contains",
  payeeId: "",
  payeeName: "Demo Coffee",
  pattern: "coffee house",
  query: "",
  ...draft,
});

describe("the book behind the screens", () => {
  it("holds one row per id, one profile and payments filed under its categories", () => {
    expect(Schema.is(CatalogSnapshotSchema)(demoCatalog)).toBe(true);
    expect(categoryCount(demoCatalog)).toBe(demoCatalog.categories.length);
    expect(merchantRows(demoCatalog).length).toBeGreaterThan(1);
  });

  it("files every demo payment in the month the screen opens on", () => {
    const months = new Set(
      demoCatalog.payments.map((payment) => monthOfMillis(payment.occurredAt))
    );

    expect(months.has(demoLatestMonth)).toBe(true);
    expect(spendByCategory(demoCatalog, demoLatestMonth).length).toBe(
      demoCatalog.categories.length
    );
  });
});

describe("categories on screen", () => {
  it("adds a category with a name, a colour and a parent", () => {
    const { catalog, notice } = applied(
      demoCatalog,
      cases.CreateCategory.make(
        parsedCategory({ name: "Eating out", parentId: demoCategoryIds.living })
      )
    );

    const added = catalog.categories.find(
      (category) => category.name === "Eating out"
    );

    expect(notice).toBe("Category added.");
    expect(added?.parentId).toBe(demoCategoryIds.living);
    expect(added?.color).toBe("#0369a1");
    expect(catalog.categories).toHaveLength(demoCatalog.categories.length + 1);
  });

  it("refuses a second category with the same name", () => {
    expect(
      refusedWith(
        demoCatalog,
        cases.CreateCategory.make(parsedCategory({ name: "Groceries" }))
      )
    ).toBe("duplicateCategoryName");
  });

  it("refuses a parent that would loop the tree", () => {
    const groceries = demoCatalog.categories.find(
      (category) => category.id === demoCategoryIds.groceries
    );

    expect(groceries).toBeDefined();

    expect(
      refusedWith(
        demoCatalog,
        cases.UpdateCategory.make({
          color: "#15803d",
          id: demoCategoryIds.living,
          name: "Living",
          parentId: Option.some(demoCategoryIds.groceries),
          spendingType: "personal",
        })
      )
    ).toBe("parentCycle");
  });

  it("renames a category and moves it under another", () => {
    const { catalog } = applied(
      demoCatalog,
      cases.UpdateCategory.make({
        color: "#be123c",
        id: demoCategoryIds.groceries,
        name: "Food shopping",
        parentId: Option.some(demoCategoryIds.personal),
        spendingType: "personal",
      })
    );

    const moved = catalog.categories.find(
      (category) => category.id === demoCategoryIds.groceries
    );

    expect(moved?.name).toBe("Food shopping");
    expect(moved?.parentId).toBe(demoCategoryIds.personal);
  });

  it("refuses to delete a category that still holds children", () => {
    expect(
      refusedWith(
        demoCatalog,
        cases.DeleteCategory.make({ id: demoCategoryIds.living })
      )
    ).toBe("categoryHasChildren");
  });

  it("deletes a category and leaves its payments unfiled", () => {
    const { catalog, notice } = applied(
      demoCatalog,
      cases.DeleteCategory.make({ id: demoCategoryIds.coffee })
    );

    expect(notice).toBe("Category deleted.");
    expect(
      catalog.categories.some(
        (category) => category.id === demoCategoryIds.coffee
      )
    ).toBe(false);
    expect(
      catalog.payments.every(
        (payment) => payment.categoryId !== demoCategoryIds.coffee
      )
    ).toBe(true);
  });

  it("takes a child's spend into its parent's total", () => {
    const rows = spendByCategory(demoCatalog, demoLatestMonth);

    const living = rows.find(
      (row) => row.category.id === demoCategoryIds.living
    );

    const groceries = rows.find(
      (row) => row.category.id === demoCategoryIds.groceries
    );

    const below = demoCatalog.categories
      .filter(
        (category) =>
          category.id === demoCategoryIds.living ||
          descendantIds(
            demoCatalog.categories,
            demoCategoryIds.living
          ).includes(category.id)
      )
      .map(
        (category) =>
          rows.find((row) => row.category.id === category.id)?.ownMinor ?? 0
      )
      .reduce<number>((sum, minor) => sum + minor, 0);

    expect(living).toBeDefined();
    expect(groceries).toBeDefined();
    expect(Number(living?.totalMinor)).toBe(below);
    expect(Option.isSome(living?.share ?? Option.none())).toBe(true);
    expect(Option.isNone(groceries?.share ?? Option.some(0))).toBe(true);
  });
});

describe("rules on screen", () => {
  it("adds a rule from a pattern, a category and a direction", () => {
    const parsed = parseRuleDraft(demoCatalog, ruleDraft());

    if (Result.isFailure(parsed)) {
      throw new Error(parsed.failure);
    }

    const { catalog, notice } = applied(
      demoCatalog,
      cases.CreateRule.make({ draft: parsed.success.draft })
    );

    const added = catalog.rules.find((rule) => rule.pattern === "Demo Coffee");

    expect(notice).toBe("Rule added.");
    expect(added?.categoryId).toBe(demoCategoryIds.coffee);
    expect(added?.direction).toBe("out");
    expect(catalog.rules).toHaveLength(demoCatalog.rules.length + 1);
  });

  it("keeps an amount threshold on the rule", () => {
    const parsed = parseRuleDraft(
      demoCatalog,
      ruleDraft({ minAmount: "25", pattern: "Demo Cinema" })
    );

    if (Result.isFailure(parsed)) {
      throw new Error(parsed.failure);
    }

    const { catalog } = applied(
      demoCatalog,
      cases.CreateRule.make({ draft: parsed.success.draft })
    );

    const added = catalog.rules.find((rule) => rule.pattern === "Demo Cinema");

    expect(Option.getOrNull(added?.minAmount ?? Option.none())).toBe(2500);
  });

  it("turns a rule off, moves it and deletes it", () => {
    const [rule] = demoCatalog.rules;

    if (rule === undefined) {
      throw new Error("the demo book holds rules");
    }

    const off = applied(
      demoCatalog,
      cases.SetRuleEnabled.make({ enabled: false, id: rule.id })
    );

    const moved = applied(
      off.catalog,
      cases.MoveRule.make({ categoryId: demoCategoryIds.personal, id: rule.id })
    );

    const deleted = applied(
      moved.catalog,
      cases.DeleteRule.make({ id: rule.id })
    );

    expect(off.notice).toBe("Rule is off.");
    expect(
      off.catalog.rules.find((candidate) => candidate.id === rule.id)?.enabled
    ).toBe(false);
    expect(
      moved.catalog.rules.find((candidate) => candidate.id === rule.id)
        ?.categoryId
    ).toBe(demoCategoryIds.personal);
    expect(
      deleted.catalog.rules.some((candidate) => candidate.id === rule.id)
    ).toBe(false);
  });

  it("re-applies every rule to the payments already stored", () => {
    const { catalog, notice } = applied(demoCatalog, cases.ApplyRules.make({}));

    const filed = (merchant: string) =>
      catalog.payments.filter((payment) => payment.merchant === merchant);

    const grocer = filed("Demo Grocer");
    const smallCoffee = filed("Demo Coffee");

    expect(notice).toContain("sorted");
    expect(grocer.length).toBeGreaterThan(0);
    expect(
      grocer.every(
        (payment) =>
          payment.categoryId === demoCategoryIds.groceries &&
          payment.source === "rule"
      )
    ).toBe(true);
    expect(smallCoffee.every((payment) => payment.categoryId === null)).toBe(
      true
    );
    expect(
      filed("Example Ltd").every(
        (payment) => payment.categoryId === demoCategoryIds.everythingElse
      )
    ).toBe(true);
    expect(
      filed("Demo Cinema").every(
        (payment) =>
          payment.categoryId === demoCategoryIds.personal &&
          payment.source === "manual"
      )
    ).toBe(true);
  });

  it("leaves a payment a person filed by hand alone", () => {
    const rows = merchantRows(demoCatalog);
    const grocer = rows.find((row) => row.label === "Demo Grocer");
    const cinema = rows.find((row) => row.label === "Demo Cinema");

    if (grocer === undefined || cinema === undefined) {
      throw new Error("the demo book holds Demo Grocer and Demo Cinema");
    }

    const byHand = applied(
      applied(
        demoCatalog,
        cases.AssignMerchantCategory.make({
          categoryId: Option.some(demoCategoryIds.travel),
          key: grocer.key,
        })
      ).catalog,
      cases.AssignMerchantCategory.make({
        categoryId: Option.some(demoCategoryIds.personal),
        key: cinema.key,
      })
    );

    const sorted = applied(byHand.catalog, cases.ApplyRules.make({}));

    expect(
      paymentsForMerchant(sorted.catalog, grocer.key).every(
        (payment) =>
          payment.categoryId === demoCategoryIds.travel &&
          payment.source === "manual"
      )
    ).toBe(true);
    expect(
      paymentsForMerchant(sorted.catalog, cinema.key).every(
        (payment) =>
          payment.categoryId === demoCategoryIds.personal &&
          payment.source === "manual"
      )
    ).toBe(true);
  });

  it("keeps the category of a payment no rule matches", () => {
    const railRule = demoCatalog.rules.find(
      (rule) => rule.pattern === "Demo Rail"
    );

    if (railRule === undefined) {
      throw new Error("the demo book holds a rule for Demo Rail");
    }

    const off = applied(
      demoCatalog,
      cases.SetRuleEnabled.make({ enabled: false, id: railRule.id })
    );

    const sorted = applied(off.catalog, cases.ApplyRules.make({}));

    expect(
      sorted.catalog.payments
        .filter((payment) => payment.merchant === "Demo Rail")
        .every((payment) => payment.categoryId === demoCategoryIds.travel)
    ).toBe(true);
  });

  it("changes nothing when every rule is off", () => {
    let catalog = demoCatalog;

    for (const rule of demoCatalog.rules) {
      const { catalog: next } = applied(
        catalog,
        cases.SetRuleEnabled.make({ enabled: false, id: rule.id })
      );

      catalog = next;
    }

    const sorted = applied(catalog, cases.ApplyRules.make({}));

    expect(sorted.catalog.payments).toStrictEqual(catalog.payments);
    expect(sorted.notice).toBe("0 payments sorted.");
  });

  it("skips a rule whose category was deleted", () => {
    const deleted = applied(
      demoCatalog,
      cases.DeleteCategory.make({ id: demoCategoryIds.travel })
    );

    expect(
      deleted.catalog.rules.some(
        (rule) => rule.categoryId === demoCategoryIds.travel
      )
    ).toBe(true);

    const sorted = applied(deleted.catalog, cases.ApplyRules.make({}));

    expect(
      sorted.catalog.payments.some(
        (payment) => payment.categoryId === demoCategoryIds.travel
      )
    ).toBe(false);
    expect(
      sorted.catalog.payments
        .filter((payment) => payment.merchant === "Demo Rail")
        .every((payment) => payment.categoryId === null)
    ).toBe(true);
  });

  it("refuses a rule that names a category the book does not hold", () => {
    expect(
      parseRuleDraft(
        demoCatalog,
        ruleDraft({ categoryId: "0197a000-00ff-7aff-8aff-0000000000ff" })
      )
    ).toStrictEqual(Result.fail(categoryChoiceRefusal));
  });

  it("refuses amounts whose least is larger than their most", () => {
    const parsed = parseRuleDraft(
      demoCatalog,
      ruleDraft({ maxAmount: "10", minAmount: "20" })
    );

    expect(Result.isFailure(parsed)).toBe(true);
    expect(Result.isFailure(parsed) ? parsed.failure : "").toContain("least");
  });
});

describe("aliases on screen", () => {
  it("adds an alias from a pattern the merchant shows", () => {
    const parsed = parseAliasDraft(aliasDraft());

    if (Result.isFailure(parsed)) {
      throw new Error(parsed.failure);
    }

    const { catalog, notice } = applied(
      demoCatalog,
      cases.SaveAlias.make({
        id: Option.none(),
        matchType: parsed.success.matchType,
        pattern: parsed.success.pattern,
        payee: parsed.success.payee,
      })
    );

    expect(notice).toBe("Alias added.");
    expect(
      catalog.aliases.some((alias) => alias.pattern === "coffee house")
    ).toBe(true);
  });

  it("edits and deletes an alias", () => {
    const [alias] = demoCatalog.aliases;

    if (alias === undefined) {
      throw new Error("the demo book holds aliases");
    }

    const edited = applied(
      demoCatalog,
      cases.SaveAlias.make({
        id: Option.some(alias.id),
        matchType: "prefix",
        pattern: "coffee house",
        payee: AliasPayeeSchema.cases.Existing.make({ payeeId: alias.payeeId }),
      })
    );

    const removed = applied(
      edited.catalog,
      cases.DeleteAlias.make({ id: alias.id })
    );

    expect(edited.notice).toBe("Alias saved.");
    expect(
      edited.catalog.aliases.find((candidate) => candidate.id === alias.id)
        ?.matchType
    ).toBe("prefix");
    expect(removed.notice).toBe("Alias deleted.");
  });

  it("refuses a pattern another alias already owns", () => {
    const [alias, other] = demoCatalog.aliases;

    if (alias === undefined || other === undefined) {
      throw new Error("the demo book holds aliases");
    }

    expect(
      refusedWith(
        demoCatalog,
        cases.SaveAlias.make({
          id: Option.some(other.id),
          matchType: "exact",
          pattern: alias.pattern,
          payee: AliasPayeeSchema.cases.Existing.make({
            payeeId: other.payeeId,
          }),
        })
      )
    ).toBe("duplicateAlias");
  });

  it("combines two merchants into one and renames their payments", () => {
    const coffee = demoCatalog.payees.find(
      (payee) => payee.name === "Demo Coffee"
    );

    const cinema = demoCatalog.payees.find(
      (payee) => payee.name === "Demo Cinema"
    );

    if (coffee === undefined || cinema === undefined) {
      throw new Error("the demo book holds both merchants");
    }

    const before = paymentsForMerchant(
      demoCatalog,
      `payee:${coffee.id}`
    ).length;

    const { catalog, notice } = applied(
      demoCatalog,
      cases.MergePayees.make({ from: cinema.id, into: coffee.id })
    );

    expect(notice).toContain("Demo Cinema is now Demo Coffee");
    expect(catalog.payees.some((payee) => payee.id === cinema.id)).toBe(false);
    expect(
      paymentsForMerchant(catalog, `payee:${coffee.id}`).length
    ).toBeGreaterThan(before);
  });

  it("refuses to combine a merchant with itself", () => {
    const [coffee] = demoCatalog.payees;

    if (coffee === undefined) {
      throw new Error("the demo book holds merchants");
    }

    expect(
      refusedWith(
        demoCatalog,
        cases.MergePayees.make({ from: coffee.id, into: coffee.id })
      )
    ).toBe("sameMerchant");
  });

  it("searches merchant names while adding an alias", () => {
    const matches = aliasCandidates(demoCatalog, "coffee");

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((match) => match.label === "Demo Coffee")).toBe(true);
    expect(aliasCandidates(demoCatalog, "zzzzz").length).toBe(0);
  });

  it("lists the merchant names that mean one real merchant", () => {
    const groups = aliasGroups(demoCatalog);
    const coffee = groups.find((group) => group.payee.name === "Demo Coffee");

    expect(coffee?.aliases.map((alias) => alias.pattern)).toContain(
      "coffee shop"
    );
  });
});

describe("merchants on screen", () => {
  it("lists merchants with their count, total and most recent payment", () => {
    const rows = merchantRows(demoCatalog);
    const coffee = rows.find((row) => row.label === "Demo Coffee");

    expect(coffee?.count).toBe(
      paymentsForMerchant(demoCatalog, coffee?.key ?? "").length
    );
    expect(coffee?.totalMinor).toBeGreaterThan(0);
    expect(coffee?.latestAt).toBeGreaterThan(0);
  });

  it("narrows the list to one category or the uncategorised ones", () => {
    const rows = merchantRows(demoCatalog);

    const filtered = filterMerchants(
      rows,
      MerchantFilterSchema.cases.Of.make({
        categoryId: demoCategoryIds.groceries,
      })
    );

    const unfiled = filterMerchants(
      rows,
      MerchantFilterSchema.cases.Uncategorised.make({})
    );

    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.every((row) =>
        row.categoryIds.includes(demoCategoryIds.groceries)
      )
    ).toBe(true);
    expect(unfiled.every((row) => row.uncategorised > 0)).toBe(true);
  });

  it("shows which rule already covers a merchant", () => {
    const rows = merchantRows(demoCatalog);
    const covered = rows.filter((row) => Option.isSome(row.coveringRule));

    expect(covered.length).toBeGreaterThan(0);
  });

  it("sets a category on every payment one merchant made", () => {
    const rows = merchantRows(demoCatalog);
    const cinema = rows.find((row) => row.label === "Demo Cinema");

    if (cinema === undefined) {
      throw new Error("the demo book holds Demo Cinema");
    }

    const { catalog, notice } = applied(
      demoCatalog,
      cases.AssignMerchantCategory.make({
        categoryId: Option.some(demoCategoryIds.personal),
        key: cinema.key,
      })
    );

    expect(notice).toBe(`${cinema.count} payments filed under Personal.`);
    expect(
      paymentsForMerchant(catalog, cinema.key).every(
        (payment) => payment.categoryId === demoCategoryIds.personal
      )
    ).toBe(true);
  });

  it("renames a merchant everywhere it appears", () => {
    const rows = merchantRows(demoCatalog);
    const cinema = rows.find((row) => row.label === "Demo Cinema");

    if (cinema === undefined) {
      throw new Error("the demo book holds Demo Cinema");
    }

    const { catalog } = applied(
      demoCatalog,
      cases.RenameMerchant.make({ key: cinema.key, name: "Demo Picture House" })
    );

    expect(
      paymentsForMerchant(catalog, cinema.key).every(
        (payment) => payment.merchant === "Demo Picture House"
      )
    ).toBe(true);
    expect(
      catalog.payees.some((payee) => payee.name === "Demo Picture House")
    ).toBe(true);
  });

  it("marks every payment from one merchant confirmed", () => {
    const rows = merchantRows(demoCatalog);
    const coffee = rows.find((row) => row.label === "Demo Coffee");

    if (coffee === undefined) {
      throw new Error("the demo book holds Demo Coffee");
    }

    const { catalog, notice } = applied(
      demoCatalog,
      cases.ConfirmMerchant.make({ key: coffee.key })
    );

    expect(notice).toContain("confirmed");
    expect(
      paymentsForMerchant(catalog, coffee.key).every(
        (payment) => payment.reviewed
      )
    ).toBe(true);
  });

  it("draws one merchant's spend by category and by month", () => {
    const rows = merchantRows(demoCatalog);
    const grocer = rows.find((row) => row.label === "Demo Grocer");

    if (grocer === undefined) {
      throw new Error("the demo book holds Demo Grocer");
    }

    const slices = merchantSpendByCategory(demoCatalog, grocer.key);

    expect(slices.length).toBeGreaterThan(0);
    expect(slices.reduce((sum, slice) => sum + slice.share, 0)).toBe(10_000);
  });

  it("pages a merchant's payments", () => {
    const rows = merchantRows(demoCatalog);
    const grocer = rows.find((row) => row.label === "Demo Grocer");

    if (grocer === undefined) {
      throw new Error("the demo book holds Demo Grocer");
    }

    const payments = paymentsForMerchant(demoCatalog, grocer.key);
    const first = paged(payments, 1, 2);
    const last = paged(payments, 99, 2);

    expect(first.items).toHaveLength(Math.min(2, payments.length));
    expect(first.page).toBe(1);
    expect(last.page).toBe(last.pageCount);
    expect(merchantRowOf(rows, grocer.key)).toStrictEqual(Option.some(grocer));
  });
});

const screenFor = (): CategorizeScreenValue => initialCategorize;

const update = (
  screen: CategorizeScreenValue,
  message: CategorizeMessageValue,
  access: SettingsRoleValue = "owner"
) => updateCategorize(screen, access, message);

const typedCategory = (
  screen: CategorizeScreenValue,
  draft: Partial<CategoryDraft>
): CategorizeScreenValue => {
  let next = update(screen, Message.StartedCreateCategory()).model;

  for (const field of ["color", "name", "parentId", "spendingType"] as const) {
    const value = draft[field];

    if (value !== undefined) {
      next = update(next, Message.TypedCategory({ field, value })).model;
    }
  }

  return next;
};

describe("the screen state", () => {
  it("opens an empty category form and closes it again", () => {
    const opened = update(screenFor(), Message.StartedCreateCategory()).model;

    expect(CategoryForm.guards.Creating(opened.categoryForm)).toBe(true);

    const cancelled = update(opened, Message.CancelledCategory()).model;

    expect(CategoryForm.guards.Closed(cancelled.categoryForm)).toBe(true);
  });

  it("refuses an empty category name without sending anything", () => {
    const submitted = update(
      typedCategory(screenFor(), {}),
      Message.SubmittedCategory()
    );

    expect(submitted.commands).toBeUndefined();
    expect(Notice.guards.Refused(submitted.model.notice)).toBe(true);
  });

  it("sends a parsed category to the book", () => {
    const submitted = update(
      typedCategory(screenFor(), {
        name: "Eating out",
        parentId: demoCategoryIds.living,
      }),
      Message.SubmittedCategory()
    );

    expect(submitted.commands).toHaveLength(1);
    expect(submitted.commands?.[0]).toMatchObject({
      args: {
        form: "category",
        write: cases.CreateCategory.make({
          color: "#0f766e",
          name: "Eating out",
          parentId: Option.some(demoCategoryIds.living),
          spendingType: "personal",
        }),
      },
      name: "WriteCatalog",
    });
  });

  it("sends a parsed rule from the rule form", () => {
    let screen = update(screenFor(), Message.StartedCreateRule()).model;

    screen = update(
      screen,
      Message.TypedRule({ field: "pattern", value: "Demo Cinema" })
    ).model;
    screen = update(
      screen,
      Message.TypedRule({ field: "categoryId", value: demoCategoryIds.coffee })
    ).model;
    screen = update(
      screen,
      Message.TypedRule({ field: "minAmount", value: "25.50" })
    ).model;

    const submitted = update(screen, Message.SubmittedRule());

    expect(submitted.commands).toHaveLength(1);
    expect(submitted.commands?.[0]).toMatchObject({
      args: {
        form: "rule",
        write: cases.CreateRule.make({
          draft: parseRuleDraft(
            demoCatalog,
            ruleDraft({
              categoryId: demoCategoryIds.coffee,
              minAmount: "25.50",
              pattern: "Demo Cinema",
            })
          ).pipe((parsed) => {
            if (Result.isFailure(parsed)) {
              throw new Error(parsed.failure);
            }

            return parsed.success.draft;
          }),
        }),
      },
    });
  });

  it("keeps the draft open while the book refuses a write", () => {
    const opened = typedCategory(screenFor(), { name: "Groceries" });

    const failed = update(
      opened,
      Message.FailedWrite({
        reason:
          "A category called `Groceries` already exists. Fix: use another name in `/app/categories`.",
      })
    ).model;

    expect(CategoryForm.guards.Creating(failed.categoryForm)).toBe(true);
    expect(Notice.guards.Refused(failed.notice)).toBe(true);
  });

  it("takes the book back, shows its notice and closes the form", () => {
    const submitted = update(
      typedCategory(screenFor(), { name: "Eating out" }),
      Message.SubmittedCategory()
    );

    const completed = update(
      submitted.model,
      Message.CompletedWrite({
        catalog: demoCatalog,
        form: "category",
        notice: "Category added.",
      })
    ).model;

    expect(CategoryForm.guards.Closed(completed.categoryForm)).toBe(true);
    expect(Notice.guards.Done(completed.notice)).toBe(true);
    expect(completed.catalog).toStrictEqual(demoCatalog);
  });

  it("opens an alias form from the alias list and chooses a merchant", () => {
    const [alias] = demoCatalog.aliases;

    if (alias === undefined) {
      throw new Error("the demo book holds aliases");
    }

    const editing = update(
      screenFor(),
      Message.StartedEditAlias({ id: alias.id })
    ).model;

    expect(AliasForm.guards.Editing(editing.aliasForm)).toBe(true);

    const payee = demoCatalog.payees.find(
      (candidate) => candidate.id === alias.payeeId
    );

    if (payee === undefined) {
      throw new Error("the alias points at a merchant");
    }

    const chosen = update(
      update(editing, Message.StartedCreateAlias()).model,
      Message.ChoseAliasPayee({ payeeId: payee.id })
    ).model;

    const draft = AliasForm.guards.Creating(chosen.aliasForm)
      ? chosen.aliasForm.draft
      : undefined;

    expect(draft?.payeeId).toBe(payee.id);
    expect(draft?.payeeName).toBe(payee.name);
  });

  it("filters merchants and pages them", () => {
    const filtered = update(
      screenFor(),
      Message.FilteredMerchants({
        filter: MerchantFilterSchema.cases.Uncategorised.make({}),
      })
    ).model;

    const pagedScreen = update(
      filtered,
      Message.ChangedPage({ page: 2 })
    ).model;

    expect(filtered.page).toBe(1);
    expect(pagedScreen.page).toBe(2);
  });

  it("changes the month the categories screen reads", () => {
    const earlier = monthOfMillis(
      Schema.decodeSync(TimestampMillisSchema)(
        startOfMonth(demoLatestMonth) - 1
      )
    );

    const changed = update(
      screenFor(),
      Message.ChangedPeriod({ period: earlier })
    ).model;

    expect(changed.period).toBe(earlier);
  });
});

describe("the gateway behind the screen", () => {
  it.effect("writes through the book and hands the new one back", () =>
    Effect.gen(function* writeThroughTheGateway() {
      const parsed = parseRuleDraft(demoCatalog, ruleDraft());

      if (Result.isFailure(parsed)) {
        throw new Error(parsed.failure);
      }

      const completed = yield* WriteCatalog({
        form: "rule",
        write: cases.CreateRule.make({ draft: parsed.success.draft }),
      }).effect;

      expect(Schema.is(Message.CompletedWrite)(completed)).toBe(true);
      expect(
        Schema.is(Message.CompletedWrite)(completed)
          ? completed.catalog.rules.length
          : 0
      ).toBe(demoCatalog.rules.length + 1);
      expect(
        Schema.is(Message.CompletedWrite)(completed) ? completed.notice : ""
      ).toBe("Rule added.");
    }).pipe(Effect.provide(CategorizeGateway.layer))
  );

  it.effect("reports a write the book refuses by its reason", () =>
    Effect.gen(function* refuseAWrite() {
      const failed = yield* WriteCatalog({
        form: "category",
        write: cases.CreateCategory.make({
          color: "#0369a1",
          name: "Groceries",
          parentId: Option.none(),
          spendingType: "personal",
        }),
      }).effect;

      expect(Schema.is(Message.FailedWrite)(failed)).toBe(true);
      expect(
        Schema.is(Message.FailedWrite)(failed) ? failed.reason : ""
      ).toContain("already exists");
    }).pipe(Effect.provide(CategorizeGateway.layer))
  );

  it.effect("keeps a write and reads it back", () =>
    Effect.gen(function* keepAWrite() {
      const gateway = yield* CategorizeGateway;
      const before = yield* gateway.read();

      yield* gateway.write(cases.ApplyRules.make({}));

      const after = yield* gateway.read();

      expect(before.payments).not.toStrictEqual(after.payments);
    }).pipe(Effect.provide(CategorizeGateway.layer))
  );
});

describe("merchant keys", () => {
  it("names one merchant by the payee its names mean", () => {
    const rows = merchantRows(demoCatalog);
    const coffeeRows = rows.filter((row) => row.label === "Demo Coffee");

    expect(coffeeRows).toHaveLength(1);
    expect(Option.isSome(coffeeRows[0]?.payeeId ?? Option.none())).toBe(true);
  });
});

const payeeNamed = (name: string): string => {
  const payee = demoCatalog.payees.find((candidate) => candidate.name === name);

  if (payee === undefined) {
    throw new Error(`the demo book holds ${name}`);
  }

  return payee.id;
};

const typedRule = (screen: CategorizeScreenValue): CategorizeScreenValue =>
  update(
    update(
      update(
        update(screen, Message.StartedCreateRule()).model,
        Message.TypedRule({ field: "pattern", value: "Demo Bakery" })
      ).model,
      Message.TypedRule({ field: "categoryId", value: demoCategoryIds.coffee })
    ).model,
    Message.TypedRule({ field: "minAmount", value: "25" })
  ).model;

const editingCategory = (): CategorizeScreenValue =>
  update(
    screenFor(),
    Message.StartedEditCategory({ id: demoCategoryIds.living })
  ).model;

const editingAlias = (): CategorizeScreenValue => {
  const [alias] = demoCatalog.aliases;

  if (alias === undefined) {
    throw new Error("the demo book holds aliases");
  }

  return update(screenFor(), Message.StartedEditAlias({ id: alias.id })).model;
};

const [firstRule] = demoCatalog.rules;

const [firstAlias] = demoCatalog.aliases;

if (firstRule === undefined || firstAlias === undefined) {
  throw new Error("the demo book holds rules and aliases");
}

const groceryKey = (): string => {
  const row = merchantRows(demoCatalog).find(
    (candidate) => candidate.label === "Demo Grocer"
  );

  if (row === undefined) {
    throw new Error("the demo book holds Demo Grocer");
  }

  return row.key;
};

const viewerWrites: readonly Readonly<{
  message: CategorizeMessageValue;
  name: string;
  screen: CategorizeScreenValue;
}>[] = [
  {
    message: Message.AppliedRules(),
    name: "re-apply",
    screen: screenFor(),
  },
  {
    message: Message.AssignedMerchantCategory({
      categoryId: demoCategoryIds.travel,
      key: groceryKey(),
    }),
    name: "file a merchant",
    screen: screenFor(),
  },
  {
    message: Message.ConfirmedMerchant({ key: groceryKey() }),
    name: "confirm a merchant",
    screen: screenFor(),
  },
  {
    message: Message.DeletedAlias({ id: firstAlias.id }),
    name: "delete an alias",
    screen: screenFor(),
  },
  {
    message: Message.DeletedCategory({ id: demoCategoryIds.travel }),
    name: "delete a category",
    screen: screenFor(),
  },
  {
    message: Message.DeletedRule({ id: firstRule.id }),
    name: "delete a rule",
    screen: screenFor(),
  },
  {
    message: Message.MovedRule({
      categoryId: demoCategoryIds.personal,
      id: firstRule.id,
    }),
    name: "move a rule",
    screen: screenFor(),
  },
  {
    message: Message.SubmittedAlias(),
    name: "save an alias",
    screen: editingAlias(),
  },
  {
    message: Message.SubmittedCategory(),
    name: "create a category",
    screen: typedCategory(screenFor(), {
      name: "Eating out",
      parentId: demoCategoryIds.living,
    }),
  },
  {
    message: Message.SubmittedCategory(),
    name: "edit a category",
    screen: editingCategory(),
  },
  {
    message: Message.SubmittedMerge(),
    name: "combine two merchants",
    screen: {
      ...screenFor(),
      mergeDraft: {
        from: payeeNamed("Demo Grocer"),
        into: payeeNamed("Demo Cinema"),
      },
    },
  },
  {
    message: Message.SubmittedRename({ key: groceryKey() }),
    name: "rename a merchant",
    screen: { ...screenFor(), renameDraft: "Demo Market" },
  },
  {
    message: Message.SubmittedRule(),
    name: "create a rule",
    screen: typedRule(screenFor()),
  },
  {
    message: Message.ToggledRule({ enabled: false, id: firstRule.id }),
    name: "turn a rule off",
    screen: screenFor(),
  },
];

describe("a viewer on the categorize screens", () => {
  it("refuses every write and changes nothing", () => {
    for (const { message, name, screen } of viewerWrites) {
      const outcome = update(screen, message, "viewer");

      expect(outcome.commands, name).toBeUndefined();
      expect({ ...outcome.model, notice: screen.notice }, name).toStrictEqual(
        screen
      );
      expect(Notice.guards.Refused(outcome.model.notice), name).toBe(true);
      expect(
        Notice.guards.Refused(outcome.model.notice)
          ? outcome.model.notice.message
          : "",
        name
      ).toBe(readOnlyRefusal);
    }
  });

  it("lets an owner send the same write", () => {
    for (const { message, name, screen } of viewerWrites) {
      expect(update(screen, message).commands, name).toHaveLength(1);
    }
  });
});

const fixAt = (text: string): number => text.indexOf(" Fix: ");

const headOf = (text: string): string =>
  fixAt(text) === -1 ? text : text.slice(0, fixAt(text));

const fixOf = (text: string): string =>
  fixAt(text) === -1 ? "" : text.slice(fixAt(text) + " Fix: ".length);

describe("refusal texts", () => {
  const texts: readonly string[] = [
    ...formRefusals,
    ...catalogRefusalSamples.map((refusal) => refusal.message),
  ];

  it("says what failed, why, and where to go next", () => {
    for (const text of texts) {
      expect(fixAt(text), text).toBeGreaterThan(0);
      expect(headOf(text).split(". ").length, text).toBeGreaterThanOrEqual(2);
      expect(headOf(text).endsWith("."), text).toBe(true);
      expect(fixOf(text).endsWith("."), text).toBe(true);
      expect(fixOf(text), text).toContain("`");
    }
  });

  it("names the money in pounds, the currency of the demo book", () => {
    expect(amountRefusal).toContain("pounds (£)");
    expect(formRefusals).toContain(
      "That amount is not a number. Amounts are in pounds (£) with up to two decimals. Fix: type a number such as `25` or `25.50` in the amount field."
    );
    expect(BookCurrency).toBe("GBP");
  });
});
