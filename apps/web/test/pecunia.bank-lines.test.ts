import { expect, it } from "@effect/vitest";
import { demoCategories } from "@pecunia/bank-lines/demo";
import {
  CategoryChangeSchema,
  CategoryFilterSchema,
  CategoryIdSchema,
  NoteChangeSchema,
  ReviewFilterSchema,
  ReviewSchema,
  TimestampMillisSchema,
} from "@pecunia/bank-lines/model";
import type { BankLine } from "@pecunia/bank-lines/model";
import { Effect, Option, Predicate, Schema } from "effect";

import {
  LoadLines,
  ReviewLine,
  SaveLine,
} from "../src/client/pecunia/bank-lines/command.js";
import { BankLinesGateway } from "../src/client/pecunia/bank-lines/gateway.js";
import { Message } from "../src/client/pecunia/bank-lines/message.js";
import type { BankLinesMessageValue } from "../src/client/pecunia/bank-lines/message.js";
import {
  BankLinesScreen,
  filterFor,
  LineEditState,
  LineList,
  LineScope,
  reviewFilter,
  Suggestions,
} from "../src/client/pecunia/bank-lines/model.js";
import type {
  BankLinesScreenValue,
  LineEditStateValue,
  SuggestionsValue,
} from "../src/client/pecunia/bank-lines/model.js";
import {
  openBrowse,
  openReview,
  update,
} from "../src/client/pecunia/bank-lines/update.js";
import { demoCatalogue } from "../src/client/pecunia/catalogue.js";
import type { AccessRoleValue } from "../src/client/pecunia/model.js";
import {
  categoryIdOf,
  demoLines,
  lineIdOf,
  lineWithMerchant,
  uncategorisedLines,
} from "./pecunia-bank-lines-fixture.js";

const owner: AccessRoleValue = "owner";

const viewer: AccessRoleValue = "viewer";

const coffee = lineWithMerchant("Demo Coffee");

const coffeeId = lineIdOf(coffee);

const cloudLine = lineWithMerchant("Demo Cloud Hosting");

const taxLine = lineWithMerchant("Demo Tax Office");

const taxId = lineIdOf(taxLine);

const software = categoryIdOf("Software");

const office = categoryIdOf("Office");

const designTools = categoryIdOf("Design tools");

const inventedCategory =
  Schema.decodeSync(CategoryIdSchema)("category-missing");

const reviewedAt = (at: number) =>
  ReviewSchema.cases.Reviewed.make({
    at: Schema.decodeSync(TimestampMillisSchema)(at),
  });

const send = (
  screen: BankLinesScreenValue,
  message: BankLinesMessageValue,
  role: AccessRoleValue = owner
) => update(screen, role, message);

const browseOf = (
  lines: readonly BankLine[],
  search = ""
): BankLinesScreenValue =>
  BankLinesScreen.Browse({
    edit: LineEditState.Idle(),
    generation: 1,
    list: LineList.Ready({ lines: [...lines], total: lines.length }),
    scope: LineScope.All(),
    search,
  });

const loadingBrowse = (): BankLinesScreenValue =>
  BankLinesScreen.Browse({
    edit: LineEditState.Idle(),
    generation: 1,
    list: LineList.Loading(),
    scope: LineScope.All(),
    search: "",
  });

const reviewOf = (
  suggestions: SuggestionsValue = Suggestions.Idle()
): BankLinesScreenValue =>
  BankLinesScreen.Review({
    edit: LineEditState.Idle(),
    generation: 1,
    list: LineList.Ready({
      lines: [...uncategorisedLines],
      total: uncategorisedLines.length,
    }),
    suggestions,
  });

const editOf = (screen: BankLinesScreenValue): LineEditStateValue =>
  BankLinesScreen.match<LineEditStateValue>(screen, {
    Browse: ({ edit }) => edit,
    Review: ({ edit }) => edit,
  });

const listLinesOf = (screen: BankLinesScreenValue): readonly BankLine[] =>
  BankLinesScreen.match<readonly BankLine[]>(screen, {
    Browse: ({ list }) =>
      LineList.match<readonly BankLine[]>(list, {
        Failed: () => [],
        Loading: () => [],
        Ready: ({ lines }) => lines,
      }),
    Review: ({ list }) =>
      LineList.match<readonly BankLine[]>(list, {
        Failed: () => [],
        Loading: () => [],
        Ready: ({ lines }) => lines,
      }),
  });

