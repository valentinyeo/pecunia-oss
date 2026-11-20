import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { taxOwedOf, totalBalanceOf } from "../src/balance.js";
import type { AccountBalance } from "../src/model.js";
import { AccountBalanceSchema } from "../src/model.js";
import {
  CASES,
  currencyOf,
  obligationOf,
  rateLookup,
  rateLookupOf,
  seeded,
  uuidOf,
} from "./fixtures.js";

const draw = seeded(515_151);

const accountOf = (
  index: number,
  currency: string,
  minor: number
): AccountBalance =>
  Schema.decodeSync(AccountBalanceSchema)({
    accountId: uuidOf(300 + index),
    balance: { currency, minor },
    kind: "current",
    name: `Demo Account ${index}`,
  });

const euro = currencyOf("EUR");

it.effect(
  "every account converts into one currency and the rows add up to the total",
  () =>
    Effect.gen(function* totalBalance() {
      for (let index = 0; index < CASES; index += 1) {
        const first = draw(900_000);
        const second = draw(900_000);
        const dollars = draw(900_000);

        const balance = yield* totalBalanceOf(
          [
            accountOf(1, "EUR", first),
            accountOf(2, "EUR", second),
            accountOf(3, "USD", dollars),
          ],
          euro,
          rateLookup
        );

        const converted = Math.round(dollars * 0.92);

        const rows = balance.accounts.reduce(
          (total, row) => total + row.amount.minor,
          0
        );

        expect(balance.totalMinor).toBe(first + second + converted);
        expect(rows).toBe(balance.totalMinor);
        expect(
          balance.accounts.every((row) => row.amount.currency === "EUR")
        ).toBe(true);
      }
    })
);

it.effect("a base currency with no minor unit still converts exactly", () =>
  Effect.gen(function* yenBase() {
    const balance = yield* totalBalanceOf(
      [accountOf(1, "USD", 100_000)],
      currencyOf("JPY"),
      rateLookupOf([{ from: "USD", rate: "155", to: "JPY" }])
    );

    expect(balance.totalMinor).toBe(155_000);
    expect(balance.accounts[0]?.amount.currency).toBe("JPY");
  })
);

it.effect("a missing rate is refused by name instead of being guessed", () =>
  Effect.gen(function* missingRate() {
    const failure = yield* totalBalanceOf(
      [accountOf(1, "GBP", 100)],
      currencyOf("JPY"),
      rateLookup
    ).pipe(Effect.flip);

    expect(failure._tag).toBe("RateMissing");
  })
);

it.effect(
  "tax owed counts only what is still estimated, converted to the base currency",
  () =>
    Effect.gen(function* taxStillOwed() {
      const owed = yield* taxOwedOf(
        [
          obligationOf(uuidOf(1), 120_000, "EUR", "Estimated"),
          obligationOf(uuidOf(2), 50_000, "EUR", "Paid"),
          obligationOf(uuidOf(3), 10_000, "EUR", "WrittenOff"),
          obligationOf(uuidOf(4), 100_000, "USD", "Estimated"),
        ],
        euro,
        rateLookup
      );

      expect(owed.minor).toBe(212_000);
      expect(owed.currency).toBe("EUR");
    })
);

it.effect("no obligations owed reads as zero in the book's currency", () =>
  Effect.gen(function* nothingOwed() {
    const owed = yield* taxOwedOf([], euro, rateLookup);

    expect(owed.minor).toBe(0);
    expect(owed.currency).toBe("EUR");
  })
);
