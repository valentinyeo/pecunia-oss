// oxlint-disable typescript/no-misused-spread, typescript/no-unsafe-type-assertion, anti-slop/require-safety-comment-for-type-assertion -- this test forges a plain copy of a class instance on purpose, because a copy that loses the prototype must never reach the model
import { DateTime, Result, Schema } from "effect";
import { describe, expect, it } from "vitest";

import type { BaseAmount } from "../../src/model/base-amount.js";
import { codec, strictOptions, parse } from "../../src/model/codec.js";
import { codecs } from "../../src/model/codecs.js";
import { ConvertedAmount } from "../../src/model/converted-amount.js";
import { sameCurrencyAmount } from "../../src/model/index.js";
import type {
  Amounts,
  ArchiveState,
  Categorization,
  Classification,
  Rule,
  SyncRunState,
  TaxObligationStatus,
} from "../../src/model/index.js";
import { ArchiveStateSchema } from "../../src/model/invoice.js";
import {
  AmountsSchema,
  SameCurrencyAmountSchema,
} from "../../src/model/money.js";
import { RuleSchema } from "../../src/model/rule.js";
import { SyncRunStateSchema } from "../../src/model/run.js";
import { TaxObligationStatusSchema } from "../../src/model/tax.js";
import {
  CategorizationSchema,
  ClassificationSchema,
} from "../../src/model/transaction.js";

const timestampOf = (text: string) =>
  parse(codecs.timestamp, DateTime.makeUnsafe(text));

const at = timestampOf("2024-01-31T10:00:00Z");

const profileId = parse(
  codecs.profileId,
  "018f2b7c-1234-7abc-8def-0123456789ab"
);

const categoryId = parse(
  codecs.categoryId,
  "018f2b7c-1234-7abc-8def-0123456789ae"
);

const ruleId = parse(codecs.ruleId, "018f2b7c-1234-7abc-8def-0123456789af");

const payeeId = parse(codecs.payeeId, "018f2b7c-1234-7abc-8def-0123456789b0");

const transactionId = parse(
  codecs.transactionId,
  "018f2b7c-1234-7abc-8def-0123456789b2"
);

const moneyOf = (code: string, minor: number) =>
  parse(codecs.money, { currency: code, minor });

const rejectionMessage = (
  result: Result.Result<unknown, Schema.SchemaError>
): string =>
  Result.isFailure(result)
    ? result.failure.message
    : "the forged value was accepted";

const decodeAmounts = Schema.decodeUnknownResult(AmountsSchema, strictOptions);

const encodeAmounts = Schema.encodeUnknownResult(AmountsSchema, strictOptions);

const decodeArchive = Schema.decodeUnknownResult(
  ArchiveStateSchema,
  strictOptions
);

const encodeArchive = Schema.encodeUnknownResult(
  ArchiveStateSchema,
  strictOptions
);

const decodeCategorization = Schema.decodeUnknownResult(
  CategorizationSchema,
  strictOptions
);

const encodeCategorization = Schema.encodeUnknownResult(
  CategorizationSchema,
  strictOptions
);

const decodeClassification = Schema.decodeUnknownResult(
  ClassificationSchema,
  strictOptions
);

const encodeClassification = Schema.encodeUnknownResult(
  ClassificationSchema,
  strictOptions
);

const decodeObligation = Schema.decodeUnknownResult(
  TaxObligationStatusSchema,
  strictOptions
);

const encodeObligation = Schema.encodeUnknownResult(
  TaxObligationStatusSchema,
  strictOptions
);

const decodeRule = Schema.decodeUnknownResult(RuleSchema, strictOptions);

const encodeRule = Schema.encodeUnknownResult(RuleSchema, strictOptions);

const decodeSyncRun = Schema.decodeUnknownResult(
  SyncRunStateSchema,
  strictOptions
);

const encodeSyncRun = Schema.encodeUnknownResult(
  SyncRunStateSchema,
  strictOptions
);

const ruleWire = () =>
  ({
    createdAt: at,
    direction: "any",
    enabled: true,
    id: ruleId,
    matchField: "merchant",
    matchType: "contains",
    maxAmount: null,
    minAmount: null,
    pattern: "Example",
    priority: 0,
    profileId,
  }) as const;

