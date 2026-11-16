import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { foreignMinorLimit } from "../src/schema/limits.js";
import { setupSteps, transactionRow } from "./rows.js";
import {
  insertStep,
  openMigratedDatabase,
  runStep,
} from "./sqlite-database.js";
import type { Row, SqlStep } from "./sqlite-database.js";

const recordedAt = 1_767_225_600_000;

const maxSafeMinor = Number.MAX_SAFE_INTEGER;

const firstUnsafeMinor = maxSafeMinor + 1;

const caseCount = 600;

const seed = 20_260_211;

const makeRandom = (initial: number) => {
  let state = initial % 2_147_483_647;

  if (state <= 0) {
    state += 2_147_483_646;
  }

  return () => {
    state = (state * 48_271) % 2_147_483_647;

    return state / 2_147_483_646;
  };
};

type Random = () => number;

const pick = <A>(random: Random, values: readonly [A, ...A[]]): A =>
  values[Math.floor(random() * values.length)] ?? values[0];

const randomInteger = (random: Random, low: number, high: number): number => {
  const span = high - low + 1;

  return Math.min(high, low + Math.floor(random() * span));
};

const amountEdges: readonly [number, ...number[]] = [
  0,
  1,
  -1,
  2,
  -2,
  99,
  -99,
  2 ** 31,
  -(2 ** 31),
  2 ** 32,
  -(2 ** 32),
  2 ** 52,
  maxSafeMinor,
  -maxSafeMinor,
  maxSafeMinor - 1,
  firstUnsafeMinor,
  -firstUnsafeMinor,
  foreignMinorLimit,
  -foreignMinorLimit,
  foreignMinorLimit + 1,
  -(foreignMinorLimit + 1),
  1e15,
  -1e15,
  1e20,
  -1e20,
  0.5,
  -0.5,
  10.5,
];

const randomAmount = (random: Random): number => {
  const roll = random();

  if (roll < 0.5) {
    return pick(random, amountEdges);
  }

  const whole = Math.trunc((random() * 2 - 1) * 2 ** 52);

  return roll < 0.85 ? whole : whole + 0.5;
};

