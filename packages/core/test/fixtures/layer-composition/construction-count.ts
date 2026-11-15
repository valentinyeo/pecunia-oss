import { Context, Layer, Ref } from "effect";

export class ConstructionCount extends Context.Service<
  ConstructionCount,
  Ref.Ref<number>
>()("@pecunia/core/test/ConstructionCount") {
  static readonly layer = Layer.effect(this, Ref.make(0));
}
