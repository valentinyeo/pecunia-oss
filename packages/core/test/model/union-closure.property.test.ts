import { DateTime, Option, Predicate, Result, Schema } from "effect";
import type { SchemaAST } from "effect";
import { describe, expect, it } from "vitest";

import * as model from "../../src/model/index.js";
import { strictParseOptions } from "../../src/model/index.js";

interface MoneySample {
  readonly currency: string;
  readonly minor: number;
}

interface CountSample {
  readonly imported: number;
  readonly rejected: number;
  readonly skipped: number;
}

type FieldValue =
  | string
  | number
  | boolean
  | null
  | DateTime.Utc
  | MoneySample
  | CountSample;

type Wire = Readonly<Record<string, FieldValue>>;

type Codec = Schema.Top & {
  readonly DecodingServices: never;
  readonly EncodingServices: never;
};

interface MemberCase {
  readonly name: string;
  readonly wire: Wire;
}

interface UnionCase {
  readonly schema: Codec;
  readonly members: readonly MemberCase[];
}

const CASES_PER_MEMBER = 200;

const SEED = 0x9e_37_79_b9;

const rng = () => {
  let state = SEED;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
};

const unitRandom = rng();

const pick = <T>(values: readonly T[]): T => {
  const roll = unitRandom();
  const index = Math.floor(roll * values.length);
  const value = values.at(index);

  if (value === undefined) {
    throw new TypeError("cannot pick from an empty list");
  }

  return value;
};

const integer = (low: number, high: number): number =>
  low + Math.floor(unitRandom() * (high - low + 1));

const hex = (length: number): string =>
  Array.from({ length }, () => "0123456789abcdef"[integer(0, 15)]).join("");

const SAFE_MINOR_UNITS = [
  0,
  1,
  -1,
  1000,
  -1000,
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER,
  -Number.MAX_SAFE_INTEGER,
] as const;

const MINOR_UNIT_CURRENCIES = ["JPY", "EUR", "USD", "KWD", "BHD"] as const;

let minorStep = 0;

const moneySample = (): MoneySample => {
  const step = minorStep;
  minorStep += 1;

  return {
    currency:
      MINOR_UNIT_CURRENCIES[step % MINOR_UNIT_CURRENCIES.length] ?? "EUR",
    minor:
      SAFE_MINOR_UNITS[
        Math.floor(step / MINOR_UNIT_CURRENCIES.length) %
          SAFE_MINOR_UNITS.length
      ] ?? 0,
  };
};

const uuidSample = (): string => `018f2b7c-1234-7abc-8def-${hex(12)}`;

const textSample = (): string =>
  `${pick(["demo", "sample", "fixture"])}-${hex(4)}`;

const dateSample = (): string =>
  `20${integer(10, 29)}-${String(integer(1, 12)).padStart(2, "0")}-${String(integer(1, 28)).padStart(2, "0")}`;

const stampSample = (): DateTime.Utc =>
  DateTime.makeUnsafe(
    `${dateSample()}T${String(integer(0, 23)).padStart(2, "0")}:00:00Z`
  );

const countSample = (): CountSample => ({
  imported: integer(0, 100),
  rejected: integer(0, 100),
  skipped: integer(0, 100),
});

const smallInteger = (): FieldValue =>
  pick([0, 1, -1, Number.MAX_SAFE_INTEGER]);

const generators = new Map<string, () => FieldValue>([
  ["amount", moneySample],
  ["archivedAt", stampSample],
  ["asOf", dateSample],
  ["at", stampSample],
  ["base", moneySample],
  ["chunk", smallInteger],
  ["costBasis", moneySample],
  ["counts", countSample],
  ["createdAt", stampSample],
  ["lastPrice", moneySample],
  ["maxAmount", () => pick(SAFE_MINOR_UNITS)],
  ["minAmount", () => pick(SAFE_MINOR_UNITS)],
  ["minor", smallInteger],
  ["openedOn", dateSample],
  ["pricedAt", stampSample],
  ["priority", smallInteger],
  ["quantity", smallInteger],
  ["rate", () => `${integer(1, 9)}.${hex(2)}`],
  ["source", moneySample],
  ["startedAt", stampSample],
]);

