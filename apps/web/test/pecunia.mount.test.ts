import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";
import * as Scene from "foldkit/scene";
import type { SceneStep } from "foldkit/scene";
import { fromString } from "foldkit/url";

import { isAppPath } from "../src/client/mount.js";
import type { PecuniaMessage } from "../src/client/pecunia/message.js";
import type { PecuniaModel } from "../src/client/pecunia/model.js";
import { pecuniaProgram } from "../src/client/pecunia/program.js";

const url = (path: string) =>
  Option.getOrThrow(fromString(`https://pecunia.test${path}`));

const mounted = (
  path: string,
  ...steps: readonly SceneStep<PecuniaModel, PecuniaMessage, never>[]
) => {
  Scene.scene(
    { update: pecuniaProgram.update, view: pecuniaProgram.view },
    Scene.given(pecuniaProgram.init(url(path)).model),
    ...steps
  );
};

describe("mounted app", () => {
  it("mounts on /app and leaves the reader routes alone", () => {
    expect(isAppPath("/app")).toBe(true);
    expect(isAppPath("/app/categories")).toBe(true);
    expect(isAppPath("/")).toBe(false);
    expect(isAppPath("/search")).toBe(false);
    expect(isAppPath("/appetite")).toBe(false);
  });

  it("opens /app on the dashboard with the demo net worth", () => {
    mounted(
      "/app",
      Scene.expect(Scene.role("heading", { name: "Dashboard" })).toExist(),
      Scene.expect(Scene.text("£48,250.00")).toExist(),
      Scene.expect(Scene.role("link", { name: "Transactions" })).toHaveAttr(
        "href",
        "/app/transactions"
      ),
      Scene.expect(Scene.role("link", { name: "Categories" })).toHaveAttr(
        "href",
        "/app/categories"
      ),
      Scene.expect(Scene.role("link", { name: "Search" })).toHaveAttr(
        "href",
        "/app/search"
      ),
      Scene.expect(Scene.text("Demo profile")).toExist()
    );
  });

  it("an unknown /app path says what failed and what to do", () => {
    mounted(
      "/app/nowhere-at-all",
      Scene.expect(Scene.role("heading", { name: "Page not found" })).toExist(),
      Scene.expect(
        Scene.text(/No screen lives at \/app\/nowhere-at-all/u)
      ).toExist(),
      Scene.expect(
        Scene.text(/Fix: open the dashboard and choose a screen/u)
      ).toExist(),
      Scene.expect(
        Scene.role("link", { name: "Back to the dashboard" })
      ).toHaveAttr("href", "/app")
    );
  });
});
