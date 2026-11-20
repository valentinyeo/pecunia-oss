import { expect, it } from "@effect/vitest";
import type { BankLine } from "@pecunia/bank-lines/model";
import { Option, Schema } from "effect";

import { HoldingIdSchema } from "../src/client/pecunia/search/demo.js";
import { Message } from "../src/client/pecunia/search/message.js";
import {
  Findings,
  findingsOf,
  initialSearch,
  SUGGESTION_LIMIT,
  Suggestion,
  suggestionsFor,
} from "../src/client/pecunia/search/model.js";
import type { SearchWorld } from "../src/client/pecunia/search/model.js";
import { openSearch, update } from "../src/client/pecunia/search/update.js";
import { demoWorld } from "../src/client/pecunia/search/world.js";
import { demoLines, lineWithMerchant } from "./pecunia-bank-lines-fixture.js";

const coffee = lineWithMerchant("Demo Coffee");

const page = (lines: readonly BankLine[]) => ({
  lines: [...lines],
  next: Option.none(),
  total: lines.length,
});

const suggestionLabels = (query: string, world: SearchWorld = demoWorld) =>
  suggestionsFor(query, world).map((suggestion) => suggestion.label);

it("suggestions appear while typing in the one box", () => {
  expect(suggestionLabels("")).toStrictEqual([]);
  expect(suggestionLabels("demo cof")).toStrictEqual(["Demo Coffee"]);
  expect(suggestionLabels("coffee")).toStrictEqual(["Demo Coffee"]);
});

it("suggestions cover categories, holdings and merchants", () => {
  expect(suggestionLabels("software")).toStrictEqual(["Software"]);
  expect(suggestionLabels("isa")).toStrictEqual(["Demo Shares ISA"]);
  expect(suggestionLabels("demo tax")).toStrictEqual(["Demo Tax Office"]);
});

it("a prefix match is offered before a match in the middle of a word", () => {
  const world: SearchWorld = {
    catalogue: [],
    holdings: [],
    merchants: ["Example Cafe", "Cafe Demo"],
  };

  expect(suggestionLabels("cafe", world)).toStrictEqual([
    "Cafe Demo",
    "Example Cafe",
  ]);
});

it("suggestions stop at the limit", () => {
  const world: SearchWorld = {
    catalogue: [],
    holdings: [],
    merchants: Array.from({ length: 12 }, (_, index) => `Demo Shop ${index}`),
  };

  expect(suggestionLabels("demo", world)).toHaveLength(SUGGESTION_LIMIT);
});

it("the results cover payments, categories and holdings", () => {
  const coffeeResults = findingsOf("coffee", page([coffee]), demoWorld);

  expect(Findings.guards.Ready(coffeeResults)).toBe(true);

  if (Findings.guards.Ready(coffeeResults)) {
    expect(coffeeResults.payments.map((line) => line.id)).toStrictEqual([
      coffee.id,
    ]);
    expect(coffeeResults.categories).toStrictEqual([]);
    expect(coffeeResults.holdings).toStrictEqual([]);
  }

  const officeResults = findingsOf("office", page([]), demoWorld);

  if (!Findings.guards.Ready(officeResults)) {
    throw new Error("The office category must be found");
  }

  expect(officeResults.categories.map((choice) => choice.name)).toStrictEqual([
    "Office",
  ]);

  const isaResults = findingsOf("isa", page([]), demoWorld);

  if (!Findings.guards.Ready(isaResults)) {
    throw new Error("The demo ISA holding must be found");
  }

  expect(isaResults.holdings.map((holding) => holding.name)).toStrictEqual([
    "Demo Shares ISA",
  ]);
});

it("a search with no match says so by naming the query", () => {
  expect(findingsOf("nothing at all", page([]), demoWorld)).toStrictEqual(
    Findings.Empty({ query: "nothing at all" })
  );
});

it("typing changes the query and the suggestions, not the results", () => {
  const typed = update(initialSearch, Message.TypedQuery({ value: "coffee" }));

  expect(typed.model.query).toBe("coffee");
  expect(
    typed.model.suggestions.map((suggestion) => suggestion.label)
  ).toStrictEqual(["Demo Coffee"]);
  expect(typed.commands).toBeUndefined();
  expect(Findings.guards.Idle(typed.model.findings)).toBe(true);
});

it("submitting the box searches every surface", () => {
  const typed = update(initialSearch, Message.TypedQuery({ value: "coffee" }));

  const submitted = update(typed.model, Message.SubmittedSearch());

  expect(submitted.commands?.[0]).toMatchObject({
    args: { query: "coffee" },
    name: "SearchEverything",
  });
  expect(Findings.guards.Searching(submitted.model.findings)).toBe(true);
});

it("an empty box searches nothing", () => {
  const submitted = update(initialSearch, Message.SubmittedSearch());

  expect(submitted.commands).toBeUndefined();
  expect(findingsOf("", page([]), demoWorld)).toStrictEqual(
    Findings.Empty({ query: "" })
  );
});

it("picking a suggestion searches for what it names", () => {
  const typed = update(initialSearch, Message.TypedQuery({ value: "demo" }));

  const picked = update(
    typed.model,
    Message.PickedSuggestion({
      suggestion: Suggestion.Holding({
        holdingId: Schema.decodeSync(HoldingIdSchema)("demo-holding-isa"),
        label: "Demo Shares ISA",
      }),
    })
  );

  expect(picked.model.query).toBe("Demo Shares ISA");
  expect(picked.commands?.[0]).toMatchObject({
    args: { query: "Demo Shares ISA" },
    name: "SearchEverything",
  });
});

it("a result for an older query is dropped", () => {
  const typed = update(initialSearch, Message.TypedQuery({ value: "coffee" }));

  const searched = update(typed.model, Message.SubmittedSearch());

  const stale = update(
    searched.model,
    Message.CompletedSearch({ page: page([coffee]), query: "earlier" })
  );

  expect(stale.model).toStrictEqual(searched.model);

  const current = update(
    searched.model,
    Message.CompletedSearch({ page: page([coffee]), query: "coffee" })
  );

  expect(current.model.findings).toStrictEqual(
    findingsOf("coffee", page([coffee]), demoWorld)
  );
});

it("a failed search says what to fix and can be retried", () => {
  const typed = update(initialSearch, Message.TypedQuery({ value: "coffee" }));

  const failed = update(
    typed.model,
    Message.FailedSearch({
      query: "coffee",
      reason:
        "The bank lines could not be read. Fix: reload the screen and try again.",
    })
  );

  expect(Findings.guards.Failed(failed.model.findings)).toBe(true);

  const retried = update(failed.model, Message.Retried());

  expect(retried.commands?.[0]).toMatchObject({
    args: { query: "coffee" },
    name: "SearchEverything",
  });
});

it("opening the search address with a query searches it at once", () => {
  const opened = openSearch("coffee", initialSearch);

  expect(opened.commands?.[0]).toMatchObject({
    args: { query: "coffee" },
    name: "SearchEverything",
  });
  expect(opened.model.query).toBe("coffee");
});

it("opening the search address with no query asks for nothing", () => {
  const opened = openSearch("", initialSearch);

  expect(opened.commands).toBeUndefined();
  expect(Findings.guards.Idle(opened.model.findings)).toBe(true);
});

it("the demo world offers every surface the one box searches", () => {
  expect(demoWorld.merchants.length).toBeGreaterThan(0);
  expect(demoWorld.holdings.length).toBeGreaterThan(0);
  expect(demoWorld.catalogue.length).toBeGreaterThan(0);
  expect(demoLines.length).toBeGreaterThan(demoWorld.merchants.length);
});