const valueFor = (key: string): FieldValue => {
  if (key.endsWith("Id")) {
    return uuidSample();
  }

  const generate = generators.get(key);

  return generate === undefined ? textSample() : generate();
};

const unknownKey = (declared: readonly string[]): string => {
  let key = `extra${hex(8)}`;

  while (declared.includes(key)) {
    key = `extra${hex(8)}`;
  }

  return key;
};

const dateOnly = (text: string) =>
  Schema.decodeSync(model.DateOnlySchema)(text);

const rateOf = (text: string) => Schema.decodeSync(model.RateSchema)(text);

const currencyOf = (text: string) =>
  Schema.decodeSync(model.CurrencyCodeSchema)(text);

const moneyOf = (currency: string, minor: number) =>
  Schema.decodeSync(model.MoneySchema)({ currency, minor });

const idOf = (schema: Codec, text: string) => Schema.decodeSync(schema)(text);

const stampOf = (text: string) =>
  Schema.decodeSync(model.TimestampSchema)(DateTime.makeUnsafe(text));

const uuidA = "018f2b7c-1234-7abc-8def-0123456789ab";

const uuidB = "018f2b7c-1234-7abc-8def-0123456789ac";

const uuidC = "018f2b7c-1234-7abc-8def-0123456789ad";

const at = () => stampOf("2024-01-01T00:00:00Z");

const convertedWire = (): Wire =>
  Schema.encodeSync(model.AmountsSchema)(
    Result.getOrThrow(
      model.ConvertedAmount.converting(
        moneyOf("USD", 1000),
        currencyOf("EUR"),
        rateOf("0.85"),
        dateOnly("2024-01-30")
      )
    )
  );

const sameCurrencyWire = (): Wire =>
  Schema.encodeSync(model.AmountsSchema)(
    model.sameCurrencyAmount(moneyOf("EUR", 1000))
  );

const archivedWire = (): Wire => {
  const member = model.ArchiveStateSchema.cases.Archived;

  return Schema.encodeSync(member)(
    member.make({
      archivedAt: at(),
      fileId: "demo-file",
      targetId: idOf(model.ArchiveTargetIdSchema, uuidA),
    })
  );
};

const failedArchiveWire = (): Wire => {
  const member = model.ArchiveStateSchema.cases.Failed;

  return Schema.encodeSync(member)(member.make({ reason: "demo" }));
};

const reservedWire = (): Wire => {
  const member = model.ArchiveStateSchema.cases.Reserved;

  return Schema.encodeSync(member)(
    member.make({
      fileId: "demo-file",
      targetId: idOf(model.ArchiveTargetIdSchema, uuidA),
    })
  );
};

const unarchivedWire = (): Wire => {
  const member = model.ArchiveStateSchema.cases.Unarchived;

  return Schema.encodeSync(member)(member.make({}));
};

const appliedWire = (): Wire => {
  const member = model.CategorizationSchema.cases.Applied;

  return Schema.encodeSync(member)(
    member.make({
      at: at(),
      categoryId: idOf(model.CategoryIdSchema, uuidA),
      ruleId: idOf(model.RuleIdSchema, uuidB),
    })
  );
};

const confirmedWire = (): Wire => {
  const member = model.CategorizationSchema.cases.Confirmed;

  return Schema.encodeSync(member)(
    member.make({
      at: at(),
      categoryId: idOf(model.CategoryIdSchema, uuidA),
    })
  );
};

const noneCategorizationWire = (): Wire => {
  const member = model.CategorizationSchema.cases.None;

  return Schema.encodeSync(member)(member.make({}));
};

const suggestedWire = (): Wire => {
  const member = model.CategorizationSchema.cases.Suggested;

  return Schema.encodeSync(member)(
    member.make({
      at: at(),
      categoryId: idOf(model.CategoryIdSchema, uuidA),
      model: "demo-model",
    })
  );
};