const suggestionsOf = (screen: BankLinesScreenValue): SuggestionsValue =>
  BankLinesScreen.match<SuggestionsValue>(screen, {
    Browse: () => Suggestions.Idle(),
    Review: ({ suggestions }) => suggestions,
  });

const editOn = (lineId: BankLine["id"]): BankLinesMessageValue =>
  Message.StartedEdit({ lineId });

const submitted = (
  screen: BankLinesScreenValue,
  messages: readonly BankLinesMessageValue[]
): BankLinesScreenValue => {
  let current = screen;

  for (const message of messages) {
    current = send(current, message).model;
  }

  return current;
};

it("opening the transactions screen asks for the first page", () => {
  const opened = openBrowse(LineScope.All(), "", loadingBrowse());

  expect(opened.commands).toHaveLength(1);
  expect(opened.commands?.[0]).toMatchObject({
    args: { filter: filterFor(LineScope.All()), generation: 2, search: "" },
    name: "LoadLines",
  });
  expect(
    BankLinesScreen.match(opened.model, {
      Browse: ({ generation, list }) =>
        `${generation}/${LineList.match<string>(list, {
          Failed: () => "failed",
          Loading: () => "loading",
          Ready: () => "ready",
        })}`,
      Review: () => "review",
    })
  ).toBe("2/loading");
});

it("opening the same screen again keeps the loaded lines and asks for nothing", () => {
  const screen = browseOf(demoLines);
  const reopened = openBrowse(LineScope.All(), "", screen);

  expect(reopened.commands).toBeUndefined();
  expect(reopened.model).toStrictEqual(screen);
});

it("a category screen asks for that category's lines", () => {
  const opened = openBrowse(
    LineScope.Category({ categoryId: software }),
    "",
    browseOf(demoLines)
  );

  expect(opened.commands?.[0]).toMatchObject({
    args: {
      filter: {
        category: CategoryFilterSchema.cases.Of.make({ categoryId: software }),
      },
      generation: 2,
    },
    name: "LoadLines",
  });
});

it("the review screen asks for the lines with no category", () => {
  const opened = openReview(browseOf(demoLines));

  expect(opened.commands?.[0]).toMatchObject({
    args: { filter: reviewFilter, generation: 1, search: "" },
    name: "LoadLines",
  });
  expect(BankLinesScreen.guards.Review(opened.model)).toBe(true);
});

it("a stale page answer is dropped and the current one fills the list", () => {
  const screen = browseOf([]);

  const page = {
    lines: [...demoLines],
    next: Option.none(),
    total: demoLines.length,
  };

  expect(
    send(screen, Message.CompletedLoad({ generation: 0, page })).model
  ).toStrictEqual(screen);

  const loaded = send(screen, Message.CompletedLoad({ generation: 1, page }));

  expect(listLinesOf(loaded.model)).toHaveLength(demoLines.length);
});

it("typing in the search box reloads with that term", () => {
  const searched = send(
    browseOf(demoLines),
    Message.TypedSearch({ value: "coffee" })
  );

  expect(searched.commands?.[0]).toMatchObject({
    args: { generation: 2, search: "coffee" },
    name: "LoadLines",
  });
  expect(
    BankLinesScreen.match(searched.model, {
      Browse: ({ search }) => search,
      Review: () => "",
    })
  ).toBe("coffee");
});

it("a failed load says what to fix and can be retried", () => {
  const failed = send(
    browseOf(demoLines),
    Message.FailedLoad({
      generation: 1,
      reason:
        "The bank lines could not be read. Fix: reload the screen and try again.",
    })
  );

  expect(
    BankLinesScreen.match(failed.model, {
      Browse: ({ list }) => LineList.guards.Failed(list),
      Review: () => false,
    })
  ).toBe(true);

  expect(send(failed.model, Message.Retried()).commands?.[0]).toMatchObject({
    args: { generation: 2, search: "" },
    name: "LoadLines",
  });
});

