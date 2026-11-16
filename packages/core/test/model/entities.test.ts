import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Option, Schema } from "effect";

import {
  ArchiveStateSchema,
  AmountsSchema,
  ArchiveTargetSchema,
  AppSettingSchema,
  CategorySchema,
  CategorizationSchema,
  ClassificationSchema,
  ExchangeRateSchema,
  HoldingSchema,
  InvoiceDocumentSchema,
  InvoiceExceptionSchema,
  InvoiceSourceSchema,
  InvestmentPlatformSchema,
  MemberSchema,
  MerchantAliasSchema,
  PayeeSchema,
  ProfileSchema,
  ProviderAccountSchema,
  ProviderSchema,
  RateOnSameCurrency,
  ReportSchema,
  SameCurrencyAmountSchema,
  RuleSchema,
  SubscriptionSchema,
  SubscriptionStatusSchema,
  SyncRunSchema,
  SyncRunStateSchema,
  TaxObligationSchema,
  TaxObligationStatusSchema,
  TaxProfileSchema,
  TransactionSchema,
  convertedAmounts,
  sameCurrencyAmount,
  strictOptions,
} from "../../src/model/index.js";
import type { Holding } from "../../src/model/investment.js";
import {
  AliasIdSchema,
  ArchiveTargetIdSchema,
  CategoryIdSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  DocumentIdSchema,
  HoldingIdSchema,
  InvoiceSourceIdSchema,
  MemberIdSchema,
  MoneySchema,
  PayeeIdSchema,
  ProfileIdSchema,
  ProviderAccountIdSchema,
  ReportIdSchema,
  RuleIdSchema,
  SubscriptionIdSchema,
  SyncRunIdSchema,
  TaxObligationIdSchema,
  TaxProfileIdSchema,
  TimestampSchema,
  TransactionIdSchema,
} from "../../src/model/primitives.js";
import type { DateOnly } from "../../src/model/primitives.js";
import { RateSchema } from "../../src/model/rate.js";
import type { Rate } from "../../src/model/rate.js";

const at = Schema.decodeSync(TimestampSchema)(
  DateTime.makeUnsafe("2024-01-31T10:00:00Z")
);

const profileId = Schema.decodeSync(ProfileIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789ab"
);

const memberId = Schema.decodeSync(MemberIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789ac"
);

const accountId = Schema.decodeSync(ProviderAccountIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789ad"
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

const aliasId = Schema.decodeSync(AliasIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789b1"
);

const transactionId = Schema.decodeSync(TransactionIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789b2"
);

const subscriptionId = Schema.decodeSync(SubscriptionIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789b3"
);

const holdingId = Schema.decodeSync(HoldingIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789b4"
);

const syncRunId = Schema.decodeSync(SyncRunIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789b5"
);

const documentId = Schema.decodeSync(DocumentIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789b6"
);

const invoiceSourceId = Schema.decodeSync(InvoiceSourceIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789b7"
);

const archiveTargetId = Schema.decodeSync(ArchiveTargetIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789b8"
);

const taxProfileId = Schema.decodeSync(TaxProfileIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789b9"
);

const taxObligationId = Schema.decodeSync(TaxObligationIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789ba"
);

const reportId = Schema.decodeSync(ReportIdSchema)(
  "018f2b7c-1234-7abc-8def-0123456789bb"
);

const euro = (minor: number) => ({ currency: "EUR", minor });

const moneyOf = (code: string, minor: number) =>
  Schema.decodeSync(MoneySchema)({ currency: code, minor });

const currencyOf = (code: string) =>
  Schema.decodeSync(CurrencyCodeSchema)(code);

const dateOnly = (value: string): DateOnly =>
  Schema.decodeSync(DateOnlySchema)(value);

const rateOf = (value: string): Rate => Schema.decodeSync(RateSchema)(value);

const wire = <S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  value: S["Type"]
): S["Encoded"] => Schema.encodeSync(schema)(value);

const storedConversion = (minor: number, rate: string) =>
  convertedAmounts(
    moneyOf("USD", minor),
    currencyOf("EUR"),
    rateOf(rate),
    dateOnly("2024-01-30")
  );

const strictRuleDecoder = Schema.decodeUnknownSync(RuleSchema, strictOptions);

const strictTransactionDecoder = Schema.decodeUnknownSync(
  TransactionSchema,
  strictOptions
);

