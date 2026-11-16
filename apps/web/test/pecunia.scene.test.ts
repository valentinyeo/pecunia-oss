import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";
import { UrlRequest } from "foldkit/navigation";
import * as Scene from "foldkit/scene";
import type { SceneStep } from "foldkit/scene";
import { fromString } from "foldkit/url";

import { Navigate, ReadLocation } from "../src/client/pecunia/command.js";
import { Message } from "../src/client/pecunia/message.js";
import type { PecuniaMessage } from "../src/client/pecunia/message.js";
import { initialModel } from "../src/client/pecunia/model.js";
import type { PecuniaModel } from "../src/client/pecunia/model.js";
import { AppRoute, parseRoute } from "../src/client/pecunia/route.js";
import { boot, init, update, view } from "../src/features/pecunia/app.js";
import { menuSections } from "../src/features/pecunia/navigation.js";

const url = (path: string) =>
  Option.getOrThrow(fromString(`https://pecunia.test${path}`));

const scene = (
  ...steps: readonly SceneStep<PecuniaModel, PecuniaMessage, never>[]
) => {
  Scene.scene({ update, view }, Scene.given(initialModel), ...steps);
};

const menuLinks = menuSections.flatMap((section) => section.items);

const expectPressed = (name: string, value: string) =>
  Scene.expect(Scene.role("button", { name })).toHaveAttr(
    "aria-pressed",
    value
  );

describe("pecunia shell", () => {
  it("the side menu links every screen to its own address", () => {
    scene(
      ...menuLinks.map((item) =>
        Scene.expect(Scene.role("link", { name: item.label })).toHaveAttr(
          "href",
          item.path
        )
      )
    );
  });

  it("the side menu marks the screen the app is on", () => {
    scene(
      Scene.expect(Scene.role("link", { name: "Dashboard" })).toHaveAttr(
        "aria-current",
        "page"
      ),
      Scene.expect(Scene.role("link", { name: "Budgets" })).toHaveAttr(
        "aria-current",
        "false"
      ),
      Scene.Subscription.emit(Message.ChangedUrl({ url: url("/app/budgets") })),
      Scene.expect(Scene.role("heading", { name: "Budgets" })).toExist(),
      Scene.expect(Scene.role("link", { name: "Budgets" })).toHaveAttr(
        "aria-current",
        "page"
      ),
      Scene.expect(Scene.role("link", { name: "Dashboard" })).toHaveAttr(
        "aria-current",
        "false"
      )
    );
  });

  it("every menu address opens the screen the menu names", () => {
    for (const item of menuLinks) {
      expect(parseRoute(url(item.path))).toStrictEqual(item.screen);
    }
  });

  it("opens the screen a menu address names whatever follows the path", () => {
    for (const item of menuLinks) {
      for (const suffix of ["", "/", "?from=mail", "#top"]) {
        expect(parseRoute(url(`${item.path}${suffix}`))).toStrictEqual(
          item.screen
        );
      }
    }
  });

  it("a click on a menu link routes to that address", () => {
    const routed = update(
      initialModel,
      Message.ClickedLink({
        request: UrlRequest.Internal({ url: url("/app/budgets") }),
      })
    );

    expect(routed.commands).toHaveLength(1);
    expect(routed.commands?.[0]).toMatchObject({
      args: { url: "https://pecunia.test/app/budgets" },
      name: "Navigate",
    });
    expect(routed.model.route).toStrictEqual(AppRoute.Dashboard());

    scene(
      Scene.Subscription.emit(
        Message.ClickedLink({
          request: UrlRequest.Internal({ url: url("/app/budgets") }),
        })
      ),
      Scene.Command.expectExact(
        Navigate({ url: "https://pecunia.test/app/budgets" })
      ),
      Scene.Command.resolve(Navigate, Message.CompletedNavigate())
    );
  });

  it("the theme switch turns the shell dark and back to light", () => {
    scene(
      Scene.expect(Scene.selector('[data-theme="light"]')).toExist(),
      expectPressed("Light", "true"),
      expectPressed("Dark", "false"),
      Scene.click(Scene.role("button", { name: "Dark" })),
      Scene.expect(Scene.selector('[data-theme="dark"]')).toExist(),
      Scene.expect(Scene.selector('[data-theme="light"]')).toBeAbsent(),
      expectPressed("Dark", "true"),
      expectPressed("Light", "false"),
      Scene.click(Scene.role("button", { name: "Light" })),
      Scene.expect(Scene.selector('[data-theme="light"]')).toExist(),
      expectPressed("Light", "true")
    );
  });

  it("the dashboard draws its charts and figures from the demo data", () => {
    scene(
      Scene.expect(
        Scene.role("img", {
          name: "Balance over the last twelve months, £35,120.00 in Jan and £48,250.00 in Dec",
        })
      ).toExist(),
      Scene.expect(Scene.text("Spend by category")).toExist(),
      Scene.expect(Scene.text("£1,450.00")).toExist(),
      Scene.expect(Scene.text("£2,318.47")).toExist(),
      Scene.expect(Scene.text("£28,540.50")).toExist(),
      Scene.expect(
        Scene.text(
          "Demo data. Every figure on this page is made up for the preview."
        )
      ).toExist()
    );
  });

  it("the dashboard draws the same charts in the dark theme", () => {
    Scene.scene(
      { update, view },
      Scene.given({ ...initialModel, theme: "dark" }),
      Scene.expect(Scene.selector('[data-theme="dark"]')).toExist(),
      Scene.expect(
        Scene.role("img", {
          name: "Balance over the last twelve months, £35,120.00 in Jan and £48,250.00 in Dec",
        })
      ).toExist(),
      Scene.expect(Scene.text("Spend by category")).toExist(),
      Scene.expect(Scene.text("£2,318.47")).toExist(),
      expectPressed("Dark", "true")
    );
  });

  it("the boot reads the address bar", () => {
    expect(boot.commands).toStrictEqual([ReadLocation()]);
    expect(boot.model.theme).toBe("light");
  });

  it("an unknown route explains itself and offers the dashboard", () => {
    scene(
      Scene.Subscription.emit(
        Message.ChangedUrl({ url: url("/app/nowhere-at-all") })
      ),
      Scene.expect(Scene.role("heading", { name: "Page not found" })).toExist(),
      Scene.expect(
        Scene.role("link", { name: "Back to the dashboard" })
      ).toHaveAttr("href", "/app")
    );
  });

  it("opening an address shows the screen that address names", () => {
    expect(init(url("/app/transactions")).model.route).toStrictEqual(
      AppRoute.Transactions()
    );
    expect(init(url("/app")).model.route).toStrictEqual(AppRoute.Dashboard());
    expect(init(url("/elsewhere")).model.route._tag).toBe("NotFound");
  });
});
