// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type, anti-slop/no-runtime-typeof, anti-slop/no-reflect-get, anti-slop/no-object-parameters, anti-slop/no-known-value-widening -- the table test walks untrusted values and invokes every operation positionally
// oxlint-disable anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion, effect-tests/no-manual-effect-runtime-in-tests -- the table marks each entry's channel, and one loop must settle Effect, Result and throwing operations the same way

import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Predicate, Result, Schema } from "effect";

import { isModelCodec } from "../../src/model/codec.js";
import * as model from "../../src/model/index.js";
import type { OperationEntry } from "../../src/model/operation.js";
import {
  exemptOperations,
  operationEntries,
  operations,
} from "../../src/model/operations.js";
import { MoneySchema } from "../../src/model/primitives.js";

const SEED = 0x2b_9e_14_d3;

const moneyOf = (currency: string, minor: number) =>
  Result.getOrThrow(model.codecs.money.decode({ currency, minor }));

const rateOf = (text: string) =>
  Result.getOrThrow(model.codecs.rate.decode(text));

const rngOf = (seed: number) => {
  let state = seed;

  return (): number => {
    state = (state * 16_807) % 2_147_483_647;

    return state / 2_147_483_647;
  };
};

const unit = rngOf(SEED);

const rotation = (): number => Math.floor(unit() * foreignKeys.length);

const rotated = (
  keys: readonly (string | symbol)[]
): readonly (string | symbol)[] => {
  const start = rotation();

  return [...keys.slice(start), ...keys.slice(0, start)];
};

const symbols = [Symbol("rate"), Symbol("amount"), Symbol("source")];

const foreignKeys: readonly (string | symbol)[] = [
  "rate",
  "amount",
  "source",
  "base",
  "asOf",
  ...symbols,
];

const siblingKeys = ["source", "base", "asOf"] as const;

const foreignValues = (): readonly unknown[] => [
  "stranger",
  moneyOf("USD", 500),
];

const attachMethods = [
  "spread",
  "assign",
  "define",
  "define-hidden",
  "symbol-assign",
  "symbol-hidden",
] as const;

type AttachMethod = (typeof attachMethods)[number];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  Object.getPrototypeOf(value) === Object.prototype;

interface NodeRef {
  readonly node: object;
  readonly parent: object | undefined;
  readonly key: string | number | symbol | undefined;
}

const nodeRefs = (
  value: unknown,
  parent?: object,
  key?: string | number | symbol
): readonly NodeRef[] => {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  const refs: NodeRef[] = [{ key, node: value, parent }];

  if (Array.isArray(value) || Option.isOption(value)) {
    return refs;
  }

  for (const childKey of Reflect.ownKeys(value)) {
    const child: unknown = Reflect.get(value, childKey);

    refs.push(...nodeRefs(child, value, childKey));
  }

  return refs;
};

const attach = (
  ref: NodeRef,
  holder: { current: unknown },
  method: AttachMethod,
  key: string | symbol,
  value: unknown
): (() => void) | undefined => {
  switch (method) {
    case "assign":
    case "symbol-assign": {
      try {
        Object.assign(ref.node, { [key]: value });
      } catch {
        return undefined;
      }

      return () => {
        Reflect.deleteProperty(ref.node, key);
      };
    }

    case "define":
    case "define-hidden":
    case "symbol-hidden": {
      try {
        Object.defineProperty(ref.node, key, {
          configurable: true,
          enumerable: method === "define",
          value,
          writable: true,
        });
      } catch {
        return undefined;
      }

      return () => {
        Reflect.deleteProperty(ref.node, key);
      };
    }

    case "spread": {
      if (!isPlainObject(ref.node)) {
        return undefined;
      }

      const copy = { ...ref.node, [key]: value };

      if (ref.parent === undefined || ref.key === undefined) {
        holder.current = copy;

        return () => {
          holder.current = ref.node;
        };
      }

      Reflect.set(ref.parent, ref.key, copy);

      if (Reflect.get(ref.parent, ref.key) !== copy) {
        return undefined;
      }

      return () => {
        Reflect.set(ref.parent as never, ref.key as never, ref.node);
      };
    }

    default: {
      return undefined;
    }
  }
};

const attemptCall = (run: () => unknown): unknown => {
  try {
    return run();
  } catch (error) {
    return error;
  }
};

const asEffect = (outcome: unknown): Effect.Effect<unknown, Error> =>
  outcome as Effect.Effect<unknown, Error>;

const asResult = (outcome: unknown): Result.Result<unknown, Error> =>
  outcome as Result.Result<unknown, Error>;