const excludedWire = (): Wire => {
  const member = model.ClassificationSchema.cases.Excluded;

  return Schema.encodeSync(member)(
    member.make({ ruleId: idOf(model.RuleIdSchema, uuidA) })
  );
};

const incomeWire = (): Wire => {
  const member = model.ClassificationSchema.cases.Income;

  return Schema.encodeSync(member)(
    member.make({
      clientPayeeId: idOf(model.PayeeIdSchema, uuidB),
      ruleId: idOf(model.RuleIdSchema, uuidA),
    })
  );
};

const internalTransferWire = (): Wire => {
  const member = model.ClassificationSchema.cases.InternalTransfer;

  return Schema.encodeSync(member)(
    member.make({ ruleId: idOf(model.RuleIdSchema, uuidA) })
  );
};

const noneClassificationWire = (): Wire => {
  const member = model.ClassificationSchema.cases.None;

  return Schema.encodeSync(member)(member.make({}));
};

const refundWire = (): Wire => {
  const member = model.ClassificationSchema.cases.Refund;

  return Schema.encodeSync(member)(
    member.make({
      ofPayeeId: Option.some(idOf(model.PayeeIdSchema, uuidB)),
      ruleId: idOf(model.RuleIdSchema, uuidA),
    })
  );
};

const selfTransferWire = (): Wire => {
  const member = model.ClassificationSchema.cases.SelfTransfer;

  return Schema.encodeSync(member)(
    member.make({
      counterpartProfileId: Option.some(idOf(model.ProfileIdSchema, uuidC)),
      ruleId: idOf(model.RuleIdSchema, uuidA),
    })
  );
};

const taxPaymentWire = (): Wire => {
  const member = model.ClassificationSchema.cases.TaxPayment;

  return Schema.encodeSync(member)(
    member.make({
      obligationKind: "vat",
      ruleId: idOf(model.RuleIdSchema, uuidA),
    })
  );
};

const estimatedWire = (): Wire => {
  const member = model.TaxObligationStatusSchema.cases.Estimated;

  return Schema.encodeSync(member)(member.make({ booksStatus: "open" }));
};

const paidWire = (): Wire => {
  const member = model.TaxObligationStatusSchema.cases.Paid;

  return Schema.encodeSync(member)(
    member.make({
      at: at(),
      settledBy: idOf(model.TransactionIdSchema, uuidA),
    })
  );
};

const writtenOffWire = (): Wire => {
  const member = model.TaxObligationStatusSchema.cases.WrittenOff;

  return Schema.encodeSync(member)(member.make({ reason: "demo" }));
};

const subscriptionWire = (
  state: "Cancelled" | "Confirmed" | "Detected" | "Dismissed" | "NotRecurring"
): Wire => {
  const member = model.SubscriptionStatusSchema.cases[state];

  return Schema.encodeSync(member)(member.make({ at: at() }));
};

const syncRunWire = (
  state:
    | "Cancelled"
    | "Categorizing"
    | "ChunkDone"
    | "Failed"
    | "Running"
    | "Succeeded"
): Wire => {
  const { cases } = model.SyncRunStateSchema;

  if (state === "Cancelled" || state === "Categorizing") {
    return Schema.encodeSync(cases[state])(cases[state].make({ at: at() }));
  }

  if (state === "ChunkDone") {
    return Schema.encodeSync(cases.ChunkDone)(
      cases.ChunkDone.make({ at: at(), chunk: 2 })
    );
  }

  if (state === "Failed") {
    return Schema.encodeSync(cases.Failed)(
      cases.Failed.make({ at: at(), tag: "demo" })
    );
  }

  if (state === "Running") {
    return Schema.encodeSync(cases.Running)(
      cases.Running.make({ chunk: 1, startedAt: at() })
    );
  }

  return Schema.encodeSync(cases.Succeeded)(
    cases.Succeeded.make({
      at: at(),
      counts: { imported: 1, rejected: 0, skipped: 0 },
    })
  );
};

