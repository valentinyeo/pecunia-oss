import { Effect, Result } from "effect";
// oxlint-disable anti-slop-effect/no-manual-tagged-construction, effect-tests/no-manual-effect-runtime-in-tests, anti-slop/no-unknown-returns, eslint/prefer-object-spread, typescript/no-unsafe-type-assertion, typescript/no-unsafe-assignment, typescript/no-unnecessary-type-assertion, typescript/no-misused-spread, typescript/no-unsafe-argument, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unknown-parameters, anti-slop/no-known-value-widening, anti-slop/no-manual-tagged-construction, anti-slop/no-reflect-get, anti-slop/no-runtime-typeof, anti-slop/no-object-parameters, anti-slop/no-known-value-widening -- the registry test forges copies on purpose so every door has to refuse them
import { describe, expect, it } from "vitest";

import { parse, render, verified } from "../../src/model/codec.js";
import { codecs } from "../../src/model/codecs.js";
import { ConvertedAmount } from "../../src/model/converted-amount.js";
import {
  conversionOverflow,
  currencyMismatch,
  moneyOverflow,
} from "../../src/model/errors.js";
import {
  addMoney,
  sameCurrencyAmount,
  sourceAmount,
} from "../../src/model/money.js";
import { operations } from "../../src/model/operations.js";
import { rateText } from "../../src/model/rate.js";

const SEED = 2392;

let state = SEED;

const draw = <T>(rows: readonly T[]): T => {
  state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;

  const row = rows[state % rows.length];

  if (row === undefined) {
    throw new Error("the table hands out no row.");
  }

  return row;
};

const moneyOf = (currency: string, minor: number) =>
  parse(codecs.money, { currency, minor });

const rateOf = (text: string) => parse(codecs.rate, text);

const dateOf = (text: string) => parse(codecs.dateOnly, text);

const codeOf = (text: string) => parse(codecs.currencyCode, text);

const convertedOf = () =>
  Result.getOrThrow(
    ConvertedAmount.converting(
      moneyOf("USD", 1000),
      codeOf("EUR"),
      rateOf("0.85"),
      dateOf("2024-01-30")
    )
  );

const transactionOf = () =>
  parse(codecs.transaction, {
    amounts: { _tag: "SameCurrency", amount: { currency: "EUR", minor: 1000 } },
    categorization: { _tag: "None" },
    classification: { _tag: "None" },
    createdAt: parse(codecs.timestamp, "2024-01-31T10:00:00.000Z"),
    direction: "out",
    externalId: "demo-external",
    fee: null,
    id: "018f2b7c-1234-7abc-8def-0123456789b2",
    note: "",
    occurredAt: parse(codecs.timestamp, "2024-01-31T10:00:00.000Z"),
    payeeId: null,
    profileId: "018f2b7c-1234-7abc-8def-0123456789ab",
    providerAccountId: "018f2b7c-1234-7abc-8def-0123456789cd",
    raw: {
      description: "Example Ltd",
      merchant: "Example Ltd",
      reference: "INV-1",
    },
    status: "posted",
    valueDate: "2024-01-30",
  });

class FakeMoney {
  readonly currency = "EUR";
  readonly minor = 1000;
}

const forgedCopies = (
  value: object
): readonly { name: string; value: unknown }[] => {
  const assignCopy = { ...value };
  const nullPrototype = Object.assign(Object.create(null), value);
  const fake = Object.assign(new FakeMoney(), value);
  const map = new Map(Object.entries(value));

  return [
    { name: "spread copy", value: { ...value } },
    { name: "Object.assign copy", value: assignCopy },
    { name: "Map", value: map },
    { name: "Set", value: new Set([value]) },
    { name: "function", value: Object.assign(() => null, value) },
    { name: "class instance", value: fake },
    { name: "null-prototype object", value: nullPrototype },
  ];
};

const messageOf = (value: unknown): string | undefined => {
  if (value instanceof Error) {
    return value.message;
  }

  if (Result.isResult(value)) {
    return Result.isFailure(value)
      ? (value.failure as { readonly message: string }).message
      : undefined;
  }

  return undefined;
};

const messageOfFailure = (
  settled: Result.Result<unknown, { readonly message: string }>
): string => (Result.isFailure(settled) ? settled.failure.message : "accepted");

const effectRefusal = (
  effect: Effect.Effect<unknown, { readonly message: string }>
): string => messageOfFailure(Effect.runSync(Effect.result(effect)));