const transactionWire = (
  amounts: typeof AmountsSchema.Encoded
): typeof TransactionSchema.Encoded => ({
  amounts,
  categorization: wire(
    CategorizationSchema,
    CategorizationSchema.cases.None.make({})
  ),
  classification: wire(
    ClassificationSchema,
    ClassificationSchema.cases.None.make({})
  ),
  createdAt: at,
  direction: "out",
  externalId: "demo-transaction-1",
  fee: null,
  id: transactionId,
  note: "",
  occurredAt: at,
  payeeId: null,
  profileId,
  providerAccountId: accountId,
  raw: {
    description: "Example Ltd",
    merchant: "Example Ltd",
    reference: "INV-1",
  },
  status: "posted",
  valueDate: "2024-01-30",
});

const ruleFields = {
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
} as const;

const ruleWire = () =>
  ({ ...ruleFields, categoryId, kind: "categorize" }) as const;

const holdingWire = (): typeof HoldingSchema.Encoded => ({
  assetType: "etf",
  costBasis: null,
  currency: "EUR",
  id: holdingId,
  lastPrice: null,
  name: "Demo World ETF",
  openedOn: "2023-06-01",
  platformId: "demo-broker",
  pricedAt: null,
  profileId,
  quantity: 100_000_000,
  state: "pending",
  symbol: "DEMO",
});

const taxObligationWire = (): typeof TaxObligationSchema.Encoded => ({
  amount: euro(120_000),
  dueOn: "2024-05-07",
  id: taxObligationId,
  kind: "vat",
  label: "",
  periodEndsOn: "2024-03-31",
  profileId,
  status: wire(
    TaxObligationStatusSchema,
    TaxObligationStatusSchema.cases.Estimated.make({ booksStatus: "open" })
  ),
  syncedAt: at,
  taxProfileId,
});

