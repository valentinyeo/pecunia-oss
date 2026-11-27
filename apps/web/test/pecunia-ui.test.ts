import { Router } from "@effect/ui";
import { HtmlServer } from "@effect/ui/html";
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing";
import { Locator, TestHost } from "@effect/ui/testing";
import { describe, expect, it } from "@effect/vitest";
import { pecuniaRpcWebHandler } from "@pecunia/api/rpc-handler";
import { eventFlags, Flags } from "@pecunia/core/flags";
import { openDemoSqliteLayer } from "@pecunia/database/node-sqlite";
import { DateOnlySchema } from "@pecunia/reporting";
import { Effect, Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";

import { PecuniaApi } from "../src/client/pecunia-ui/api.js";
import { pecuniaQueryLayer } from "../src/client/pecunia-ui/queries.js";
import { PecuniaRoute } from "../src/client/pecunia-ui/route.js";
import { PecuniaApp } from "../src/features/pecunia-ui/app.js";

const acquireLivePecuniaLayer = (initialUrl: string) =>
  Effect.gen(function* buildLiveLayer() {
    const today = yield* Schema.decodeEffect(DateOnlySchema)("2025-12-15");

    const rpcServer = yield* Effect.acquireRelease(
      Effect.sync(() =>
        pecuniaRpcWebHandler(
          openDemoSqliteLayer(),
          Flags.defaults(eventFlags),
          {
            today,
          }
        )
      ),
      (handle) => Effect.promise(() => handle.dispose())
    );

    const fetchLayer = Layer.succeed(FetchHttpClient.Fetch, (input, init) =>
      rpcServer.handler(new Request(input, init))
    );

    const apiLayer = PecuniaApi.layerForUrl("http://pecunia-ui.test/rpc").pipe(
      Layer.provide(fetchLayer)
    );

    return Layer.mergeAll(
      Router.memory({ routes: PecuniaRoute, url: initialUrl }),
      pecuniaQueryLayer.pipe(Layer.provide(apiLayer))
    );
  });

const waitForIdle = (pending: () => readonly unknown[]) =>
  Effect.gen(function* drainPendingRpc() {
    for (let attempt = 0; attempt < 25 && pending().length > 0; attempt += 1) {
      yield* TestHost.settle;
    }
  });

describe("@effect/ui PecuniaApp wired to live RPC and migrated D1 SQLite", () => {
  it.effect(
    "server-renders Dashboard with exact D1 sums (posted spend €3,289.55, tax owed €3,125.00) and daily SVG chart",
    () =>
      Effect.gen(function* testSsrDashboard() {
        const layer = yield* acquireLivePecuniaLayer("/app");

        const rendered = yield* HtmlServer.renderToHtml(
          PecuniaApp,
          Router.props(PecuniaRoute),
          { budget: "2 seconds" }
        ).pipe(Effect.provide(layer));

        expect(rendered.html).toContain("Dashboard");
        expect(rendered.html).toContain("Example Ltd");
        expect(rendered.html).toContain("€3,289.55");
        expect(rendered.html).toContain("€4,835.00");
        expect(rendered.html).toContain("€3,125.00");
        expect(rendered.html).toContain("<svg");
      })
  );

  it.effect(
    "renders Spending split, drills down into Software payments, and marks a payment reviewed in D1",
    () =>
      Effect.gen(function* testSpendingPlay() {
        const layer = yield* acquireLivePecuniaLayer("/app/spending");

        yield* Effect.gen(function* driveSpending() {
          const play = yield* HtmlPlay.make(
            PecuniaApp,
            Router.props(PecuniaRoute)
          );

          yield* waitForIdle(() => play.root.pending());
          yield* play.expect(Locator.text("€3,289.55")).toExist();
          yield* play
            .expect(Locator.text("Personal vs business split"))
            .toExist();

          yield* play.click(HtmlLocator.role("button", { name: "Software" }));
          yield* waitForIdle(() => play.root.pending());
          yield* play.expect(Locator.text("Software payments")).toExist();
          yield* play.expect(Locator.text("Demo Cloud Hosting")).toExist();

          yield* play.click(HtmlLocator.role("button", { name: "Confirm" }));
          yield* waitForIdle(() => play.root.pending());
          yield* play
            .expect(HtmlLocator.role("status"))
            .toHaveText("Payment marked reviewed and saved to D1.");
        }).pipe(Effect.provide(Layer.mergeAll(layer, TestHost.layer())));
      })
  );

  it.effect(
    "renders Income by client separately from refunds and renders Monthly statement",
    () =>
      Effect.gen(function* testIncomeAndMonthsSsr() {
        const incomeLayer = yield* acquireLivePecuniaLayer("/app/income");

        const incomeRendered = yield* HtmlServer.renderToHtml(
          PecuniaApp,
          Router.props(PecuniaRoute),
          { budget: "2 seconds" }
        ).pipe(Effect.provide(incomeLayer));

        expect(incomeRendered.html).toContain("Client income");
        expect(incomeRendered.html).toContain("€4,800.00");
        expect(incomeRendered.html).toContain("€35.00");

        const monthsLayer = yield* acquireLivePecuniaLayer("/app/months");

        yield* Effect.gen(function* driveMonths() {
          const play = yield* HtmlPlay.make(
            PecuniaApp,
            Router.props(PecuniaRoute)
          );

          yield* waitForIdle(() => play.root.pending());
          yield* play.expect(Locator.text("Top merchants")).toExist();
          yield* play.expect(Locator.text("Daily spend in")).toExist();
        }).pipe(Effect.provide(Layer.mergeAll(monthsLayer, TestHost.layer())));
      })
  );

  it.effect(
    "displays Investments portfolio from D1, adds a manual holding, and deletes it",
    () =>
      Effect.gen(function* testInvestmentsPlay() {
        const layer = yield* acquireLivePecuniaLayer("/app/investments");

        yield* Effect.gen(function* driveInvestments() {
          const play = yield* HtmlPlay.make(
            PecuniaApp,
            Router.props(PecuniaRoute)
          );

          yield* waitForIdle(() => play.root.pending());
          yield* play.expect(Locator.text("DEMO-WORLD")).toExist();
          yield* play.expect(Locator.text("DEMO-TECH")).toExist();
          yield* play.expect(Locator.text("Unknown (no price)")).toExist();

          yield* play.type(HtmlLocator.label("Symbol"), "DEMO-BOND");
          yield* play.type(HtmlLocator.label("Name"), "Demo Bond ETF");
          yield* play.type(
            HtmlLocator.label("Unit price (optional)"),
            "100.00"
          );
          yield* play.click(
            HtmlLocator.role("button", { name: "Add holding" })
          );
          yield* waitForIdle(() => play.root.pending());
          yield* play
            .expect(HtmlLocator.role("status"))
            .toHaveText("Added DEMO-BOND to D1.");
          yield* play.expect(Locator.text("DEMO-BOND")).toExist();

          yield* play.click(
            Locator.inside(
              HtmlLocator.role("row", { name: /DEMO-BOND/u }),
              HtmlLocator.role("button", { name: "Delete" })
            )
          );
          yield* waitForIdle(() => play.root.pending());
          yield* play
            .expect(HtmlLocator.role("status"))
            .toHaveText("Deleted DEMO-BOND from D1.");
        }).pipe(Effect.provide(Layer.mergeAll(layer, TestHost.layer())));
      })
  );

  it.effect(
    "cancels a repeat payment on /app/subscriptions and persists active yearly total €0.00 in D1",
    () =>
      Effect.gen(function* testSubscriptionsPlay() {
        const layer = yield* acquireLivePecuniaLayer("/app/subscriptions");

        yield* Effect.gen(function* driveSubscriptions() {
          const play = yield* HtmlPlay.make(
            PecuniaApp,
            Router.props(PecuniaRoute)
          );

          yield* waitForIdle(() => play.root.pending());
          yield* play.expect(Locator.text("Demo Cloud Hosting")).toExist();
          yield* play.expect(Locator.text("€3,588.00")).toExist();

          yield* play.click(HtmlLocator.role("button", { name: "Cancel" }));
          yield* waitForIdle(() => play.root.pending());
          yield* play
            .expect(HtmlLocator.role("status"))
            .toHaveText(
              "Demo Cloud Hosting updated to Cancelled and saved to D1."
            );
          yield* play.expect(Locator.text("€0.00")).toExist();
        }).pipe(Effect.provide(Layer.mergeAll(layer, TestHost.layer())));
      })
  );

  it.effect(
    "edits a bank line note on /app/transactions and persists it in D1",
    () =>
      Effect.gen(function* testTransactionsPlay() {
        const layer = yield* acquireLivePecuniaLayer("/app/transactions");

        yield* Effect.gen(function* driveTransactions() {
          const play = yield* HtmlPlay.make(
            PecuniaApp,
            Router.props(PecuniaRoute)
          );

          yield* waitForIdle(() => play.root.pending());
          yield* play.expect(Locator.text("Demo Rail")).toExist();

          yield* play.click(
            Locator.inside(
              HtmlLocator.role("row", { name: /Demo Rail/u }),
              HtmlLocator.role("button", { name: "Edit note" })
            )
          );
          yield* play.type(
            HtmlLocator.role("textbox", { name: "Edit note" }),
            "Persisted from Effect UI"
          );
          yield* play.click(HtmlLocator.role("button", { name: "Save note" }));
          yield* waitForIdle(() => play.root.pending());
          yield* play
            .expect(HtmlLocator.role("status"))
            .toHaveText("Note saved to D1.");
          yield* play
            .expect(Locator.text("Note: Persisted from Effect UI"))
            .toExist();
        }).pipe(Effect.provide(Layer.mergeAll(layer, TestHost.layer())));
      })
  );

  it.effect(
    "creates a new profile and imports CSV bank lines idempotently on /app/settings",
    () =>
      Effect.gen(function* testSettingsPlay() {
        const layer = yield* acquireLivePecuniaLayer("/app/settings");

        yield* Effect.gen(function* driveSettings() {
          const play = yield* HtmlPlay.make(
            PecuniaApp,
            Router.props(PecuniaRoute)
          );

          yield* waitForIdle(() => play.root.pending());
          yield* play.expect(Locator.text("Example Ltd")).toExist();

          yield* play.click(HtmlLocator.role("button", { name: "Import CSV" }));
          yield* waitForIdle(() => play.root.pending());
          yield* play
            .expect(HtmlLocator.role("status"))
            .toHaveText(
              "CSV import finished: 1 imported, 0 already in D1, 0 rejected."
            );

          yield* play.click(HtmlLocator.role("button", { name: "Import CSV" }));
          yield* waitForIdle(() => play.root.pending());
          yield* play
            .expect(HtmlLocator.role("status"))
            .toHaveText(
              "CSV import finished: 0 imported, 1 already in D1, 0 rejected."
            );

          yield* play.type(
            HtmlLocator.label("New profile name"),
            "Demo Studio"
          );
          yield* play.click(
            HtmlLocator.role("button", { name: "Create profile" })
          );
          yield* waitForIdle(() => play.root.pending());
          yield* play
            .expect(HtmlLocator.role("status"))
            .toHaveText("Created profile Demo Studio in D1.");
          yield* play.expect(Locator.text("Demo Studio")).toExist();
        }).pipe(Effect.provide(Layer.mergeAll(layer, TestHost.layer())));
      })
  );
});
