import { Effect, Layer } from "effect";

export const mutationRecorder = () => {
  const byOperation = {};

  return {
    byOperation,
    count: (operation) => {
      byOperation[operation] = (byOperation[operation] ?? 0) + 1;
    },
    total: () =>
      Object.values(byOperation).reduce((sum, count) => sum + count, 0),
  };
};

export const countingLayer = ({ layer, mutations, recorder, service }) => {
  const make = Effect.gen(function* makeCountingAdapter() {
    const inner = yield* service;
    const wrapped = { ...inner };

    for (const name of mutations) {
      const original = inner[name];

      wrapped[name] = (...arguments_) =>
        Effect.tap(original(...arguments_), () =>
          Effect.sync(() => recorder.count(name))
        );
    }

    return wrapped;
  });

  return Layer.effect(service, make).pipe(Layer.provide(layer));
};