describe("valid rows decode for every aggregate", () => {
  it("decodes one made-up row per entity", () => {
    expect(
      Schema.decodeSync(ProfileSchema)({
        baseCurrency: "EUR",
        createdAt: at,
        id: profileId,
        kind: "business",
        name: "Example Ltd",
      }).kind
    ).toBe("business");

    expect(
      Schema.decodeSync(MemberSchema)({
        createdAt: at,
        email: "demo@example.com",
        id: memberId,
        profileId,
        role: "owner",
      }).role
    ).toBe("owner");

    expect(
      Schema.decodeSync(ProviderSchema)({
        enabled: true,
        id: "wise",
        kind: "bank",
        label: "Demo Bank",
      }).kind
    ).toBe("bank");

    expect(
      Schema.decodeSync(ProviderAccountSchema)({
        createdAt: at,
        externalId: "demo-account",
        id: accountId,
        kind: "bank",
        label: "Demo Bank",
        profileId,
        providerId: "wise",
      }).externalId
    ).toBe("demo-account");

    expect(
      Schema.decodeSync(CategorySchema)({
        archivedAt: null,
        color: "accent",
        id: categoryId,
        name: "Groceries",
        parentId: null,
        profileId,
        spendingType: "personal",
      }).name
    ).toBe("Groceries");

    expect(
      Schema.decodeSync(PayeeSchema)({
        archivedAt: null,
        defaultCategoryId: null,
        id: payeeId,
        kind: "merchant",
        name: "Example Ltd",
        profileId,
      }).kind
    ).toBe("merchant");

    expect(
      Schema.decodeSync(MerchantAliasSchema)({
        aliasId,
        matchType: "contains",
        pattern: "example",
        payeeId,
        profileId,
      }).matchType
    ).toBe("contains");

    expect(Schema.decodeSync(RuleSchema)(ruleWire()).kind).toBe("categorize");

    expect(
      Schema.decodeSync(SubscriptionSchema)({
        amounts: wire(AmountsSchema, sameCurrencyAmount(moneyOf("EUR", 999))),
        categoryId: null,
        confidence: 0.9,
        frequency: "monthly",
        id: subscriptionId,
        lastChargedOn: "2024-01-01",
        nextExpectedOn: "2024-02-01",
        payeeId,
        profileId,
        status: wire(
          SubscriptionStatusSchema,
          SubscriptionStatusSchema.cases.Confirmed.make({ at })
        ),
      }).frequency
    ).toBe("monthly");

    expect(
      Schema.decodeSync(InvestmentPlatformSchema)({
        connector: "manual",
        enabled: true,
        id: "demo-broker",
        label: "Demo Broker",
      }).connector
    ).toBe("manual");

    expect(Schema.decodeSync(HoldingSchema)(holdingWire()).state).toBe(
      "pending"
    );

    expect(
      Schema.decodeSync(ExchangeRateSchema)({
        asOf: "2024-01-31",
        base: "EUR",
        fetchedAt: at,
        quote: "USD",
        rate: "1.1",
      }).rate
    ).toBe(1_100_000_000_000n);

    expect(
      Schema.decodeSync(InvoiceDocumentSchema)({
        amount: null,
        archive: wire(
          ArchiveStateSchema,
          ArchiveStateSchema.cases.Unarchived.make({})
        ),
        contentType: "application/pdf",
        documentDate: "2024-01-15",
        documentType: "invoice",
        id: documentId,
        originalFilename: "invoice.pdf",
        profileId,
        r2Key: "profile/invoice.pdf",
        sha256: "a".repeat(64),
        sizeBytes: 1024,
        source: "upload",
        sourceRef: null,
        transactionId: null,
        vendorPayeeId: null,
      }).documentType
    ).toBe("invoice");

    expect(
      Schema.decodeSync(InvoiceSourceSchema)({
        id: invoiceSourceId,
        loginHint: null,
        pattern: "Example Ltd",
        portalUrl: null,
        profileId,
        retrieval: {
          bookkeeper: false,
          email: true,
          portal: false,
          twoFactor: false,
        },
        vendorPayeeId: null,
      }).pattern
    ).toBe("Example Ltd");

    expect(
      Schema.decodeSync(ArchiveTargetSchema)({
        blocklist: ["private"],
        id: archiveTargetId,
        profileId,
        provider: "drive",
        rootRef: "demo-root",
      }).provider
    ).toBe("drive");

    expect(
      Schema.decodeSync(InvoiceExceptionSchema)({
        profileId,
        reason: "Demo invoice expected",
        recordedAt: at,
        transactionId,
      }).reason
    ).toBe("Demo invoice expected");

    expect(
      Schema.decodeSync(TaxProfileSchema)({
        id: taxProfileId,
        jurisdiction: "UK",
        primary: true,
        profileId,
        yearStart: { day: 6, month: 4 },
      }).yearStart.month
    ).toBe(4);

    expect(
      Schema.decodeSync(TaxObligationSchema)(taxObligationWire()).kind
    ).toBe("vat");

    expect(
      Schema.decodeSync(SyncRunSchema)({
        accountId,
        id: syncRunId,
        kind: "bank_sync",
        leaseExpiresAt: at,
        leaseOwner: "worker-1",
        profileId,
        state: wire(
          SyncRunStateSchema,
          SyncRunStateSchema.cases.Succeeded.make({
            at,
            counts: { imported: 1, rejected: 0, skipped: 0 },
          })
        ),
        window: { from: "2024-01-01", to: "2024-01-31" },
      }).kind
    ).toBe("bank_sync");

    expect(
      Schema.decodeSync(ReportSchema)({
        html: "<p>Demo</p>",
        id: reportId,
        kind: "report",
        profileId,
        slug: "demo-report",
        title: "Demo Report",
      }).slug
    ).toBe("demo-report");

    expect(
      Schema.decodeSync(AppSettingSchema)({
        locale: "en-GB",
        primaryProfileId: profileId,
        timezone: "Europe/London",
      }).locale
    ).toBe("en-GB");
  });
});