const rejectionOf = (
  entry: OperationEntry,
  args: readonly unknown[]
): string | undefined => {
  switch (entry.channel) {
    case "effect": {
      const settled = Effect.runSync(
        Effect.result(asEffect(entry.invoke(args)))
      );

      return Result.isFailure(settled) ? settled.failure.message : undefined;
    }

    case "result": {
      const settled = asResult(entry.invoke(args));

      return Result.isFailure(settled) ? settled.failure.message : undefined;
    }

    case "throwing": {
      const thrown = attemptCall(() => entry.invoke(args));

      return Predicate.isError(thrown) ? thrown.message : undefined;
    }

    default: {
      return undefined;
    }
  }
};

const messageNames = (message: string, key: string | symbol): boolean =>
  message.includes(`"${String(key)}"`);

const samplesOf = (entry: OperationEntry): readonly unknown[] =>
  entry.samples();

const labelOf = (entry: OperationEntry, turn: number): string =>
  `${entry.name} seed ${String(SEED)} turn ${String(turn)}`;

describe("one table classifies every operation the model exports", () => {
  it("fails by name for an export the table does not classify", () => {
    const classified = new Set<string>([
      ...Object.keys(operations),
      ...Object.keys(exemptOperations),
    ]);

    const exported = Object.entries(model).flatMap(([name, value]) => {
      if (typeof value !== "function") {
        return [];
      }

      const statics = Object.getOwnPropertyNames(value).filter((member) => {
        const memberValue: unknown = Reflect.get(value, member);

        return typeof memberValue === "function";
      });

      return [name, ...statics.map((member) => `${name}.${member}`)];
    });

    const unclassified = exported
      .filter((name) => !classified.has(name))
      .toSorted();

    expect(unclassified).toStrictEqual([]);
  });

  it("keeps every exempt name free of a hand-written door", () => {
    for (const [name, reason] of Object.entries(exemptOperations)) {
      expect(reason.length, `${name} carries a written reason`).toBeGreaterThan(
        20
      );
      expect(
        Object.hasOwn(operations, name),
        `${name} is not twice listed`
      ).toBe(false);
    }
  });

  it("declares one argument spec for every argument it samples", () => {
    for (const entry of operationEntries) {
      expect(
        entry.arguments.length,
        `${entry.name} declares one spec per sample`
      ).toBe(entry.samples().length);
      expect(
        entry.arguments.length,
        `${entry.name} takes an argument`
      ).toBeGreaterThan(0);

      for (const argument of entry.arguments) {
        expect(
          argument.domain.length,
          `${entry.name} names the domain its argument carries`
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("every operation accepts a call built from its own samples", () => {
  it("passes every valid call", () => {
    for (const entry of operationEntries) {
      expect(
        rejectionOf(entry, samplesOf(entry)),
        `${entry.name} accepts`
      ).toBeUndefined();
    }
  });
});

describe("every operation rejects a foreign key on any argument at any depth", () => {
  it("rejects every key, method, argument and node the table declares", () => {
    let cases = 0;

    for (const entry of operationEntries) {
      for (const [index, argument] of entry.arguments.entries()) {
        if (argument.kind === "callback") {
          continue;
        }

        const samples = samplesOf(entry);
        const refs = nodeRefs(samples[index]);

        for (const ref of refs) {
          for (const method of attachMethods) {
            for (const key of rotated(foreignKeys)) {
              if (Object.hasOwn(ref.node, key)) {
                continue;
              }

              for (const value of foreignValues()) {
                const holder = { current: samples[index] };
                const restore = attach(ref, holder, method, key, value);

                if (restore === undefined) {
                  continue;
                }

                const call = [...samples];
                call[index] = holder.current;

                try {
                  const message = rejectionOf(entry, call);

                  expect(
                    message,
                    `${labelOf(entry, cases)} ${argument.domain} ${method} ${String(key)}`
                  ).toBeDefined();
                  expect(
                    messageNames(message ?? "", key),
                    `${labelOf(entry, cases)} names ${String(key)}: ${message ?? "accepted"}`
                  ).toBe(true);
                } finally {
                  restore();
                }

                cases += 1;
              }
            }
          }
        }
      }
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });

  it("rejects every key and method on a value a lookup returns", () => {
    let cases = 0;

    for (const entry of operationEntries) {
      for (const [index, argument] of entry.arguments.entries()) {
        if (argument.kind !== "callback") {
          continue;
        }

        for (const method of attachMethods) {
          for (const key of rotated(foreignKeys)) {
            const samples = samplesOf(entry);
            const wrapper = Option.some(argument.sample());
            const holder = { current: wrapper };

            const ref: NodeRef = {
              key: undefined,
              node: wrapper,
              parent: undefined,
            };

            const restore = attach(ref, holder, method, key, "stranger");

            if (restore === undefined) {
              continue;
            }

            const call = [...samples];
            call[index] = () => holder.current;

            try {
              const message = rejectionOf(entry, call);

              expect(
                message,
                `${labelOf(entry, cases)} lookup ${method} ${String(key)}`
              ).toBeDefined();
              expect(
                messageNames(message ?? "", key),
                `${labelOf(entry, cases)} lookup names ${String(key)}`
              ).toBe(true);
            } finally {
              restore();
            }

            cases += 1;
          }
        }
      }
    }

    expect(cases).toBeGreaterThan(0);
  });
});

describe("the earlier verdict reproductions stay rejected", () => {
  it("keeps the fifty-seventh verdict reproductions rejected", () => {
    const hiddenRate = Object.defineProperty(
      { currency: "EUR", minor: 1000 },
      "rate",
      { configurable: true, value: "0.85" }
    );

    expect(
      rejectionOf(operations.addMoney, [
        hiddenRate,
        { currency: "EUR", minor: 1000 },
      ])
    ).toContain('"rate"');

    const ownSymbol = Symbol("rate");

    const symbolMoney = {
      currency: "EUR",
      minor: 1000,
      [ownSymbol]: "0.85",
    };

    expect(rejectionOf(operations.sameCurrencyAmount, [symbolMoney])).toContain(
      '"Symbol(rate)"'
    );
  });

  it("keeps the fifty-eighth verdict reproductions rejected", () => {
    const sameCurrency = model.sameCurrencyAmount(moneyOf("EUR", 1000));

    for (const key of siblingKeys) {
      const forged = { ...sameCurrency, [key]: "0.85" };

      const message = rejectionOf(operations.sourceAmount, [forged]);

      expect(message, `sourceAmount ${key}`).toContain(`"${key}"`);
    }

    const money = moneyOf("EUR", 1000);

    expect(
      rejectionOf(operations["BaseAmount.atRate"], [
        { ...money, rate: "0.85" },
        "EUR",
        rateOf("0.85"),
      ])
    ).toContain('"rate"');
  });

  it("keeps the sixty-third verdict reproductions rejected", () => {
    const money = moneyOf("EUR", 1000);
    const rate = rateOf("0.85");
    const amounts = { ...model.sameCurrencyAmount(money), rate };

    expect(rejectionOf(operations.sourceAmount, [amounts])).toContain('"rate"');

    const lookup = () => Object.assign(Option.some(rate), { amount: money });

    for (const entry of [
      operations.convert,
      operations["BaseAmount.convert"],
    ]) {
      const message = rejectionOf(entry, [money, "GBP", lookup]);

      expect(message, `${entry.name} lookup wrapper`).toContain('"amount"');
    }
  });
});

interface Probe {
  readonly label: string;
  readonly value: unknown;
}

const probeMoney = () => moneyOf("EUR", 1000);

const bareProbe = (): unknown =>
  Object.assign(Object.create(null), probeMoney());

const functionProbe = (foreign?: {
  readonly key: string | symbol;
  readonly value: unknown;
}): unknown => Object.assign(() => null, probeMoney(), foreign ?? {});

const pick = <T>(values: readonly T[], index: number): T => {
  const value = values[index % values.length];

  if (value === undefined) {
    throw new Error("the table hands out no row to test.");
  }

  return value;
};

const foreignAt = (
  turn: number
): { readonly key: string | symbol; readonly value: unknown } => ({
  key: foreignKeys[turn % foreignKeys.length] ?? "rate",
  value: foreignValues()[turn % 2],
});

const probesOf = (foreign: {
  readonly key: string | symbol;
  readonly value: unknown;
}): readonly Probe[] => {
  const bare = bareProbe();
  const probe = functionProbe();
  const keyed = functionProbe(foreign);

  class ProbeAmount {
    readonly currency = "EUR";
    readonly minor = 1000;
  }

  return [
    { label: "a function carrying money fields", value: probe },
    {
      label: `a function carrying money fields plus ${String(foreign.key)}`,
      value: keyed,
    },
    {
      label: "a class instance carrying money fields",
      value: new ProbeAmount(),
    },
    { label: "a null-prototype object carrying money fields", value: bare },
  ];
};

const defiledCall = (
  entry: OperationEntry,
  index: number,
  value: unknown
): readonly unknown[] => {
  const call = [...samplesOf(entry)];
  const argument = entry.arguments[index];

  call[index] =
    argument !== undefined && argument.kind === "callback"
      ? () => value
      : value;

  return call;
};

describe("no function, class instance or bare prototype reaches a domain argument", () => {
  it("rejects every one of them and still passes every valid call", () => {
    let cases = 0;
    let covered = 0;

    const check = (
      entry: OperationEntry,
      index: number,
      probe: Probe,
      turn: number
    ): void => {
      const label = `${entry.name} argument ${String(index)} ${probe.label} seed ${String(SEED)} turn ${String(turn)}`;

      const message = rejectionOf(
        entry,
        defiledCall(entry, index, probe.value)
      );

      expect(message, label).toBeDefined();
      expect(message ?? "", label).toContain('"$"');

      cases += 1;
    };

    for (const entry of operationEntries) {
      expect(
        rejectionOf(entry, samplesOf(entry)),
        `${entry.name} accepts`
      ).toBeUndefined();

      for (const [index, argument] of entry.arguments.entries()) {
        for (const [turn, probe] of probesOf(foreignAt(index)).entries()) {
          check(entry, index, probe, turn);
          covered += 1;
        }

        expect(argument.domain.length).toBeGreaterThan(0);
      }
    }

    for (let turn = 0; turn < 700; turn += 1) {
      const entry = pick(operationEntries, turn);
      const index = (rotation() + turn) % entry.arguments.length;
      const probe = pick(probesOf(foreignAt(turn)), rotation() + turn);

      check(entry, index, probe, turn);
    }

    expect(cases).toBeGreaterThanOrEqual(100);
    expect(covered).toBe(
      operationEntries.reduce(
        (total, entry) => total + entry.arguments.length * 4,
        0
      )
    );
  });
});

interface Leak {
  readonly label: string;
  readonly path: string;
}

const looksLikeEncoder = (value: object): boolean =>
  typeof Reflect.get(value, "decode") === "function" &&
  typeof Reflect.get(value, "encode") === "function";

const leaksOf = (root: unknown): readonly Leak[] => {
  const leaks: Leak[] = [];
  const seen = new WeakSet<object>();

  const visit = (value: unknown, path: string, depth: number): void => {
    if (
      (typeof value !== "object" || value === null) &&
      typeof value !== "function"
    ) {
      return;
    }

    const node: object = value;

    if (seen.has(node)) {
      return;
    }

    seen.add(node);

    if (Schema.isSchema(node)) {
      leaks.push({ label: "a raw schema", path });
    } else if (looksLikeEncoder(node) && !isModelCodec(node)) {
      leaks.push({ label: "an encoder that skips the gate", path });
    }

    if (depth >= 8) {
      return;
    }

    for (const key of Reflect.ownKeys(node)) {
      visit(Reflect.get(node, key), `${path}.${String(key)}`, depth + 1);
    }
  };

  visit(root, "$", 0);

  return leaks;
};

describe("operation metadata hands out names and samples only", () => {
  it("exposes no raw schema and no encoder outside the gate on any export", () => {
    expect(leaksOf(model)).toStrictEqual([]);
  });

  it("names the path of a leak it is handed", () => {
    const leaks = leaksOf({ nested: [{ oops: MoneySchema }] });

    expect(leaks[0]?.path).toBe("$.nested.0.oops");
    expect(leaks[0]?.label).toBe("a raw schema");
    expect(leaks.length).toBeGreaterThan(0);
  });

  it("keeps the codec table a set of doors the walker still guards", () => {
    const money = moneyOf("EUR", 1000);
    const strayed = { ...money, rate: "0.85" } as never;

    expect(Result.isSuccess(model.codecs.money.decode(money))).toBe(true);
    expect(Result.isFailure(model.codecs.money.encode(strayed))).toBe(true);
  });

  it("keeps every argument spec to a name, a kind and a sample", () => {
    for (const entry of operationEntries) {
      for (const argument of entry.arguments) {
        expect(
          Object.keys(argument).toSorted(),
          `${entry.name} spec keys`
        ).toStrictEqual(["domain", "kind", "sample"]);
      }
    }
  });
});

describe("the sixty-fifth verdict reproductions stay closed", () => {
  it("rejects a function dressed as money wherever a domain value is expected", () => {
    const money = moneyOf("EUR", 1000);
    const disguised = Object.assign(() => null, money, { rate: "0.85" });

    expect(
      rejectionOf(operations.addMoney, [disguised, money]),
      "addMoney"
    ).toContain('"$"');

    expect(
      rejectionOf(operations["BaseAmount.atRate"], [
        disguised,
        "EUR",
        rateOf("0.85"),
      ]),
      "BaseAmount.atRate"
    ).toContain('"$"');
  });

  it("keeps the operation metadata free of the schema it gates with", () => {
    for (const entry of operationEntries) {
      for (const argument of entry.arguments) {
        expect(Object.hasOwn(argument, "handle")).toBe(false);
        expect(argument.sample()).toBeDefined();
      }
    }

    expect(
      Object.hasOwn(
        operations["BaseAmount.atRate"].arguments[0] ?? {},
        "handle"
      )
    ).toBe(false);
  });
});
