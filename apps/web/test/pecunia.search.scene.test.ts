import { it } from "@effect/vitest";
import { Option } from "effect";
import * as Scene from "foldkit/scene";
import { fromString } from "foldkit/url";

import { Message } from "../src/client/pecunia/message.js";
import { initialModel } from "../src/client/pecunia/model.js";
import { SearchEverything } from "../src/client/pecunia/search/command.js";
import { Message as SearchMessage } from "../src/client/pecunia/search/message.js";
import { update, view } from "../src/features/pecunia/app.js";
import { demoLines, lineWithMerchant } from "./pecunia-bank-lines-fixture.js";

const url = (path: string) =>
  Option.getOrThrow(fromString(`https://pecunia.test${path}`));

const searchbox = Scene.role("searchbox", { name: "Search everything" });

const openSearch = Scene.Subscription.emit(
  Message.ChangedUrl({ url: url("/app/search") })
);

const coffee = lineWithMerchant("Demo Coffee");

const page = {
  lines: [coffee],
  next: Option.none(),
  total: 1,
};

it("the one box suggests while typing and then shows what it found", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    openSearch,
    Scene.expect(Scene.role("heading", { name: "Search" })).toExist(),
    Scene.Command.expectNone(),
    Scene.type(searchbox, "coffee"),
    Scene.expect(Scene.role("button", { name: "Demo Coffee" })).toExist(),
    Scene.click(Scene.role("button", { name: "Demo Coffee" })),
    Scene.Command.expectExact(SearchEverything({ query: "Demo Coffee" })),
    Scene.Command.resolve(
      SearchEverything,
      SearchMessage.CompletedSearch({ page, query: "Demo Coffee" })
    ),
    Scene.expect(Scene.text("Results for “Demo Coffee”.")).toExist(),
    Scene.expect(Scene.role("heading", { name: "Payments" })).toExist(),
    Scene.expect(Scene.text("Demo Coffee")).toExist(),
    Scene.expect(Scene.text("−€89.00 · Eating out")).toExist()
  );
});

it("a submitted query finds a category and a holding", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    Scene.Subscription.emit(
      Message.ChangedUrl({ url: url("/app/search?q=world") })
    ),
    Scene.Command.expectExact(SearchEverything({ query: "world" })),
    Scene.Command.resolve(
      SearchEverything,
      SearchMessage.CompletedSearch({
        page: { lines: [], next: Option.none(), total: 0 },
        query: "world",
      })
    ),
    Scene.expect(Scene.role("heading", { name: "Holdings" })).toExist(),
    Scene.expect(Scene.role("link", { name: "Demo World ETF" })).toHaveAttr(
      "href",
      "/app/investments"
    ),
    Scene.expect(Scene.text("€7,800,000.00")).toExist()
  );
});

it("the category result links to that category's payments", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    Scene.Subscription.emit(
      Message.ChangedUrl({ url: url("/app/search?q=office") })
    ),
    Scene.Command.resolve(
      SearchEverything,
      SearchMessage.CompletedSearch({
        page: { lines: [], next: Option.none(), total: 0 },
        query: "office",
      })
    ),
    Scene.expect(Scene.role("link", { name: "Office" })).toHaveAttr(
      "href",
      "/app/spending/category/0192f0c1-000d-75e9-8fd7-fd7e43c901ee"
    )
  );
});

it("a query with no match says so", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    Scene.Subscription.emit(
      Message.ChangedUrl({ url: url("/app/search?q=zzz") })
    ),
    Scene.Command.resolve(
      SearchEverything,
      SearchMessage.CompletedSearch({
        page: { lines: [], next: Option.none(), total: 0 },
        query: "zzz",
      })
    ),
    Scene.expect(Scene.text("Nothing matches “zzz”.")).toExist()
  );
});

it("the search screen counts the demo payments it can see", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    Scene.Subscription.emit(
      Message.ChangedUrl({ url: url("/app/search?q=demo") })
    ),
    Scene.Command.resolve(
      SearchEverything,
      SearchMessage.CompletedSearch({
        page: {
          lines: [...demoLines],
          next: Option.none(),
          total: demoLines.length,
        },
        query: "demo",
      })
    ),
    Scene.expect(Scene.role("heading", { name: "Payments" })).toExist()
  );
});
