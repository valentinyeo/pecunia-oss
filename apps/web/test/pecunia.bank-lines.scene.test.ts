import { it } from "@effect/vitest";
import type { BankLine } from "@pecunia/bank-lines/model";
import {
  CategoryChangeSchema,
  NoteChangeSchema,
} from "@pecunia/bank-lines/model";
import { Option } from "effect";
import * as Scene from "foldkit/scene";
import { fromString } from "foldkit/url";

import {
  AcceptSuggestion,
  LoadLines,
  SaveLine,
  SuggestCategories,
} from "../src/client/pecunia/bank-lines/command.js";
import { Message as BankLinesMessage } from "../src/client/pecunia/bank-lines/message.js";
import {
  filterFor,
  LineScope,
  reviewFilter,
} from "../src/client/pecunia/bank-lines/model.js";
import { Message } from "../src/client/pecunia/message.js";
import { initialModel } from "../src/client/pecunia/model.js";
import { update, view } from "../src/features/pecunia/app.js";
import {
  categoryIdOf,
  demoLines,
  lineIdOf,
  lineWithMerchant,
  uncategorisedLines,
} from "./pecunia-bank-lines-fixture.js";

const url = (path: string) =>
  Option.getOrThrow(fromString(`https://pecunia.test${path}`));

const openTransactions = Scene.Subscription.emit(
  Message.ChangedUrl({ url: url("/app/transactions") })
);

const openReview = Scene.Subscription.emit(
  Message.ChangedUrl({ url: url("/app/review") })
);

const page = (lines: readonly BankLine[]) => ({
  lines: [...lines],
  next: Option.none(),
  total: lines.length,
});

const allFilter = filterFor(LineScope.All());

const coffee = lineWithMerchant("Demo Coffee");

const coffeeId = lineIdOf(coffee);

const tax = lineWithMerchant("Demo Tax Office");

const taxId = lineIdOf(tax);

const designTool = lineWithMerchant("Demo Design Tool");

const designToolId = lineIdOf(designTool);

const software = categoryIdOf("Software");

const office = categoryIdOf("Office");

const designTools = categoryIdOf("Design tools");

const coffeeLabel = "Demo Coffee on 3 Nov 2025";

it("a person finds a line, edits its category and sees it saved", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    openTransactions,
    Scene.Command.expectExact(
      LoadLines({ filter: allFilter, generation: 2, search: "" })
    ),
    Scene.Command.resolve(
      LoadLines,
      BankLinesMessage.CompletedLoad({ generation: 2, page: page(demoLines) })
    ),
    Scene.expect(Scene.role("heading", { name: "Transactions" })).toExist(),
    Scene.expect(
      Scene.text(
        "Every line the demo sync wrote, newest first. Mark one reviewed when it is counted."
      )
    ).toExist(),
    Scene.expect(
      Scene.role("searchbox", { name: "Search bank lines" })
    ).toHaveAttr("maxLength", "200"),
    Scene.type(
      Scene.role("searchbox", { name: "Search bank lines" }),
      "coffee"
    ),
    Scene.Command.expectExact(
      LoadLines({ filter: allFilter, generation: 3, search: "coffee" })
    ),
    Scene.Command.resolve(
      LoadLines,
      BankLinesMessage.CompletedLoad({ generation: 3, page: page([coffee]) })
    ),
    Scene.expect(Scene.text("Demo Coffee")).toExist(),
    Scene.expect(Scene.text("−€89.00")).toExist(),
    Scene.click(Scene.role("button", { name: `Edit ${coffeeLabel}` })),
    Scene.change(Scene.role("combobox", { name: "Category" }), software),
    Scene.click(Scene.role("button", { name: "Save line" })),
    Scene.Command.expectExact(
      SaveLine({
        edit: {
          category: CategoryChangeSchema.cases.Assigned.make({
            categoryId: software,
          }),
          lineId: coffeeId,
          note: NoteChangeSchema.cases.Unchanged.make({}),
        },
      })
    ),
    Scene.Command.resolve(
      SaveLine,
      BankLinesMessage.CompletedEdit({
        line: { ...coffee, category: Option.some(software) },
      })
    ),
    Scene.expect(Scene.text("Software")).toExist(),
    Scene.expect(Scene.text("Saved.")).toExist()
  );
});