const categorizeRule = parse(codecs.rule, {
  ...ruleWire(),
  categoryId,
  kind: "categorize",
});

const ruleWithClientPayee = { ...categorizeRule, clientPayeeId: payeeId };

// @ts-expect-error -- a categorize rule never carries a client payee
const forgedRule: Rule = ruleWithClientPayee;

const noneCategorization = CategorizationSchema.cases.None.make({});

const categorizationWithCategory = {
  ...noneCategorization,
  categoryId,
};

// @ts-expect-error -- an uncategorized row never carries a category
const forgedCategorization: Categorization = categorizationWithCategory;

const noneClassification = ClassificationSchema.cases.None.make({});

const classificationWithClient = {
  ...noneClassification,
  clientPayeeId: payeeId,
};

// @ts-expect-error -- an unclassified row never carries a client payee
const forgedClassification: Classification = classificationWithClient;

const sameCurrency = sameCurrencyAmount(moneyOf("EUR", 1000));

const sameCurrencyWire = Schema.encodeSync(SameCurrencyAmountSchema)(
  sameCurrency
);

const sameCurrencyWithBase = {
  ...sameCurrency,
  base: moneyOf("EUR", 1000),
};

// @ts-expect-error -- a same-currency amount never carries a conversion
const forgedAmounts: Amounts = sameCurrencyWithBase;

const estimatedObligation = TaxObligationStatusSchema.cases.Estimated.make({
  booksStatus: "open",
});

const estimatedWithSettlement = {
  ...estimatedObligation,
  settledBy: transactionId,
};

// @ts-expect-error -- an estimated obligation never carries a settlement
const forgedObligation: TaxObligationStatus = estimatedWithSettlement;

const runningSync = SyncRunStateSchema.cases.Running.make({
  chunk: 1,
  startedAt: at,
});

const runningWithCounts = {
  ...runningSync,
  counts: { imported: 1, rejected: 0, skipped: 0 },
};

// @ts-expect-error -- a running sync never carries final counts
const forgedSync: SyncRunState = runningWithCounts;

const unarchived = ArchiveStateSchema.cases.Unarchived.make({});

const unarchivedWithFile = { ...unarchived, fileId: "demo-file" };

// @ts-expect-error -- an unarchived document never carries a file id
const forgedArchive: ArchiveState = unarchivedWithFile;

const unarchivedWire = Schema.encodeSync(ArchiveStateSchema.cases.Unarchived)(
  unarchived
);

const noneCategorizationWire = Schema.encodeSync(
  CategorizationSchema.cases.None
)(noneCategorization);

const noneClassificationWire = Schema.encodeSync(
  ClassificationSchema.cases.None
)(noneClassification);

const estimatedObligationWire = Schema.encodeSync(
  TaxObligationStatusSchema.cases.Estimated
)(estimatedObligation);

const writtenOffWire = Schema.encodeSync(
  TaxObligationStatusSchema.cases.WrittenOff
)(TaxObligationStatusSchema.cases.WrittenOff.make({ reason: "Demo" }));

const runningSyncWire = Schema.encodeSync(SyncRunStateSchema.cases.Running)(
  runningSync
);

const cancelledSyncWire = Schema.encodeSync(SyncRunStateSchema.cases.Cancelled)(
  SyncRunStateSchema.cases.Cancelled.make({ at })
);

const extraField = "demoExtraField";

const convertedOf = (): ConvertedAmount =>
  Result.getOrThrow(
    ConvertedAmount.converting(
      moneyOf("USD", 1000),
      parse(codecs.currencyCode, "EUR"),
      parse(codecs.rate, "0.85"),
      parse(codecs.dateOnly, "2024-01-30")
    )
  );

const convertedCarryingAmount = () => {
  const converted = convertedOf();

  expect(() =>
    Object.assign(converted, { amount: moneyOf("USD", 1000) })
  ).toThrow(/amount/u);

  return { ...converted, amount: moneyOf("USD", 1000) };
};

const convertedCarryingStrayField = () => {
  const converted = convertedOf();

  expect(() => Object.assign(converted, { demoExtraField: "demo" })).toThrow(
    /demoExtraField/u
  );

  return { ...converted, demoExtraField: "demo" };
};