it("an edit opens on the line's own category and note", () => {
  const editing = send(browseOf(demoLines), editOn(coffeeId));

  expect(editOf(editing.model)).toStrictEqual(
    LineEditState.Draft({
      draft: {
        category: coffee.category,
        lineId: coffee.id,
        note: coffee.note,
      },
    })
  );
});

it("saving a category change sends only the category it changed", () => {
  const editing = submitted(browseOf(demoLines), [
    editOn(coffeeId),
    Message.ChoseCategory({ value: software }),
  ]);

  const saving = send(editing, Message.SubmittedEdit());

  expect(saving.commands?.[0]).toMatchObject({
    args: {
      edit: {
        category: CategoryChangeSchema.cases.Assigned.make({
          categoryId: software,
        }),
        lineId: coffee.id,
        note: NoteChangeSchema.cases.Unchanged.make({}),
      },
    },
    name: "SaveLine",
  });
  expect(LineEditState.guards.Saving(editOf(saving.model))).toBe(true);
});

it("clearing a category sends an explicit clear", () => {
  const editing = submitted(browseOf(demoLines), [
    editOn(coffeeId),
    Message.ChoseCategory({ value: "" }),
  ]);

  expect(send(editing, Message.SubmittedEdit()).commands?.[0]).toMatchObject({
    args: {
      edit: {
        category: CategoryChangeSchema.cases.Cleared.make({}),
        lineId: coffee.id,
      },
    },
    name: "SaveLine",
  });
});

it("saving a note change keeps the category unchanged", () => {
  const editing = submitted(browseOf(demoLines), [
    editOn(coffeeId),
    Message.TypedNote({ value: "  Coffee with Example Ltd  " }),
  ]);

  expect(send(editing, Message.SubmittedEdit()).commands?.[0]).toMatchObject({
    args: {
      edit: {
        category: CategoryChangeSchema.cases.Unchanged.make({}),
        lineId: coffee.id,
        note: NoteChangeSchema.cases.Set.make({
          text: "  Coffee with Example Ltd  ",
        }),
      },
    },
    name: "SaveLine",
  });
});

it("a category value the profile does not offer is ignored", () => {
  const editing = submitted(browseOf(demoLines), [
    editOn(coffeeId),
    Message.ChoseCategory({ value: "category-invented" }),
  ]);

  expect(editOf(editing)).toStrictEqual(
    LineEditState.Draft({
      draft: {
        category: coffee.category,
        lineId: coffee.id,
        note: coffee.note,
      },
    })
  );
});

it("saving a line with nothing changed sends nothing", () => {
  const editing = send(browseOf(demoLines), editOn(coffeeId));

  const saving = send(editing.model, Message.SubmittedEdit());

  expect(saving.commands).toBeUndefined();
  expect(editOf(saving.model)).toStrictEqual(LineEditState.Idle());
});

it("a note over the limit is refused by name and keeps the draft", () => {
  const editing = submitted(browseOf(demoLines), [
    editOn(coffeeId),
    Message.TypedNote({ value: "x".repeat(501) }),
  ]);

  const refused = send(editing, Message.SubmittedEdit());

  expect(refused.commands).toBeUndefined();

  const state = editOf(refused.model);

  if (!LineEditState.guards.Failed(state)) {
    throw new Error("A note over the limit must be refused");
  }

  expect(state.reason).toContain("500 characters");
  expect(state.reason).toContain("Fix:");
  expect(Option.isSome(state.draft)).toBe(true);
});

it("a cancelled edit keeps the line as it was", () => {
  const editing = submitted(browseOf(demoLines), [
    editOn(coffeeId),
    Message.ChoseCategory({ value: software }),
  ]);

  const cancelled = send(editing, Message.CancelledEdit());

  expect(editOf(cancelled.model)).toStrictEqual(LineEditState.Idle());
  expect(cancelled.commands).toBeUndefined();
});

it("a saved line shows the line the store returned", () => {
  const saving = send(
    submitted(browseOf(demoLines), [
      editOn(coffeeId),
      Message.ChoseCategory({ value: software }),
    ]),
    Message.SubmittedEdit()
  );

  const saved = send(
    saving.model,
    Message.CompletedEdit({
      line: { ...coffee, category: Option.some(software) },
    })
  );

  const shown = listLinesOf(saved.model).find((line) => line.id === coffee.id);

  expect(Option.getOrNull(shown?.category ?? Option.none())).toBe(software);
  expect(LineEditState.guards.Saved(editOf(saved.model))).toBe(true);
});

