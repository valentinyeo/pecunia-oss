import { DateTime, Result, Schema } from "effect";
import { describe, expect, it } from "vitest";

import type { BaseAmount } from "../../src/model/base-amount.js";
import { ConvertedAmount } from "../../src/model/converted-amount.js";
import {
  AmountsSchema,
  ArchiveStateSchema,
  CategorizationSchema,
  ClassificationSchema,
  RuleSchema,
  SameCurrencyAmountSchema,
  SyncRunStateSchema,
  TaxObligationStatusSchema,
  sameCurrencyAmount,
  strictParseOptions,
} from "../../src/model/index.js";
import type {
  Amounts,
  ArchiveState,
  Categorization,
  Classification,
  Rule,
  SyncRunState,
  TaxObligationStatus,
} from "../../src/model/index.js";
import {
  CategoryIdSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  MoneySchema,
  PayeeIdSchema,
  ProfileIdSchema,
  RuleIdSchema,
  TimestampSchema,
  TransactionIdSchema,
} from "../../src/model/primitives.js";
import { RateSchema } from "../../src/model/rate.js";

const timestampOf = (text: string) =>
  Schema.decodeSync(TimestampSchema)(DateTime.makeUnsafe(text));

const at = timestampOf("2024-01-31T10:00:00Z");

const profileId = Schema.decodeSync(ProfileIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789ab"
);

const categoryId = Schema.decodeSync(CategoryIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789ae"
);

const ruleId = Schema.decodeSync(RuleIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789af"
);

const payeeId = Schema.decodeSync(PayeeIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789b0"
);

const transactionId = Schema.decodeSync(TransactionIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789b2"
);

const moneyOf = (code: string, minor: number) =>
  Schema.decodeSync(MoneySchema)({ currency: code, minor });

const rejectionMessage = (
  result: Result.Result<unknown, Schema.SchemaError>
): string =>
  Result.isFailure(result)
    ? result.failure.message
    : "the forged value was accepted";

const decodeAmounts = Schema.decodeUnknownResult(
  AmountsSchema,
  strictParseOptions
);

const encodeAmounts = Schema.encodeUnknownResult(
  AmountsSchema,
  strictParseOptions
);

const decodeArchive = Schema.decodeUnknownResult(
  ArchiveStateSchema,
  strictParseOptions
);

const encodeArchive = Schema.encodeUnknownResult(
  ArchiveStateSchema,
  strictParseOptions
);

const decodeCategorization = Schema.decodeUnknownResult(
  CategorizationSchema,
  strictParseOptions
);

const encodeCategorization = Schema.encodeUnknownResult(
  CategorizationSchema,
  strictParseOptions
);

const decodeClassification = Schema.decodeUnknownResult(
  ClassificationSchema,
  strictParseOptions
);

const encodeClassification = Schema.encodeUnknownResult(
  ClassificationSchema,
  strictParseOptions
);

const decodeObligation = Schema.decodeUnknownResult(
  TaxObligationStatusSchema,
  strictParseOptions
);

const encodeObligation = Schema.encodeUnknownResult(
  TaxObligationStatusSchema,
  strictParseOptions
);

const decodeRule = Schema.decodeUnknownResult(RuleSchema, strictParseOptions);

const encodeRule = Schema.encodeUnknownResult(RuleSchema, strictParseOptions);

const decodeSyncRun = Schema.decodeUnknownResult(
  SyncRunStateSchema,
  strictParseOptions
);

const encodeSyncRun = Schema.encodeUnknownResult(
  SyncRunStateSchema,
  strictParseOptions
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

const categorizeRule = Schema.decodeSync(RuleSchema)({
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
      Schema.decodeSync(CurrencyCodeSchema)("EUR"),
      Schema.decodeSync(RateSchema)("0.85"),
      Schema.decodeSync(DateOnlySchema)("2024-01-30")
    )
  );

const convertedCarryingAmount = () => {
  const converted = convertedOf();
  Object.assign(converted, { amount: moneyOf("USD", 1000) });

  return converted;
};

const convertedCarryingStrayField = () => {
  const converted = convertedOf();
  Object.assign(converted, { demoExtraField: "demo" });

  return converted;
};

const convertedWhoseBaseCarriesAConversion = () => {
  const converted = convertedOf();
  Object.assign(converted.base, { rate: converted.rate });

  return converted;
};

const convertedWithAForeignBase = () => {
  const converted = convertedOf();
  Object.assign(converted, { base: moneyOf("EUR", 850) });

  return converted;
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
        Schema.decodeUnknownResult(RuleSchema)({
          ...ruleWire(),
          categoryId,
          clientPayeeId: payeeId,
          kind: "categorize",
        })
      )
    ).toContain("clientPayeeId");
  });

  it("rejects encoding a categorize rule with a client payee", () => {
    expect(
      rejectionMessage(Schema.encodeUnknownResult(RuleSchema)(forgedRule))
    ).toContain("clientPayeeId");
  });
});