it("the transactions screen offers a review for a line awaiting one", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    openTransactions,
    Scene.Command.resolve(
      LoadLines,
      BankLinesMessage.CompletedLoad({ generation: 2, page: page([coffee]) })
    ),
    Scene.expect(
      Scene.role("button", { name: `Mark ${coffeeLabel} reviewed` })
    ).toExist(),
    Scene.expect(Scene.text("Awaiting review")).toExist(),
    Scene.expect(Scene.text("Eating out")).toHaveAttr(
      "href",
      "/app/spending/category/0192f0c1-0011-79f9-8c9a-c9af5a7eff0d"
    )
  );
});

it("a viewer sees the lines and no way to edit one", () => {
  Scene.scene(
    { update, view },
    Scene.given({ ...initialModel, access: "viewer" }),
    openTransactions,
    Scene.Command.resolve(
      LoadLines,
      BankLinesMessage.CompletedLoad({ generation: 2, page: page([coffee]) })
    ),
    Scene.expect(Scene.text("Demo Coffee")).toExist(),
    Scene.expect(
      Scene.role("button", { name: `Edit ${coffeeLabel}` })
    ).toBeAbsent(),
    Scene.expect(
      Scene.role("button", { name: `Mark ${coffeeLabel} reviewed` })
    ).toBeAbsent()
  );
});

it("the review screen lists the merchants with no category", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    openReview,
    Scene.Command.expectExact(
      LoadLines({ filter: reviewFilter, generation: 1, search: "" })
    ),
    Scene.Command.resolve(
      LoadLines,
      BankLinesMessage.CompletedLoad({
        generation: 1,
        page: page(uncategorisedLines),
      })
    ),
    Scene.expect(Scene.role("heading", { name: "Review" })).toExist(),
    Scene.expect(Scene.text("Demo Tax Office")).toExist(),
    Scene.expectAll(Scene.all.text("No category")).toHaveCount(
      uncategorisedLines.length
    )
  );
});

it("the review screen suggests categories and accepts them in one go", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    openReview,
    Scene.Command.resolve(
      LoadLines,
      BankLinesMessage.CompletedLoad({
        generation: 1,
        page: page([tax, designTool]),
      })
    ),
    Scene.click(Scene.role("button", { name: "Suggest categories" })),
    Scene.Command.expectHas(SuggestCategories),
    Scene.Command.resolve(
      SuggestCategories,
      BankLinesMessage.CompletedSuggestions({
        items: [
          { categoryId: office, confidence: 0.86, lineId: taxId },
          { categoryId: designTools, confidence: 0.83, lineId: designToolId },
        ],
      })
    ),
    Scene.expect(Scene.text("2 suggestions are ready.")).toExist(),
    Scene.expect(Scene.text("Suggested: Office at 86% confidence")).toExist(),
    Scene.click(Scene.role("button", { name: "Accept every suggestion" })),
    Scene.Command.expectExact(
      AcceptSuggestion({ categoryId: office, lineId: taxId }),
      AcceptSuggestion({ categoryId: designTools, lineId: designToolId })
    ),
    Scene.Command.resolve(
      AcceptSuggestion({ categoryId: office, lineId: taxId }),
      BankLinesMessage.CompletedSuggestion({
        line: { ...tax, category: Option.some(office) },
      })
    ),
    Scene.Command.resolve(
      AcceptSuggestion({ categoryId: designTools, lineId: designToolId }),
      BankLinesMessage.CompletedSuggestion({
        line: { ...designTool, category: Option.some(designTools) },
      })
    ),
    Scene.expect(Scene.text("Accepted 2 suggestions.")).toExist(),
    Scene.expect(Scene.text("Every bank line carries a category.")).toExist()
  );
});
