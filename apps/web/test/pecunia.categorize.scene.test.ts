import { it } from "@effect/vitest";
import { Option, Result } from "effect";
import * as Scene from "foldkit/scene";
import { fromString } from "foldkit/url";

import { WriteCatalog } from "../src/client/pecunia/categorize/command.js";
import {
  demoCatalog,
  demoCategoryIds,
} from "../src/client/pecunia/categorize/demo.js";
import { uuidV7At } from "../src/client/pecunia/categorize/ids.js";
import { Message as CategorizeMessage } from "../src/client/pecunia/categorize/message.js";
import {
  AliasPayeeSchema,
  CatalogWriteSchema,
  applyWrite,
} from "../src/client/pecunia/categorize/write.js";
import type { CatalogWrite } from "../src/client/pecunia/categorize/write.js";
import { Message } from "../src/client/pecunia/message.js";
import { initialModel } from "../src/client/pecunia/model.js";
import { minorUnits } from "../src/client/pecunia/money.js";
import { update, view } from "../src/features/pecunia/app.js";

const url = (path: string) =>
  Option.getOrThrow(fromString(`https://pecunia.test${path}`));

const open = (path: string) =>
  Scene.Subscription.emit(Message.ChangedUrl({ url: url(path) }));

const payeeNamed = (name: string) => {
  const payee = demoCatalog.payees.find((candidate) => candidate.name === name);

  if (payee === undefined) {
    throw new Error(`the demo book holds ${name}`);
  }

  return payee;
};

const grocer = payeeNamed("Demo Grocer");

const grocerKey = `payee:${grocer.id}`;

const writeWith = (
  write: CatalogWrite,
  form: "alias" | "category" | "merge" | "none" | "rule",
  base?: Readonly<{ readonly catalog: typeof demoCatalog }>
) => {
  let value = 5000;

  const outcome = applyWrite(base?.catalog ?? demoCatalog, write, {
    newId: () => {
      value += 1;

      return uuidV7At(1_780_000_000_000, value);
    },
  });

  if (Result.isFailure(outcome)) {
    throw new Error(`the write was refused: ${outcome.failure.message}`);
  }

  return CategorizeMessage.CompletedWrite({
    catalog: outcome.success.catalog,
    form,
    notice: outcome.success.notice,
  });
};

const newCategory = CatalogWriteSchema.cases.CreateCategory.make({
  color: "#0f766e",
  name: "Eating out",
  parentId: Option.some(demoCategoryIds.living),
  spendingType: "personal",
});

const newRule = CatalogWriteSchema.cases.CreateRule.make({
  draft: {
    categoryId: demoCategoryIds.coffee,
    direction: "out",
    enabled: true,
    kind: "categorize",
    matchField: "merchant",
    matchType: "contains",
    maxAmount: Option.none(),
    minAmount: Option.some(minorUnits(2500)),
    pattern: "Demo Bakery",
    priority: 0,
  },
});

const addedRule = (() => {
  const outcome = applyWrite(demoCatalog, newRule, {
    newId: () => uuidV7At(1_780_000_000_000, 6001),
  });

  if (Result.isFailure(outcome)) {
    throw new Error(outcome.failure.message);
  }

  const rule = outcome.success.catalog.rules.find(
    (candidate) => candidate.pattern === "Demo Bakery"
  );

  if (rule === undefined) {
    throw new Error("the rule was added");
  }

  return { catalog: outcome.success.catalog, rule };
})();

const savedAlias = CatalogWriteSchema.cases.SaveAlias.make({
  id: Option.none(),
  matchType: "contains",
  pattern: "bakery shop",
  payee: AliasPayeeSchema.cases.Existing.make({
    payeeId: payeeNamed("Demo Cinema").id,
  }),
});