it("marking a line reviewed sends one review for that line", () => {
  const marking = send(
    browseOf(demoLines),
    Message.MarkedReviewed({ lineId: coffeeId })
  );

  expect(marking.commands?.[0]).toMatchObject({
    args: { lineId: coffee.id },
    name: "ReviewLine",
  });
  expect(editOf(marking.model)).toStrictEqual(
    LineEditState.Reviewing({ lineId: coffee.id })
  );
});

it("a reviewed line shows the review time the store stamped", () => {
  const marking = send(
    browseOf(demoLines),
    Message.MarkedReviewed({ lineId: coffeeId })
  );

  const reviewed = send(
    marking.model,
    Message.CompletedReview({
      line: {
        ...coffee,
        review: reviewedAt(1_800_000_000_000),
      },
    })
  );

  expect(editOf(reviewed.model)).toStrictEqual(
    LineEditState.Saved({ lineId: coffee.id })
  );
  expect(
    listLinesOf(reviewed.model).find((line) => line.id === coffee.id)?.review
  ).toStrictEqual(reviewedAt(1_800_000_000_000));
});

it("a viewer reads the lines and gets no write command", () => {
  const screen = browseOf(demoLines);

  for (const message of [
    editOn(coffeeId),
    Message.MarkedReviewed({ lineId: coffeeId }),
    Message.SubmittedEdit(),
    Message.RequestedSuggestions(),
    Message.AcceptedSuggestions(),
  ]) {
    const result = send(screen, message, viewer);

    expect(result.commands).toBeUndefined();
    expect(result.model).toStrictEqual(screen);
  }
});

it("asking for suggestions sends the uncategorised lines to the demo sorter", () => {
  const asked = send(reviewOf(), Message.RequestedSuggestions());

  expect(asked.commands?.[0]).toMatchObject({ name: "SuggestCategories" });
  expect(Suggestions.guards.Asking(suggestionsOf(asked.model))).toBe(true);
});

it("a suggestion that arrives while asking is offered with its confidence", () => {
  const asked = send(reviewOf(), Message.RequestedSuggestions()).model;

  const offered = send(
    asked,
    Message.CompletedSuggestions({
      items: [{ categoryId: office, confidence: 0.86, lineId: taxId }],
    })
  );

  const suggestions = suggestionsOf(offered.model);

  expect(Suggestions.guards.Ready(suggestions)).toBe(true);
  expect(
    Suggestions.match(suggestions, {
      Accepted: () => [],
      Accepting: () => [],
      Asking: () => [],
      Failed: () => [],
      Idle: () => [],
      Ready: ({ items }) => items.map((item) => item.categoryId),
    })
  ).toStrictEqual([office]);
});

it("accepting every suggestion sends one edit per suggestion", () => {
  const ready = send(
    send(reviewOf(), Message.RequestedSuggestions()).model,
    Message.CompletedSuggestions({
      items: [
        { categoryId: office, confidence: 0.86, lineId: taxId },
        {
          categoryId: designTools,
          confidence: 0.83,
          lineId: lineIdOf(uncategorisedLines[1] ?? cloudLine),
        },
      ],
    })
  ).model;

  const accepted = send(ready, Message.AcceptedSuggestions());

  expect(accepted.commands?.map((command) => command.name)).toStrictEqual([
    "AcceptSuggestion",
    "AcceptSuggestion",
  ]);
  expect(Suggestions.guards.Accepting(suggestionsOf(accepted.model))).toBe(
    true
  );
});

it("accepting a suggestion drops the line from the review list", () => {
  const suggestions = Suggestions.Accepting({
    accepted: 0,
    items: [{ categoryId: office, confidence: 0.86, lineId: taxId }],
  });

  const accepted = send(
    reviewOf(suggestions),
    Message.CompletedSuggestion({
      line: { ...taxLine, category: Option.some(office) },
    })
  );

  expect(Suggestions.guards.Accepted(suggestionsOf(accepted.model))).toBe(true);
  expect(
    listLinesOf(accepted.model).some((line) => line.id === taxLine.id)
  ).toBe(false);
  expect(listLinesOf(accepted.model)).toHaveLength(
    uncategorisedLines.length - 1
  );
});