const rejection = (run: () => void): string => {
  try {
    run();

    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const extraBooks = [
  { account: "account-bhd", currency: "BHD", profile: "profile-bhd" },
  { account: "account-clf", currency: "CLF", profile: "profile-clf" },
  { account: "account-jpy", currency: "JPY", profile: "profile-jpy" },
] as const;

const profileNames = new Map([
  ["BHD", "Demo Dinar"],
  ["CLF", "Demo Unit"],
  ["JPY", "Demo Yen"],
]);

interface Book {
  readonly account: string;
  readonly currency: string;
  readonly profile: string;
}

const baseBooks: readonly [Book, ...Book[]] = [
  { account: "account-demo", currency: "EUR", profile: "profile-demo" },
  ...extraBooks,
];

const migratedBook = Effect.gen(function* openBook() {
  const database = yield* openMigratedDatabase;

  for (const [table, row] of setupSteps) {
    runStep(database, insertStep(table, row));
  }

  for (const book of extraBooks) {
    runStep(
      database,
      insertStep("profiles", {
        base_currency: book.currency,
        created_at: recordedAt,
        id: book.profile,
        kind: "personal",
        name: profileNames.get(book.currency) ?? book.profile,
      })
    );
    runStep(
      database,
      insertStep("provider_accounts", {
        created_at: recordedAt,
        external_id: `external-${book.account}`,
        id: book.account,
        kind: "bank",
        label: "Demo Bank",
        profile_id: book.profile,
        provider_id: "wise",
      })
    );
  }

  return database;
});

const transactionStep = (suffix: string, values: Row): SqlStep =>
  insertStep("transactions", {
    ...transactionRow,
    external_id: `external-${suffix}`,
    id: `transaction-${suffix}`,
    ...values,
  });

const conversionStep = (
  suffix: string,
  book: Book,
  sourceCurrency: string,
  sourceMinor: number,
  baseMinor: number,
  rate: number
): SqlStep =>
  transactionStep(suffix, {
    base_currency: book.currency,
    base_minor: baseMinor,
    provider_account_id: book.account,
    profile_id: book.profile,
    rate,
    rate_as_of: "2026-01-01",
    source_currency: sourceCurrency,
    source_minor: sourceMinor,
  });

const zeroExponentCurrencies = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "UYI",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

const threeExponentCurrencies = new Set([
  "BHD",
  "IQD",
  "JOD",
  "KWD",
  "LYD",
  "OMR",
  "TND",
]);

const fourExponentCurrencies = new Set(["CLF", "UYW"]);

const exponentOf = (currency: string): number => {
  if (fourExponentCurrencies.has(currency)) {
    return 4;
  }

  if (threeExponentCurrencies.has(currency)) {
    return 3;
  }

  return zeroExponentCurrencies.has(currency) ? 0 : 2;
};

const currencyPool: readonly [string, ...string[]] = [
  "JPY",
  "ISK",
  "XOF",
  "USD",
  "EUR",
  "GBP",
  "BHD",
  "KWD",
  "CLF",
  "UYW",
  "ABC",
];

const otherCurrency = (random: Random, base: Book): string => {
  const candidate = pick(random, currencyPool);

  return candidate === base.currency ? "ABC" : candidate;
};

const convertedMinor = (
  sourceMinor: number,
  rate: number,
  difference: number
): number => {
  const product = sourceMinor * rate;

  return difference < 0
    ? product / 10 ** Math.abs(difference)
    : product * 10 ** difference;
};

const expectedTransactionConstraint = (
  baseMinor: number,
  sourceMinor: number,
  toleranceHolds: boolean,
  boundHolds: boolean
): string | undefined => {
  if (!Number.isSafeInteger(baseMinor)) {
    return "transactions_base_minor_integer_check";
  }

  if (!Number.isSafeInteger(sourceMinor)) {
    return "transactions_source_minor_integer_check";
  }

  if (!toleranceHolds) {
    return "transactions_rate_amount_check";
  }

  return boundHolds ? undefined : "transactions_rate_amount_bound_check";
};

it.effect("money columns accept exactly the safe integers", () =>
  Effect.gen(function* verifySafeIntegers() {
    const database = yield* migratedBook;
    const random = makeRandom(seed);
    let accepted = 0;
    let rejected = 0;

    for (let index = 0; index < caseCount; index += 1) {
      const amount = randomAmount(random);

      const message = rejection(() => {
        runStep(
          database,
          transactionStep(`safe-${index}`, {
            base_minor: amount,
            source_minor: amount,
          })
        );
      });

      const allowed = Number.isSafeInteger(amount);

      expect(
        message === "",
        `${String(amount)} must ${allowed ? "be accepted" : "be rejected"}`
      ).toBe(allowed);

      if (allowed) {
        accepted += 1;
      } else {
        rejected += 1;
      }
    }

    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  })
);

const currencyAlphabet: readonly [string, ...string[]] = [
  "A",
  "B",
  "G",
  "Z",
  "a",
  "z",
  "0",
  "9",
  " ",
  "-",
  "_",
  "€",
];

const randomCurrencyCode = (random: Random): string => {
  const length = randomInteger(random, 0, 6);
  let code = "";

  for (let position = 0; position < length; position += 1) {
    code += pick(random, currencyAlphabet);
  }

  return code;
};

const exchangeDate = (index: number): string => {
  const year = 2026 + Math.floor(index / 336);
  const month = (Math.floor(index / 28) % 12) + 1;
  const day = (index % 28) + 1;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

it.effect("currency columns accept exactly three uppercase letters", () =>
  Effect.gen(function* verifyCurrencyCodes() {
    const database = yield* migratedBook;
    const random = makeRandom(seed + 1);
    const acceptedCode = /^[A-Z]{3}$/u;
    let accepted = 0;
    let rejected = 0;

    for (let index = 0; index < caseCount; index += 1) {
      const baseCurrency = randomCurrencyCode(random);

      const message = rejection(() => {
        runStep(
          database,
          insertStep("exchange_rates", {
            as_of: exchangeDate(index),
            base_currency: baseCurrency,
            fetched_at: recordedAt,
            quote_currency: "EUR",
            rate: 1.05,
          })
        );
      });

      const allowed = acceptedCode.test(baseCurrency);

      expect(
        message === "",
        `${JSON.stringify(baseCurrency)} must ${allowed ? "be accepted" : "be rejected"}`
      ).toBe(allowed);

      if (allowed) {
        accepted += 1;
      } else {
        rejected += 1;
      }
    }

    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  })
);

it.effect("a same-currency row stores one amount in both columns", () =>
  Effect.gen(function* verifySameCurrencyIdentity() {
    const database = yield* migratedBook;
    const random = makeRandom(seed + 2);
    let accepted = 0;
    let rejected = 0;

    for (let index = 0; index < caseCount; index += 1) {
      const sourceMinor = randomInteger(random, -maxSafeMinor, maxSafeMinor);
      const roll = random();
      let baseMinor = randomInteger(random, -maxSafeMinor, maxSafeMinor);

      if (roll < 0.4) {
        baseMinor = sourceMinor;
      } else if (roll < 0.7) {
        baseMinor = sourceMinor + 1;
      }

      const message = rejection(() => {
        runStep(
          database,
          transactionStep(`identity-${index}`, {
            base_minor: baseMinor,
            source_minor: sourceMinor,
          })
        );
      });

      const allowed = sourceMinor === baseMinor;

      expect(
        message === "",
        `${String(sourceMinor)} and ${String(baseMinor)} must ${allowed ? "be accepted" : "be rejected"}`
      ).toBe(allowed);

      if (allowed) {
        accepted += 1;
      } else {
        rejected += 1;
      }
    }

    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  })
);

const scalingAmounts: readonly [number, ...number[]] = [
  1, -1, 7, -7, 999, -999, 12_345, -12_345,
];

it.effect("a source amount converts by ten to the exponent difference", () =>
  Effect.gen(function* verifyExponentScaling() {
    const database = yield* migratedBook;
    const random = makeRandom(seed + 3);

    for (let index = 0; index < caseCount; index += 1) {
      const book = pick(random, baseBooks);
      const sourceCurrency = otherCurrency(random, book);
      const amount = pick(random, scalingAmounts);
      const difference = exponentOf(book.currency) - exponentOf(sourceCurrency);
      const exact = amount * 10 ** difference;
      const baseMinor = Math.round(exact);

      const acceptedMessage = rejection(() => {
        runStep(
          database,
          conversionStep(
            `scale-${index}`,
            book,
            sourceCurrency,
            amount,
            baseMinor,
            1
          )
        );
      });

      expect(
        acceptedMessage,
        `${String(amount)} ${sourceCurrency} into ${book.currency} at ${String(baseMinor)}`
      ).toBe("");

      for (const offset of [-2, 2]) {
        const farMessage = rejection(() => {
          runStep(
            database,
            conversionStep(
              `scale-${index}-${String(offset)}`,
              book,
              sourceCurrency,
              amount,
              baseMinor + offset,
              1
            )
          );
        });

        expect(
          farMessage,
          `${String(amount)} ${sourceCurrency} into ${book.currency} at ${String(baseMinor + offset)}`
        ).toContain("transactions_rate_amount_check");
      }
    }
  })
);

const rateEdges: readonly [number, ...number[]] = [
  0.0001, 0.01, 0.5, 1, 1.15, 1.5, 2, 7.3, 110, 123.456,
];

const randomRate = (random: Random): number =>
  random() < 0.6 ? pick(random, rateEdges) : random() * 1000 + 0.0001;

it.effect(
  "a conversion stays within one base minor unit of source times rate",
  () =>
    Effect.gen(function* verifyConversionTolerance() {
      const database = yield* migratedBook;
      const random = makeRandom(seed + 4);
      let accepted = 0;
      let rejected = 0;

      for (let index = 0; index < caseCount; index += 1) {
        const book = pick(random, baseBooks);
        const sourceCurrency = otherCurrency(random, book);

        const difference =
          exponentOf(book.currency) - exponentOf(sourceCurrency);

        const rate = randomRate(random);

        const sourceMinor =
          random() < 0.5
            ? randomInteger(random, -1_000_000, 1_000_000)
            : randomInteger(random, -foreignMinorLimit, foreignMinorLimit);

        const converted = convertedMinor(sourceMinor, rate, difference);
        const roll = random();
        let baseMinor = Math.round(converted);

        if (roll >= 0.4 && roll < 0.55) {
          baseMinor = Math.trunc(converted);
        }

        if (roll >= 0.55) {
          baseMinor +=
            (2 + Math.floor(random() * 500)) * (random() < 0.5 ? -1 : 1);
        }

        const toleranceHolds = Math.abs(baseMinor - converted) <= 1;

        const boundHolds =
          Math.abs(sourceMinor) <= foreignMinorLimit &&
          Math.abs(baseMinor) <= foreignMinorLimit;

        const expected = expectedTransactionConstraint(
          baseMinor,
          sourceMinor,
          toleranceHolds,
          boundHolds
        );

        const message = rejection(() => {
          runStep(
            database,
            conversionStep(
              `tolerance-${index}`,
              book,
              sourceCurrency,
              sourceMinor,
              baseMinor,
              rate
            )
          );
        });

        if (expected === undefined) {
          expect(
            message,
            `${String(sourceMinor)} ${sourceCurrency} at ${String(rate)} into ${book.currency} at ${String(baseMinor)}`
          ).toBe("");
          accepted += 1;
        } else {
          expect(message, expected).toContain(expected);
          rejected += 1;
        }
      }

      expect(accepted).toBeGreaterThan(0);
      expect(rejected).toBeGreaterThan(0);
    })
);

const roundingRates: readonly [number, ...number[]] = [
  0.1, 0.25, 0.5, 1.15, 1.5, 2.5,
];

it.effect(
  "a conversion may sit one base minor unit from the product, never two",
  () =>
    Effect.gen(function* verifyRoundingWindow() {
      const database = yield* migratedBook;
      const random = makeRandom(seed + 5);
      const [book] = baseBooks;
      let accepted = 0;
      let rejected = 0;

      for (let index = 0; index < 200; index += 1) {
        const sourceMinor = randomInteger(random, -1_000_000, 1_000_000);
        const rate = pick(random, roundingRates);
        const converted = sourceMinor * rate;
        const anchor = Math.floor(converted);

        for (const offset of [-2, -1, 0, 1, 2]) {
          const baseMinor = anchor + offset;
          const toleranceHolds = Math.abs(baseMinor - converted) <= 1;

          const message = rejection(() => {
            runStep(
              database,
              conversionStep(
                `rounding-${index}-${String(offset)}`,
                book,
                "USD",
                sourceMinor,
                baseMinor,
                rate
              )
            );
          });

          if (toleranceHolds) {
            expect(
              message,
              `${String(sourceMinor)} at ${String(rate)} into ${String(baseMinor)}`
            ).toBe("");
            accepted += 1;
          } else {
            expect(
              message,
              `${String(sourceMinor)} at ${String(rate)}`
            ).toContain("transactions_rate_amount_check");
            rejected += 1;
          }
        }
      }

      expect(accepted).toBeGreaterThan(0);
      expect(rejected).toBeGreaterThan(0);
    })
);

const boundOffsets: readonly [number, ...number[]] = [
  -3, -2, -1, 0, 1, 2, 3, 1_000_000, -1_000_000,
];

it.effect("the foreign bound refuses one minor unit past the limit", () =>
  Effect.gen(function* verifyForeignBound() {
    const database = yield* migratedBook;
    const random = makeRandom(seed + 6);
    let accepted = 0;
    let rejected = 0;

    for (let index = 0; index < caseCount; index += 1) {
      const amount = foreignMinorLimit + pick(random, boundOffsets);

      const message = rejection(() => {
        runStep(
          database,
          conversionStep(
            `bound-${index}`,
            baseBooks[0],
            "USD",
            amount,
            amount,
            1
          )
        );
      });

      const allowed = Math.abs(amount) <= foreignMinorLimit;

      expect(
        message === "",
        `${String(amount)} must ${allowed ? "be accepted" : "be rejected"}`
      ).toBe(allowed);

      if (allowed) {
        accepted += 1;
      } else {
        expect(message).toContain("transactions_rate_amount_bound_check");
        rejected += 1;
      }
    }

    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  })
);

it.effect("the foreign bound checks the source and the base separately", () =>
  Effect.gen(function* verifyEachSideOfBound() {
    const database = yield* migratedBook;

    const [euro] = baseBooks;

    const yen = baseBooks.find((book) => book.currency === "JPY") ?? euro;

    const sourceMessage = rejection(() => {
      runStep(
        database,
        conversionStep(
          "bound-source",
          yen,
          "CLF",
          foreignMinorLimit + 1,
          100_000_000,
          1
        )
      );
    });

    expect(sourceMessage).toContain("transactions_rate_amount_bound_check");

    const baseMessage = rejection(() => {
      runStep(
        database,
        conversionStep(
          "bound-base",
          euro,
          "USD",
          foreignMinorLimit,
          foreignMinorLimit * 2,
          2
        )
      );
    });

    expect(baseMessage).toContain("transactions_rate_amount_bound_check");

    const acceptedMessage = rejection(() => {
      runStep(
        database,
        conversionStep(
          "bound-edge",
          euro,
          "USD",
          foreignMinorLimit,
          foreignMinorLimit,
          1
        )
      );
    });

    expect(acceptedMessage).toBe("");
  })
);