it("adds a category from the categories screen", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    open("/app/categories"),
    Scene.expect(Scene.role("heading", { name: "Categories" })).toExist(),
    Scene.expect(
      Scene.text(`${demoCatalog.categories.length} categories in this book`)
    ).toExist(),
    Scene.expect(Scene.text("Living")).toExist(),
    Scene.expect(Scene.text("Groceries")).toExist(),
    Scene.click(Scene.role("button", { name: "New category" })),
    Scene.type(Scene.role("textbox", { name: "Name" }), "Eating out"),
    Scene.change(
      Scene.role("combobox", { name: "Parent" }),
      demoCategoryIds.living
    ),
    Scene.submit(Scene.selector('form[aria-label="New category"]')),
    Scene.Command.expectExact(
      WriteCatalog({ form: "category", write: newCategory })
    ),
    Scene.Command.resolve(WriteCatalog, writeWith(newCategory, "category")),
    Scene.expect(Scene.role("status")).toHaveText("Category added."),
    Scene.expect(Scene.role("button", { name: "New category" })).toExist(),
    Scene.expect(Scene.text("Eating out")).toExist()
  );
});

it("adds a rule from the rules screen", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    open("/app/rules"),
    Scene.expect(Scene.role("heading", { name: "Rules" })).toExist(),
    Scene.expect(Scene.text("Demo Grocer")).toExist(),
    Scene.click(Scene.role("button", { name: "New rule" })),
    Scene.type(Scene.role("textbox", { name: "Merchant text" }), "Demo Bakery"),
    Scene.change(
      Scene.role("combobox", { name: "Category" }),
      demoCategoryIds.coffee
    ),
    Scene.type(Scene.role("textbox", { name: "Least amount" }), "25"),
    Scene.submit(Scene.selector('form[aria-label="New rule"]')),
    Scene.Command.expectExact(WriteCatalog({ form: "rule", write: newRule })),
    Scene.Command.resolve(
      WriteCatalog,
      CategorizeMessage.CompletedWrite({
        catalog: addedRule.catalog,
        form: "rule",
        notice: "Rule added.",
      })
    ),
    Scene.expect(Scene.role("status")).toHaveText("Rule added."),
    Scene.expect(Scene.text("Demo Bakery")).toExist(),
    Scene.expect(Scene.text("at least £25.00")).toExist(),
    Scene.click(Scene.role("button", { name: "Delete rule for Demo Bakery" })),
    Scene.Command.expectExact(
      WriteCatalog({
        form: "rule",
        write: CatalogWriteSchema.cases.DeleteRule.make({
          id: addedRule.rule.id,
        }),
      })
    ),
    Scene.Command.resolve(
      WriteCatalog,
      writeWith(
        CatalogWriteSchema.cases.DeleteRule.make({ id: addedRule.rule.id }),
        "rule",
        addedRule
      )
    ),
    Scene.expect(Scene.role("status")).toHaveText("Rule deleted.")
  );
});

it("lists the merchant names an alias means and adds one", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    open("/app/aliases"),
    Scene.expect(Scene.role("heading", { name: "Aliases" })).toExist(),
    Scene.expect(Scene.text('contains "coffee shop"')).toExist(),
    Scene.expect(Scene.text("Combine two merchants")).toExist(),
    Scene.click(Scene.role("button", { name: "New alias" })),
    Scene.type(
      Scene.role("textbox", { name: "Text on the statement" }),
      "bakery shop"
    ),
    Scene.type(Scene.role("textbox", { name: "Search merchants" }), "Demo"),
    Scene.click(Scene.role("button", { name: "Demo Cinema" })),
    Scene.expect(Scene.text("Means: Demo Cinema")).toExist(),
    Scene.submit(Scene.selector('form[aria-label="New alias"]')),
    Scene.Command.expectExact(
      WriteCatalog({ form: "alias", write: savedAlias })
    ),
    Scene.Command.resolve(WriteCatalog, writeWith(savedAlias, "alias")),
    Scene.expect(Scene.role("status")).toHaveText("Alias added."),
    Scene.expect(Scene.text('contains "bakery shop"')).toExist()
  );
});