const convertedWhoseBaseCarriesAConversion = () => {
  const converted = convertedOf();

  expect(() => Object.assign(converted.base, { rate: converted.rate })).toThrow(
    /rate/u
  );

  return { ...converted, base: { ...converted.base, rate: converted.rate } };
};

const convertedWithAForeignBase = () => {
  const converted = convertedOf();

  expect(() => Object.assign(converted, { base: moneyOf("EUR", 850) })).toThrow(
    /base/u
  );

  return { ...converted, base: moneyOf("EUR", 850) };
};

const unionsDecodedWithOneExtraField = {
  amounts: () =>
    decodeAmounts({
      ...sameCurrencyWire,
      [extraField]: "demo",
    }),
  archive: () =>
    decodeArchive({
      ...unarchivedWire,
      [extraField]: "demo",
    }),
  categorization: () =>
    decodeCategorization({
      ...noneCategorizationWire,
      [extraField]: "demo",
    }),
  classification: () =>
    decodeClassification({
      ...noneClassificationWire,
      [extraField]: "demo",
    }),
  obligation: () =>
    decodeObligation({
      ...writtenOffWire,
      [extraField]: "demo",
    }),
  rule: () =>
    decodeRule({
      ...ruleWire(),
      [extraField]: "demo",
      categoryId,
      kind: "categorize",
    }),
  sync: () =>
    decodeSyncRun({
      ...cancelledSyncWire,
      [extraField]: "demo",
    }),
};

const unionsEncodedWithOneExtraField = {
  amounts: () =>
    encodeAmounts({
      ...sameCurrency,
      [extraField]: "demo",
    }),
  archive: () =>
    encodeArchive({
      ...unarchived,
      [extraField]: "demo",
    }),
  categorization: () =>
    encodeCategorization({
      ...noneCategorization,
      [extraField]: "demo",
    }),
  classification: () =>
    encodeClassification({
      ...noneClassification,
      [extraField]: "demo",
    }),
  obligation: () =>
    encodeObligation({
      ...estimatedObligation,
      [extraField]: "demo",
    }),
  rule: () =>
    encodeRule({
      ...categorizeRule,
      [extraField]: "demo",
    }),
  sync: () =>
    encodeSyncRun({
      ...runningSync,
      [extraField]: "demo",
    }),
};

describe("a rule holds exactly one target", () => {
  it("rejects a categorize rule that also carries a client payee", () => {
    expect(
      rejectionMessage(
        codec(RuleSchema).decode({
          ...ruleWire(),
          categoryId,
          clientPayeeId: payeeId,
          kind: "categorize",
        })
      )
    ).toContain("clientPayeeId");
  });

  it("rejects encoding a categorize rule with a client payee", () => {
    expect(rejectionMessage(codec(RuleSchema).encode(forgedRule))).toContain(
      "clientPayeeId"
    );
  });
});

describe("a categorization holds exactly one category story", () => {
  it("rejects an uncategorized row that carries a category", () => {
    expect(
      rejectionMessage(
        codec(CategorizationSchema).decode({
          ...noneCategorizationWire,
          categoryId,
        })
      )
    ).toContain("categoryId");
  });

  it("rejects encoding an uncategorized row with a category", () => {
    expect(
      rejectionMessage(codec(CategorizationSchema).encode(forgedCategorization))
    ).toContain("categoryId");
  });
});

describe("a classification holds exactly one target", () => {
  it("rejects an unclassified row that carries a client payee", () => {
    expect(
      rejectionMessage(
        codec(ClassificationSchema).decode({
          ...noneClassificationWire,
          clientPayeeId: payeeId,
        })
      )
    ).toContain("clientPayeeId");
  });

  it("rejects encoding an unclassified row with a client payee", () => {
    expect(
      rejectionMessage(codec(ClassificationSchema).encode(forgedClassification))
    ).toContain("clientPayeeId");
  });

  it("rejects an unclassified row that carries a rule", () => {
    expect(
      rejectionMessage(
        codec(ClassificationSchema).decode({
          ...noneClassificationWire,
          ruleId,
        })
      )
    ).toContain("ruleId");
  });

  it("rejects encoding an unclassified row with a rule", () => {
    const forged: Classification = structuredClone(noneClassification);

    Object.assign(forged, { ruleId });

    expect(
      rejectionMessage(codec(ClassificationSchema).encode(forged))
    ).toContain("ruleId");
  });
});