it("a refused suggestion names the reason and stops the run", () => {
  const suggestions = Suggestions.Accepting({
    accepted: 0,
    items: [
      { categoryId: office, confidence: 0.86, lineId: taxId },
      {
        categoryId: designTools,
        confidence: 0.83,
        lineId: lineIdOf(uncategorisedLines[1] ?? cloudLine),
      },
    ],
  });

  const refused = send(
    reviewOf(suggestions),
    Message.FailedSuggestion({
      lineId: taxId,
      reason:
        "The line could not be saved. Fix: reload the review screen and try again.",
    })
  );

  const state = suggestionsOf(refused.model);

  if (!Suggestions.guards.Failed(state)) {
    throw new Error("A refused suggestion must show its reason");
  }

  expect(state.reason).toContain("Fix:");
});

it("reviewing a line keeps it in the review list", () => {
  const marking = send(reviewOf(), Message.MarkedReviewed({ lineId: taxId }));

  const reviewed = send(
    marking.model,
    Message.CompletedReview({
      line: { ...taxLine, review: reviewedAt(1_800_000_000_000) },
    })
  );

  expect(
    listLinesOf(reviewed.model).some((line) => line.id === taxLine.id)
  ).toBe(true);
});

it.effect("an edit through the gateway lands in the next listing", () =>
  Effect.gen(function* saveThroughTheGateway() {
    const saved = yield* SaveLine({
      edit: {
        category: CategoryChangeSchema.cases.Assigned.make({
          categoryId: software,
        }),
        lineId: coffee.id,
        note: NoteChangeSchema.cases.Unchanged.make({}),
      },
    }).effect;

    expect(Predicate.isTagged(saved, "CompletedEdit")).toBe(true);

    const listed = yield* LoadLines({
      filter: filterFor(LineScope.All()),
      generation: 1,
      search: "Demo Coffee",
    }).effect;

    if (!Predicate.isTagged(listed, "CompletedLoad")) {
      throw new Error("The listing must answer with a page");
    }

    const found = listed.page.lines.find((line) => line.id === coffee.id);

    expect(Option.getOrNull(found?.category ?? Option.none())).toBe(software);
  }).pipe(Effect.provide(BankLinesGateway.layer))
);

it.effect("a category the profile does not own is refused by name", () =>
  Effect.gen(function* refuseUnknownCategory() {
    const refused = yield* SaveLine({
      edit: {
        category: CategoryChangeSchema.cases.Assigned.make({
          categoryId: inventedCategory,
        }),
        lineId: coffee.id,
        note: NoteChangeSchema.cases.Unchanged.make({}),
      },
    }).effect;

    if (!Predicate.isTagged(refused, "FailedEdit")) {
      throw new Error("An unknown category must be refused");
    }

    expect(refused.reason).toContain("category-missing");
    expect(refused.reason).toContain("Fix:");
  }).pipe(Effect.provide(BankLinesGateway.layer))
);

it.effect("reviewing a line through the gateway stamps a review time", () =>
  Effect.gen(function* reviewThroughTheGateway() {
    const reviewed = yield* ReviewLine({ lineId: coffee.id }).effect;

    if (!Predicate.isTagged(reviewed, "CompletedReview")) {
      throw new Error("The review must answer with the line");
    }

    expect(Predicate.isTagged(reviewed.line.review, "Reviewed")).toBe(true);
  }).pipe(Effect.provide(BankLinesGateway.layer))
);

it("names every category the demo book and the store carry", () => {
  const named = new Set(demoCatalogue.map((choice) => choice.id));

  for (const category of demoCategories) {
    expect(named.has(category.id)).toBe(true);
  }

  for (const line of demoLines) {
    if (Option.isSome(line.category)) {
      expect(named.has(line.category.value)).toBe(true);
    }
  }
});

it("the review filter is uncategorised, any review, this profile", () => {
  expect(reviewFilter.category).toStrictEqual(
    CategoryFilterSchema.cases.Uncategorised.make({})
  );
  expect(reviewFilter.review).toStrictEqual(
    ReviewFilterSchema.cases.Any.make({})
  );
  expect(Option.isNone(reviewFilter.account)).toBe(true);
});
