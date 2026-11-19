import { Option } from "effect";
import * as Scene from "foldkit/scene";
import type { SceneStep } from "foldkit/scene";
import { fromString } from "foldkit/url";
import { describe, it } from "vitest";

import { Message } from "../src/client/pecunia/message.js";
import type { PecuniaMessage } from "../src/client/pecunia/message.js";
import { initialModel } from "../src/client/pecunia/model.js";
import type { PecuniaModel } from "../src/client/pecunia/model.js";
import { update, view } from "../src/features/pecunia/app.js";

const url = (path: string) =>
  Option.getOrThrow(fromString(`https://pecunia.test${path}`));

const scene = (
  ...steps: readonly SceneStep<PecuniaModel, PecuniaMessage, never>[]
) => {
  Scene.scene({ update, view }, Scene.given(initialModel), ...steps);
};

describe("investments screen", () => {
  it("shows the demo holdings grouped by platform with their values", () => {
    scene(
      Scene.Subscription.emit(
        Message.ChangedUrl({ url: url("/app/investments") })
      ),
      Scene.expect(Scene.role("heading", { name: "Investments" })).toExist(),
      Scene.expect(Scene.role("heading", { name: "Generic Broker" })).toExist(),
      Scene.expect(
        Scene.role("heading", { name: "Generic Crypto Exchange" })
      ).toExist(),
      Scene.expect(Scene.text("Demo World ETF")).toExist(),
      Scene.expect(Scene.text("Demo Bitcoin")).toExist(),
      Scene.expect(Scene.text("1,500")).toExist(),
      Scene.expect(Scene.text("€5,200.00")).toExist(),
      Scene.expect(Scene.text("Gain €7,795,500.00")).toExist(),
      Scene.expect(Scene.text("Gain €80,400.00")).toExist(),
      Scene.expect(Scene.text("2 valued, 1 unknown, in EUR")).toExist(),
      Scene.expect(Scene.text("Total €7,886,400.00")).toExist()
    );
  });

  it("shows a holding with no price as unknown rather than zero", () => {
    scene(
      Scene.Subscription.emit(
        Message.ChangedUrl({ url: url("/app/investments") })
      ),
      Scene.expect(Scene.text("Demo Tech Stock")).toExist(),
      Scene.expect(Scene.text("No price yet")).toExist(),
      Scene.expect(Scene.text("€0.00")).toBeAbsent()
    );
  });
});