describe("a transaction carries one amount per currency story", () => {
  it.effect(
    "decodes a converted transaction into the converter's own output",
    () =>
      Effect.gen(function* convertedRowDecodes() {
        const stored = yield* storedConversion(1000, "0.85");

        const transaction = yield* Schema.decodeEffect(TransactionSchema)(
          transactionWire(wire(AmountsSchema, stored))
        );

        expect(transaction.amounts).toStrictEqual(stored);
        expect([stored.base.currency, stored.base.minor]).toStrictEqual([
          "EUR",
          850,
        ]);
        expect(Option.isNone(transaction.payeeId)).toBe(true);
      })
  );

  it.effect("rejects a converted base amount the rate does not produce", () =>
    Effect.gen(function* baseMustFollowTheRate() {
      const stored = yield* storedConversion(1000, "0.85");

      const tampered = Object.fromEntries([
        ...Object.entries(wire(AmountsSchema, stored)),
        ["base", euro(1)],
      ]);

      expect(() => Schema.decodeUnknownSync(AmountsSchema)(tampered)).toThrow();
    })
  );

  it.effect("rejects a converted amount whose rate is missing", () =>
    Effect.gen(function* rateIsRequired() {
      const stored = yield* storedConversion(1000, "0.85");

      const withoutRate = Object.fromEntries(
        Object.entries(wire(AmountsSchema, stored)).filter(
          ([key]) => key !== "rate"
        )
      );

      expect(() =>
        Schema.decodeUnknownSync(AmountsSchema)(withoutRate)
      ).toThrow();
    })
  );

  it("rejects a same-currency amount that also carries a base amount", () => {
    const sameCurrency = Schema.encodeSync(SameCurrencyAmountSchema)(
      SameCurrencyAmountSchema.make({ amount: moneyOf("EUR", 1000) })
    );

    const tampered = { ...sameCurrency, base: moneyOf("EUR", 1000) };

    const withBase = {
      ...transactionWire(
        wire(AmountsSchema, sameCurrencyAmount(moneyOf("EUR", 1000)))
      ),
      amounts: tampered,
    };

    expect(() =>
      Schema.decodeUnknownSync(AmountsSchema, strictOptions)(tampered)
    ).toThrow();
    expect(() => strictTransactionDecoder(withBase)).toThrow();
  });

  it("keeps one amount on a same-currency transaction", () => {
    const amount = moneyOf("EUR", 1000);

    const transaction = Schema.decodeSync(TransactionSchema)(
      transactionWire(wire(AmountsSchema, sameCurrencyAmount(amount)))
    );

    expect(transaction.amounts).toStrictEqual(sameCurrencyAmount(amount));
    expect(Object.keys(transaction.amounts).toSorted()).toStrictEqual([
      "_tag",
      "amount",
    ]);
  });

  it.effect("builds a conversion whose base the rate produces", () =>
    Effect.gen(function* constructorRoundTrips() {
      const stored = yield* storedConversion(1000, "0.85");

      expect([stored.base.currency, stored.base.minor]).toStrictEqual([
        "EUR",
        850,
      ]);
      expect(stored.source).toStrictEqual(moneyOf("USD", 1000));

      const decoded = yield* Schema.decodeEffect(TransactionSchema)(
        transactionWire(wire(AmountsSchema, stored))
      );

      expect(decoded.amounts).toStrictEqual(stored);
    })
  );

  it.effect("refuses a rate for a source already in the base currency", () =>
    Effect.gen(function* sameCurrencyRefused() {
      const failure = yield* Effect.flip(
        convertedAmounts(
          moneyOf("EUR", 1000),
          currencyOf("EUR"),
          rateOf("1"),
          dateOnly("2024-01-30")
        )
      );

      expect(failure).toStrictEqual(
        RateOnSameCurrency.of({ currency: currencyOf("EUR") })
      );
    })
  );

  it("rejects a fee in another currency than the source", () => {
    expect(() =>
      Schema.decodeSync(TransactionSchema)({
        ...transactionWire(
          wire(AmountsSchema, sameCurrencyAmount(moneyOf("EUR", 1000)))
        ),
        fee: { currency: "GBP", minor: 100 },
      })
    ).toThrow();
  });
});

describe("the categorization union forbids a confirmed row without a category", () => {
  const confirmed = Schema.encodeSync(CategorizationSchema.cases.Confirmed)(
    CategorizationSchema.cases.Confirmed.make({ at, categoryId })
  );

  it("rejects Confirmed without a categoryId", () => {
    const { categoryId: _categoryId, ...withoutCategory } = confirmed;

    expect(() =>
      Schema.decodeUnknownSync(CategorizationSchema)(withoutCategory)
    ).toThrow();
  });

  it("rejects Suggested without the model that suggested it", () => {
    const suggested = Schema.encodeSync(CategorizationSchema.cases.Suggested)(
      CategorizationSchema.cases.Suggested.make({
        at,
        categoryId,
        model: "demo-model",
      })
    );

    const { model: _model, ...withoutModel } = suggested;

    expect(() =>
      Schema.decodeUnknownSync(CategorizationSchema)(withoutModel)
    ).toThrow();
  });

  it("accepts None and Confirmed with a category", () => {
    expect(
      Schema.decodeSync(CategorizationSchema)(
        wire(CategorizationSchema, CategorizationSchema.cases.None.make({}))
      )
    ).toEqual(CategorizationSchema.cases.None.make({}));

    expect(Schema.decodeSync(CategorizationSchema)(confirmed)).toEqual(
      CategorizationSchema.cases.Confirmed.make({ at, categoryId })
    );
  });
});