const ruleWire = (kind: Wire) => ({
  createdAt: at(),
  direction: "any",
  enabled: true,
  id: idOf(model.RuleIdSchema, uuidA),
  matchField: "merchant",
  matchType: "contains",
  maxAmount: null,
  minAmount: null,
  pattern: "Demo",
  priority: 0,
  profileId: idOf(model.ProfileIdSchema, uuidB),
  ...kind,
});

const holdingWire = (state: Wire) => ({
  assetType: "etf",
  costBasis: null,
  currency: "EUR",
  id: idOf(model.HoldingIdSchema, uuidC),
  name: "Demo fund",
  openedOn: dateOnly("2024-01-01"),
  platformId: idOf(model.PlatformIdSchema, "manual"),
  profileId: idOf(model.ProfileIdSchema, uuidB),
  quantity: 1,
  symbol: "DEMO",
  lastPrice: null,
  pricedAt: null,
  ...state,
});

const unions = {
  AmountsSchema: {
    schema: model.AmountsSchema,
    members: [
      { name: "Converted", wire: convertedWire() },
      { name: "SameCurrency", wire: sameCurrencyWire() },
    ],
  },
  ArchiveStateSchema: {
    schema: model.ArchiveStateSchema,
    members: [
      { name: "Archived", wire: archivedWire() },
      { name: "Failed", wire: failedArchiveWire() },
      { name: "Reserved", wire: reservedWire() },
      { name: "Unarchived", wire: unarchivedWire() },
    ],
  },
  CategorizationSchema: {
    schema: model.CategorizationSchema,
    members: [
      { name: "Applied", wire: appliedWire() },
      { name: "Confirmed", wire: confirmedWire() },
      { name: "None", wire: noneCategorizationWire() },
      { name: "Suggested", wire: suggestedWire() },
    ],
  },
  ClassificationSchema: {
    schema: model.ClassificationSchema,
    members: [
      { name: "Excluded", wire: excludedWire() },
      { name: "Income", wire: incomeWire() },
      { name: "InternalTransfer", wire: internalTransferWire() },
      { name: "None", wire: noneClassificationWire() },
      { name: "Refund", wire: refundWire() },
      { name: "SelfTransfer", wire: selfTransferWire() },
      { name: "TaxPayment", wire: taxPaymentWire() },
    ],
  },
  RuleSchema: {
    schema: model.RuleSchema,
    members: [
      {
        name: "categorize",
        wire: ruleWire({
          kind: "categorize",
          categoryId: idOf(model.CategoryIdSchema, uuidA),
        }),
      },
      {
        name: "income_client",
        wire: ruleWire({
          kind: "income_client",
          clientPayeeId: idOf(model.PayeeIdSchema, uuidB),
        }),
      },
      {
        name: "self_transfer",
        wire: ruleWire({
          kind: "self_transfer",
          counterpartProfileId: idOf(model.ProfileIdSchema, uuidC),
        }),
      },
      {
        name: "tax_payment",
        wire: ruleWire({ kind: "tax_payment", obligationKind: "vat" }),
      },
      { name: "refund", wire: ruleWire({ kind: "refund" }) },
      {
        name: "internal_transfer",
        wire: ruleWire({ kind: "internal_transfer" }),
      },
      { name: "exclude", wire: ruleWire({ kind: "exclude" }) },
    ],
  },
  HoldingSchema: {
    schema: model.HoldingSchema,
    members: [
      { name: "PendingHolding", wire: holdingWire({ state: "pending" }) },
      {
        name: "PricedHolding",
        wire: holdingWire({
          lastPrice: { currency: "EUR", minor: 1000 },
          pricedAt: at(),
          state: "active",
        }),
      },
    ],
  },
  SubscriptionStatusSchema: {
    schema: model.SubscriptionStatusSchema,
    members: [
      { name: "Cancelled", wire: subscriptionWire("Cancelled") },
      { name: "Confirmed", wire: subscriptionWire("Confirmed") },
      { name: "Detected", wire: subscriptionWire("Detected") },
      { name: "Dismissed", wire: subscriptionWire("Dismissed") },
      { name: "NotRecurring", wire: subscriptionWire("NotRecurring") },
    ],
  },
  SyncRunStateSchema: {
    schema: model.SyncRunStateSchema,
    members: [
      { name: "Cancelled", wire: syncRunWire("Cancelled") },
      { name: "Categorizing", wire: syncRunWire("Categorizing") },
      { name: "ChunkDone", wire: syncRunWire("ChunkDone") },
      { name: "Failed", wire: syncRunWire("Failed") },
      { name: "Running", wire: syncRunWire("Running") },
      { name: "Succeeded", wire: syncRunWire("Succeeded") },
    ],
  },
  TaxObligationStatusSchema: {
    schema: model.TaxObligationStatusSchema,
    members: [
      { name: "Estimated", wire: estimatedWire() },
      { name: "Paid", wire: paidWire() },
      { name: "WrittenOff", wire: writtenOffWire() },
    ],
  },
} satisfies Readonly<Record<string, UnionCase>>;