describe("a categorization holds exactly one category story", () => {
  it("rejects an uncategorized row that carries a category", () => {
    expect(
      rejectionMessage(
        Schema.decodeUnknownResult(CategorizationSchema)({
          ...noneCategorizationWire,
          categoryId,
        })
      )
    ).toContain("categoryId");
  });

  it("rejects encoding an uncategorized row with a category", () => {
    expect(
      rejectionMessage(
        Schema.encodeUnknownResult(CategorizationSchema)(forgedCategorization)
      )
    ).toContain("categoryId");
  });
});

describe("a classification holds exactly one target", () => {
  it("rejects an unclassified row that carries a client payee", () => {
    expect(
      rejectionMessage(
        Schema.decodeUnknownResult(ClassificationSchema)({
          ...noneClassificationWire,
          clientPayeeId: payeeId,
        })
      )
    ).toContain("clientPayeeId");
  });

  it("rejects encoding an unclassified row with a client payee", () => {
    expect(
      rejectionMessage(
        Schema.encodeUnknownResult(ClassificationSchema)(forgedClassification)
      )
    ).toContain("clientPayeeId");
  });

  it("rejects an unclassified row that carries a rule", () => {
    expect(
      rejectionMessage(
        Schema.decodeUnknownResult(ClassificationSchema)({
          ...noneClassificationWire,
          ruleId,
        })
      )
    ).toContain("ruleId");
  });

  it("rejects encoding an unclassified row with a rule", () => {
    expect(
      rejectionMessage(
        Schema.encodeUnknownResult(ClassificationSchema)({
          ...noneClassification,
          ruleId,
        })
      )
    ).toContain("ruleId");
  });
});

describe("an amount holds exactly one currency story", () => {
  it("rejects a same-currency amount that carries a conversion", () => {
    expect(
      rejectionMessage(
        Schema.decodeUnknownResult(AmountsSchema)({
          ...sameCurrencyWire,
          base: moneyOf("EUR", 1000),
        })
      )
    ).toContain("base");
  });

  it("rejects encoding a same-currency amount with a conversion", () => {
    expect(
      rejectionMessage(Schema.encodeUnknownResult(AmountsSchema)(forgedAmounts))
    ).toContain("base");
  });
});

describe("a class-backed amount never carries a sibling field", () => {
  it("rejects encoding a converted amount with a same-currency amount", () => {
    expect(
      rejectionMessage(encodeAmounts(convertedCarryingAmount()))
    ).toContain("amount");
  });

  it("declares no same-currency amount on a converted amount", () => {
    const absent: ConvertedAmount["amount"] = undefined;

    // @ts-expect-error -- a converted amount never carries a same-currency amount
    const forged: ConvertedAmount["amount"] = moneyOf("USD", 1000);

    expect([absent, forged]).toStrictEqual([undefined, moneyOf("USD", 1000)]);
  });

  it("rejects encoding a converted amount with a stray field", () => {
    expect(
      rejectionMessage(encodeAmounts(convertedCarryingStrayField()))
    ).toContain(extraField);
  });

  it("rejects encoding a base amount with a conversion rate", () => {
    expect(
      rejectionMessage(encodeAmounts(convertedWhoseBaseCarriesAConversion()))
    ).toContain("rate");
  });

  it("rejects encoding a converted amount whose base is a plain money", () => {
    expect(
      rejectionMessage(encodeAmounts(convertedWithAForeignBase()))
    ).toContain("base");
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
        Schema.decodeUnknownResult(TaxObligationStatusSchema)({
          ...estimatedObligationWire,
          settledBy: transactionId,
        })
      )
    ).toContain("settledBy");
  });

  it("rejects encoding an estimated obligation with a settlement", () => {
    expect(
      rejectionMessage(
        Schema.encodeUnknownResult(TaxObligationStatusSchema)(forgedObligation)
      )
    ).toContain("settledBy");
  });
});

describe("a sync run holds exactly one progress story", () => {
  it("rejects a running sync that carries final counts", () => {
    expect(
      rejectionMessage(
        Schema.decodeUnknownResult(SyncRunStateSchema)({
          ...runningSyncWire,
          counts: { imported: 1, rejected: 0, skipped: 0 },
        })
      )
    ).toContain("counts");
  });

  it("rejects encoding a running sync with final counts", () => {
    expect(
      rejectionMessage(
        Schema.encodeUnknownResult(SyncRunStateSchema)(forgedSync)
      )
    ).toContain("counts");
  });
});

describe("an archive holds exactly one archiving story", () => {
  it("rejects an unarchived document that carries a file id", () => {
    expect(
      rejectionMessage(
        Schema.decodeUnknownResult(ArchiveStateSchema)({
          ...unarchivedWire,
          fileId: "demo-file",
        })
      )
    ).toContain("fileId");
  });

  it("rejects encoding an unarchived document with a file id", () => {
    expect(
      rejectionMessage(
        Schema.encodeUnknownResult(ArchiveStateSchema)(forgedArchive)
      )
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