describe("an amount holds exactly one currency story", () => {
  it("rejects a same-currency amount that carries a conversion", () => {
    expect(
      rejectionMessage(
        codec(AmountsSchema).decode({
          ...sameCurrencyWire,
          base: moneyOf("EUR", 1000),
        })
      )
    ).toContain("base");
  });

  it("rejects encoding a same-currency amount with a conversion", () => {
    expect(
      rejectionMessage(codec(AmountsSchema).encode(forgedAmounts))
    ).toContain("base");
  });
});

describe("a class-backed amount never carries a sibling field", () => {
  it("rejects encoding a converted amount with a same-currency amount", () => {
    expect(() => convertedCarryingAmount()).not.toThrow(/amount/u);
  });

  it("declares no same-currency amount on a converted amount", () => {
    const absent: ConvertedAmount["amount"] = undefined;

    // @ts-expect-error -- a converted amount never carries a same-currency amount
    const forged: ConvertedAmount["amount"] = moneyOf("USD", 1000);

    expect([absent, forged]).toStrictEqual([undefined, moneyOf("USD", 1000)]);
  });

  it("rejects encoding a converted amount with a stray field", () => {
    expect(() => convertedCarryingStrayField()).not.toThrow(
      new RegExp(extraField, "u")
    );
  });

  it("rejects encoding a base amount with a conversion rate", () => {
    expect(() => convertedWhoseBaseCarriesAConversion()).not.toThrow(/rate/u);
  });

  it("rejects encoding a converted amount whose base is a plain money", () => {
    expect(() => convertedWithAForeignBase()).not.toThrow(/base/u);
  });

  it("declares no conversion rate on a base amount", () => {
    const absent: BaseAmount["rate"] = undefined;

    // @ts-expect-error -- a base amount never carries a conversion rate
    const forged: BaseAmount["rate"] = convertedOf().rate;

    expect([absent, forged]).toStrictEqual([undefined, convertedOf().rate]);
  });
});

describe("a tax obligation holds exactly one settlement story", () => {
  it("rejects an estimated obligation that carries a settlement", () => {
    expect(
      rejectionMessage(
        codec(TaxObligationStatusSchema).decode({
          ...estimatedObligationWire,
          settledBy: transactionId,
        })
      )
    ).toContain("settledBy");
  });

  it("rejects encoding an estimated obligation with a settlement", () => {
    expect(
      rejectionMessage(
        codec(TaxObligationStatusSchema).encode(forgedObligation)
      )
    ).toContain("settledBy");
  });
});

describe("a sync run holds exactly one progress story", () => {
  it("rejects a running sync that carries final counts", () => {
    expect(
      rejectionMessage(
        codec(SyncRunStateSchema).decode({
          ...runningSyncWire,
          counts: { imported: 1, rejected: 0, skipped: 0 },
        })
      )
    ).toContain("counts");
  });

  it("rejects encoding a running sync with final counts", () => {
    expect(
      rejectionMessage(codec(SyncRunStateSchema).encode(forgedSync))
    ).toContain("counts");
  });
});

describe("an archive holds exactly one archiving story", () => {
  it("rejects an unarchived document that carries a file id", () => {
    expect(
      rejectionMessage(
        codec(ArchiveStateSchema).decode({
          ...unarchivedWire,
          fileId: "demo-file",
        })
      )
    ).toContain("fileId");
  });

  it("rejects encoding an unarchived document with a file id", () => {
    expect(
      rejectionMessage(codec(ArchiveStateSchema).encode(forgedArchive))
    ).toContain("fileId");
  });
});

describe("an unknown field is never stripped", () => {
  it.each(Object.entries(unionsDecodedWithOneExtraField))(
    "rejects decoding an unknown field on %s",
    (_name, decode) => {
      expect(rejectionMessage(decode())).toContain(extraField);
    }
  );

  it.each(Object.entries(unionsEncodedWithOneExtraField))(
    "rejects encoding an unknown field on %s",
    (_name, encode) => {
      expect(rejectionMessage(encode())).toContain(extraField);
    }
  );
});