const objectUnionMembers = (
  ast: SchemaAST.AST
): readonly SchemaAST.AST[] | undefined => {
  if (!Predicate.isTagged(ast, "Union")) {
    return undefined;
  }

  const members = ast.types;

  const objectish = members.every(
    (member) =>
      Predicate.isTagged(member, "Objects") ||
      Predicate.isTagged(member, "Declaration")
  );

  return objectish &&
    members.some((member) => Predicate.isTagged(member, "Objects"))
    ? members
    : undefined;
};

const discoveredUnions = (): readonly string[] =>
  Object.entries(model)
    .flatMap(([name, value]) =>
      Schema.isSchema(value) &&
      objectUnionMembers(Schema.toType(value).ast) !== undefined
        ? [name]
        : []
    )
    .toSorted();

const declaredKeys = (wire: Wire): readonly string[] => Object.keys(wire);

const expectStrayRejection = <T, E>(
  result: Result.Result<T, E>,
  field: string,
  label: string
): void => {
  expect(
    Result.isFailure(result),
    `${label} accepted a value carrying "${field}"`
  ).toBe(true);

  if (Result.isFailure(result)) {
    expect(
      Schema.isSchemaError(result.failure),
      `${label} rejected "${field}" without a typed SchemaError`
    ).toBe(true);

    if (Schema.isSchemaError(result.failure)) {
      expect(
        result.failure.message,
        `${label} did not name "${field}"`
      ).toContain(field);
    }
  }
};

describe("the union closure registry", () => {
  it("registers every object union the model exports", () => {
    expect(discoveredUnions()).toStrictEqual(Object.keys(unions).toSorted());
  });

  it("builds a valid value for every registered member", () => {
    for (const [name, unionCase] of Object.entries(unions)) {
      for (const member of unionCase.members) {
        expect(
          Result.isSuccess(
            Schema.decodeUnknownResult(
              unionCase.schema,
              strictParseOptions
            )(member.wire)
          ),
          `${name}.${member.name} does not decode from its own wire value`
        ).toBe(true);
      }
    }
  });

  it("draws money amounts across every currency exponent and safe-integer extreme", () => {
    const drawn = Array.from({ length: 200 }, () => moneySample());
    const currencies = new Set(drawn.map((money) => money.currency));
    const minors = new Set(drawn.map((money) => money.minor));

    expect([...currencies].toSorted()).toStrictEqual(
      [...MINOR_UNIT_CURRENCIES].toSorted()
    );

    for (const extreme of SAFE_MINOR_UNITS) {
      expect(minors.has(extreme), `money generator missed ${extreme}`).toBe(
        true
      );
    }
  });
});

const convertedOf = () =>
  Result.getOrThrow(
    Schema.decodeUnknownResult(
      model.AmountsSchema,
      strictParseOptions
    )(convertedWire())
  );

const sameCurrencyOf = () =>
  Result.getOrThrow(
    Schema.decodeUnknownResult(
      model.AmountsSchema,
      strictParseOptions
    )(sameCurrencyWire())
  );