describe("the rule union forbids a rule with two targets", () => {
  it("rejects a categorize rule that also names a client payee", () => {
    expect(() =>
      strictRuleDecoder({ ...ruleWire(), clientPayeeId: payeeId })
    ).toThrow();
  });

  it("rejects a tax_payment rule without an obligation kind", () => {
    const taxPaymentWithoutObligation = {
      ...ruleFields,
      kind: "tax_payment",
    };

    expect(() =>
      Schema.decodeUnknownSync(
        RuleSchema,
        strictOptions
      )(taxPaymentWithoutObligation)
    ).toThrow();
  });

  it("rejects inverted amount bounds", () => {
    expect(() =>
      strictRuleDecoder({ ...ruleWire(), maxAmount: 100, minAmount: 500 })
    ).toThrow();
  });

  it("accepts one target per kind", () => {
    expect(
      strictRuleDecoder({
        ...ruleFields,
        clientPayeeId: payeeId,
        kind: "income_client",
      })
    ).toMatchObject({ clientPayeeId: payeeId, kind: "income_client" });
  });
});

describe("other illegal states the type forbids", () => {
  it("rejects a paid tax obligation without a settling transaction", () => {
    const paid = Schema.encodeSync(TaxObligationStatusSchema.cases.Paid)(
      TaxObligationStatusSchema.cases.Paid.make({
        at,
        settledBy: transactionId,
      })
    );

    const { settledBy: _settledBy, ...withoutSettling } = paid;

    expect(() =>
      Schema.decodeUnknownSync(TaxObligationSchema)({
        ...taxObligationWire(),
        status: withoutSettling,
      })
    ).toThrow();
  });

  it("accepts a paid tax obligation that names its transaction", () => {
    expect(
      Schema.decodeSync(TaxObligationSchema)({
        ...taxObligationWire(),
        status: wire(
          TaxObligationStatusSchema,
          TaxObligationStatusSchema.cases.Paid.make({
            at,
            settledBy: transactionId,
          })
        ),
      })
    ).toMatchObject({
      status: TaxObligationStatusSchema.cases.Paid.make({
        at,
        settledBy: transactionId,
      }),
    });
  });

  it("rejects a pending holding that already has a market price", () => {
    const pending = Schema.decodeSync(HoldingSchema)(holdingWire());

    expect(pending.state).toBe("pending");

    const withPrice = {
      ...pending,
      lastPrice: Option.some(moneyOf("EUR", 500)),
    };

    // @ts-expect-error -- a pending holding can never carry a market price
    const priced: Holding = withPrice;

    expect(priced.state).toBe("pending");
    expect(() => Schema.encodeUnknownSync(HoldingSchema)(withPrice)).toThrow();
    expect(() =>
      Schema.encodeUnknownSync(HoldingSchema)({
        ...pending,
        pricedAt: Option.some(at),
      })
    ).toThrow();

    expect(() =>
      Schema.decodeSync(HoldingSchema)({
        ...holdingWire(),
        lastPrice: euro(500),
      })
    ).toThrow();

    expect(() =>
      Schema.decodeSync(HoldingSchema)({
        ...holdingWire(),
        pricedAt: at,
      })
    ).toThrow();
  });

  it("rejects a category that is its own parent", () => {
    expect(() =>
      Schema.decodeSync(CategorySchema)({
        archivedAt: null,
        color: "accent",
        id: categoryId,
        name: "Groceries",
        parentId: categoryId,
        profileId,
        spendingType: "personal",
      })
    ).toThrow();
  });

  it("rejects a sync run that succeeded without counts", () => {
    const succeeded = Schema.encodeSync(SyncRunStateSchema.cases.Succeeded)(
      SyncRunStateSchema.cases.Succeeded.make({
        at,
        counts: { imported: 1, rejected: 0, skipped: 0 },
      })
    );

    const { counts: _counts, ...withoutCounts } = succeeded;

    expect(() =>
      Schema.decodeUnknownSync(SyncRunSchema)({
        accountId,
        id: syncRunId,
        kind: "bank_sync",
        leaseExpiresAt: at,
        leaseOwner: "worker-1",
        profileId,
        state: withoutCounts,
        window: { from: "2024-01-01", to: "2024-01-31" },
      })
    ).toThrow();
  });

  it("rejects a report slug that is not a lowercase kebab name", () => {
    expect(() =>
      Schema.decodeSync(ReportSchema)({
        html: "<p>Demo</p>",
        id: reportId,
        kind: "report",
        profileId,
        slug: "Demo Report",
        title: "Demo Report",
      })
    ).toThrow();
  });

  it("rejects an archived invoice document without a file id", () => {
    const archived = Schema.encodeSync(ArchiveStateSchema.cases.Archived)(
      ArchiveStateSchema.cases.Archived.make({
        archivedAt: at,
        fileId: "demo-file",
        targetId: archiveTargetId,
      })
    );

    const { fileId: _fileId, ...withoutFile } = archived;

    expect(() =>
      Schema.decodeUnknownSync(ArchiveStateSchema)(withoutFile)
    ).toThrow();
  });
});