const refusalOf = (run: () => unknown): string => {
  try {
    const message = messageOf(run());

    if (message !== undefined) {
      return message;
    }
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error("the door accepted a forged value.");
};

const entryOf = (name: string) => {
  const entry = operations[name as keyof typeof operations];

  if (entry === undefined) {
    throw new Error(`${name} is not in the operation table.`);
  }

  return entry;
};

describe("a made value is frozen, so no door has to read its keys", () => {
  it("refuses to attach a field to money, a conversion, a transaction or an error", () => {
    const money = moneyOf("EUR", 1000);
    const converted = convertedOf();
    const transaction = transactionOf();

    const error = currencyMismatch({
      left: codeOf("EUR"),
      right: codeOf("USD"),
    });

    for (const [name, value] of [
      ["Money", money],
      ["ConvertedAmount", converted],
      ["Transaction", transaction],
      ["CurrencyMismatch", error],
    ] as const) {
      state = (state + 1) % 2_147_483_648;

      expect(
        () => Object.assign(value as object, { rate: rateOf("0.85") }),
        `${name} assign seed ${SEED}`
      ).toThrow(/rate/u);
      const rate = Reflect.get(value as object, "rate");

      try {
        Object.defineProperty(value as object, "rate", {
          value: rateOf("0.85"),
        });
      } catch {
        expect(Reflect.get(value as object, "rate"), `${name} rate`).toBe(rate);
      }

      expect(Object.isFrozen(value), `${name} frozen`).toBe(true);
    }
  });

  it("keeps the seventieth door shut on an error stack", () => {
    const money = moneyOf("EUR", 1000);

    const error = moneyOverflow({
      currency: codeOf("EUR"),
      left: 1 as never,
      operation: "add",
      right: 2 as never,
    });

    expect(() => Object.assign(error, { stack: money })).toThrow(/stack/u);
    expect(JSON.stringify(render(codecs.moneyOverflow, error))).not.toContain(
      "EUR 1000"
    );
    expect(
      refusalOf(() =>
        verified(codecs.moneyOverflow, { ...error, stack: money } as never)
      )
    ).toContain("stack");
  });

  it("keeps the seventieth door shut on a Map around a rate", () => {
    const money = moneyOf("EUR", 1000);
    const rate = rateOf("0.85");
    const smuggled = Object.assign(new Map([["rate", money]]), rate);

    const message = refusalOf(() => rateText(smuggled as never));

    expect(message).toContain("Rate");
    expect(message).toContain("Map");
    expect(message).not.toContain("object Map");
  });

  it("keeps the fifty-seventh, fifty-eighth, sixty-third, sixty-fifth and sixty-seventh reproductions rejected", () => {
    const money = moneyOf("EUR", 1000);

    expect(
      effectRefusal(addMoney({ ...money, rate: "0.85" } as never, money))
    ).toContain("rate");
    expect(
      effectRefusal(addMoney(new Map(Object.entries(money)) as never, money))
    ).toContain("Map");
    expect(
      effectRefusal(addMoney(Object.assign(() => null, money) as never, money))
    ).toContain("function");
    expect(
      effectRefusal(
        addMoney(Object.assign(Object.create(null), money) as never, money)
      )
    ).toContain("null-prototype");
    expect(
      refusalOf(() =>
        sourceAmount(Object.assign({}, sameCurrencyAmount(money)) as never)
      )
    ).toContain("Amounts");

    const overflow = conversionOverflow({
      baseCurrency: codeOf("EUR"),
      currency: codeOf("USD"),
      minor: 1 as never,
      rate: "0.85",
    });

    expect(
      (render(codecs.conversionOverflow, overflow) as { rate: string }).rate
    ).toBe("0.85");
  });
});

describe("every door accepts only registry members", () => {
  it("rejects each forged copy at each argument slot, seeded", () => {
    const slots: {
      readonly entry: string;
      readonly index: number;
      readonly value: unknown;
    }[] = [];

    for (const [entryName, entry] of Object.entries(operations)) {
      for (const [index, spec] of entry.arguments.entries()) {
        if (spec.kind === "callback" || entry.channel === "effect") {
          continue;
        }

        slots.push({ entry: entryName, index, value: spec.sample() });
      }
    }

    expect(slots.length).toBeGreaterThan(8);

    let cases = 0;

    for (let step = 0; step < 700; step += 1) {
      const slot = draw(slots);
      const entry = entryOf(slot.entry);
      const forged = draw(forgedCopies(slot.value as object));
      const call = entry.samples() as unknown[];

      call[slot.index] = forged.value;

      const message = refusalOf(() => entry.invoke(call));

      expect(
        message,
        `seed ${SEED} step ${step} ${slot.entry} argument ${String(slot.index + 1)} ${forged.name}`
      ).toContain(entry.name);

      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(700);
  });

  it("rejects a forged copy on the effect channel too", () => {
    const money = moneyOf("EUR", 1000);

    for (const forged of forgedCopies(money)) {
      expect(
        effectRefusal(addMoney(forged.value as never, money)),
        `${forged.name} on addMoney`
      ).not.toBe("accepted");
    }
  });

  it("still runs a valid call and freezes what it returns", () => {
    const money = moneyOf("EUR", 1000);
    const sum = Effect.runSync(addMoney(money, moneyOf("EUR", 250)));
    const converted = convertedOf();

    expect(Object.isFrozen(sum), "sum frozen").toBe(true);
    expect(Object.isFrozen(converted), "conversion frozen").toBe(true);
    expect(Object.isFrozen(converted.source), "source frozen").toBe(true);
    expect(
      Object.isFrozen(sourceAmount(converted)),
      "sourceAmount stays made"
    ).toBe(true);
    expect(parse(codecs.money, { currency: "EUR", minor: 1 })).toStrictEqual(
      moneyOf("EUR", 1)
    );
  });

  it("keeps the door table honest about handles that are not model codecs", () => {
    const handle = codecs.money as never;

    expect(
      refusalOf(() => render(handle, { currency: "EUR", minor: 1 } as never))
    ).toContain("MoneySchema");
  });
});