describe("class-backed amounts stay closed", () => {
  it("refuses a same-currency amount on a converted amount", () => {
    const converted = convertedOf();

    Object.assign(converted, { amount: moneySample() });

    expectStrayRejection(
      Schema.encodeUnknownResult(
        model.AmountsSchema,
        strictParseOptions
      )(converted),
      "amount",
      "converted amount with an amount"
    );
  });

  it("refuses a conversion rate on the base amount inside a converted amount", () => {
    const converted = convertedOf();

    if (!Predicate.isTagged(converted, "Converted")) {
      throw new TypeError("the converted wire did not decode to a conversion");
    }

    Object.assign(converted.base, { rate: "0.9" });

    expectStrayRejection(
      Schema.encodeUnknownResult(
        model.AmountsSchema,
        strictParseOptions
      )(converted),
      "rate",
      "converted base with a rate"
    );
  });

  it("refuses a conversion source on the base amount inside a converted amount", () => {
    const converted = convertedOf();

    if (!Predicate.isTagged(converted, "Converted")) {
      throw new TypeError("the converted wire did not decode to a conversion");
    }

    Object.assign(converted.base, { source: moneySample() });

    expectStrayRejection(
      Schema.encodeUnknownResult(
        model.AmountsSchema,
        strictParseOptions
      )(converted),
      "source",
      "converted base with a source"
    );
  });

  it("refuses a conversion rate on a same-currency amount", () => {
    const same = sameCurrencyOf();

    Object.assign(same, { rate: "0.9" });

    expectStrayRejection(
      Schema.encodeUnknownResult(model.AmountsSchema, strictParseOptions)(same),
      "rate",
      "same-currency amount with a rate"
    );
  });
});

describe.each(Object.entries(unions))(
  "%s keeps its members closed",
  (name, unionCase) => {
    const unionKeys = [
      ...new Set(
        unionCase.members.flatMap((member) => declaredKeys(member.wire))
      ),
    ];

    for (const member of unionCase.members) {
      const own = declaredKeys(member.wire);

      it(`${member.name} refuses keys it does not declare`, () => {
        for (let index = 0; index < CASES_PER_MEMBER; index += 1) {
          const key = unknownKey(unionKeys);
          const field = valueFor(key);

          expectStrayRejection(
            Schema.decodeUnknownResult(
              unionCase.schema,
              strictParseOptions
            )({
              ...member.wire,
              [key]: field,
            }),
            key,
            `${name}.${member.name} decode`
          );

          const decoded = Result.getOrThrow(
            Schema.decodeUnknownResult(
              unionCase.schema,
              strictParseOptions
            )(member.wire)
          );

          if (!Predicate.isObject(decoded)) {
            throw new TypeError(
              `${name}.${member.name} decoded to a non-object`
            );
          }

          Object.assign(decoded, { [key]: field });

          expectStrayRejection(
            Schema.encodeUnknownResult(
              unionCase.schema,
              strictParseOptions
            )(decoded),
            key,
            `${name}.${member.name} encode`
          );
        }
      });

      it(`${member.name} refuses every sibling field`, () => {
        for (const sibling of unionCase.members) {
          if (sibling.name === member.name) {
            continue;
          }

          const extra = declaredKeys(sibling.wire).filter(
            (key) => !own.includes(key)
          );

          for (const key of extra) {
            for (let index = 0; index < CASES_PER_MEMBER; index += 1) {
              const field = valueFor(key);

              expectStrayRejection(
                Schema.decodeUnknownResult(
                  unionCase.schema,
                  strictParseOptions
                )({ ...member.wire, [key]: field }),
                key,
                `${name}.${member.name} decode against ${sibling.name}`
              );

              const decoded = Result.getOrThrow(
                Schema.decodeUnknownResult(
                  unionCase.schema,
                  strictParseOptions
                )(member.wire)
              );

              if (!Predicate.isObject(decoded)) {
                throw new TypeError(
                  `${name}.${member.name} decoded to a non-object`
                );
              }

              Object.assign(decoded, { [key]: field });

              expectStrayRejection(
                Schema.encodeUnknownResult(
                  unionCase.schema,
                  strictParseOptions
                )(decoded),
                key,
                `${name}.${member.name} encode against ${sibling.name}`
              );
            }
          }
        }
      });
    }
  }
);