it("shows merchants with their count, total and rule, and files one", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    open("/app/merchants"),
    Scene.expect(Scene.role("heading", { name: "Merchants" })).toExist(),
    Scene.expect(Scene.text("Demo Grocer")).toExist(),
    Scene.expect(Scene.text("Rule: Demo Grocer")).toExist(),
    Scene.change(
      Scene.role("combobox", { name: "Category for Demo Cinema" }),
      demoCategoryIds.personal
    ),
    Scene.Command.expectExact(
      WriteCatalog({
        form: "none",
        write: CatalogWriteSchema.cases.AssignMerchantCategory.make({
          categoryId: Option.some(demoCategoryIds.personal),
          key: `payee:${payeeNamed("Demo Cinema").id}`,
        }),
      })
    ),
    Scene.Command.resolve(
      WriteCatalog,
      writeWith(
        CatalogWriteSchema.cases.AssignMerchantCategory.make({
          categoryId: Option.some(demoCategoryIds.personal),
          key: `payee:${payeeNamed("Demo Cinema").id}`,
        }),
        "none"
      )
    ),
    Scene.change(
      Scene.role("combobox", { name: "Show" }),
      demoCategoryIds.utilities
    ),
    Scene.expect(Scene.text("Demo Energy")).toExist(),
    Scene.expect(Scene.text("Demo Cinema")).toBeAbsent()
  );
});

it("shows one merchant's spend, months and payments with paging", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    open(`/app/merchants/${grocerKey}`),
    Scene.expect(Scene.role("heading", { name: "Demo Grocer" })).toExist(),
    Scene.expect(Scene.text("Total spent")).toExist(),
    Scene.expect(Scene.text("Spend by category")).toExist(),
    Scene.expect(Scene.text("Monthly spend")).toExist(),
    Scene.expect(Scene.text("1 of 3 · 12 payments, 5 a page")).toExist(),
    Scene.click(Scene.role("button", { name: "Older" })),
    Scene.expect(Scene.text("2 of 3 · 12 payments, 5 a page")).toExist(),
    Scene.click(Scene.role("button", { name: "Newer" })),
    Scene.expect(Scene.text("1 of 3 · 12 payments, 5 a page")).toExist(),
    Scene.click(Scene.role("button", { name: "Confirm every payment" })),
    Scene.Command.expectExact(
      WriteCatalog({
        form: "none",
        write: CatalogWriteSchema.cases.ConfirmMerchant.make({
          key: grocerKey,
        }),
      })
    ),
    Scene.Command.resolve(
      WriteCatalog,
      writeWith(
        CatalogWriteSchema.cases.ConfirmMerchant.make({ key: grocerKey }),
        "none"
      )
    ),
    Scene.type(
      Scene.role("textbox", { name: "Merchant name" }),
      "Demo Grocery Store"
    ),
    Scene.submit(Scene.selector('form[aria-label="Rename merchant"]')),
    Scene.Command.expectExact(
      WriteCatalog({
        form: "none",
        write: CatalogWriteSchema.cases.RenameMerchant.make({
          key: grocerKey,
          name: "Demo Grocery Store",
        }),
      })
    ),
    Scene.Command.resolve(
      WriteCatalog,
      writeWith(
        CatalogWriteSchema.cases.RenameMerchant.make({
          key: grocerKey,
          name: "Demo Grocery Store",
        }),
        "none"
      )
    ),
    Scene.expect(Scene.role("status")).toHaveText(
      "Renamed to Demo Grocery Store on 12 payments."
    )
  );
});

it("names a merchant that is not in the book instead of failing", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    open("/app/merchants/payee:missing"),
    Scene.expect(
      Scene.role("heading", { name: "Merchant not found" })
    ).toExist(),
    Scene.expect(Scene.text("pick a merchant from the list")).toExist()
  );
});
