// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-object-parameters -- these two helpers are the strict decode boundary the rule tests call with made-up wire literals
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Option, Schema } from "effect";

import { strictOptions, parse } from "../../src/model/codec.js";
import { codecs } from "../../src/model/codecs.js";
import { rateOnSameCurrency } from "../../src/model/errors.js";
import { convertedAmounts, sameCurrencyAmount } from "../../src/model/index.js";
import { HoldingSchema } from "../../src/model/investment.js";
import type { Holding } from "../../src/model/investment.js";
import { ArchiveStateSchema } from "../../src/model/invoice.js";
import {
  AmountsSchema,
  SameCurrencyAmountSchema,
} from "../../src/model/money.js";
import type { DateOnly } from "../../src/model/primitives.js";
import type { Rate } from "../../src/model/rate.js";
import { RuleSchema } from "../../src/model/rule.js";
import { SyncRunStateSchema } from "../../src/model/run.js";
import { SubscriptionStatusSchema } from "../../src/model/subscription.js";
import type { TaxObligationSchema } from "../../src/model/tax.js";
import { TaxObligationStatusSchema } from "../../src/model/tax.js";
import {
  CategorizationSchema,
  ClassificationSchema,
  TransactionSchema,
} from "../../src/model/transaction.js";

const at = parse(codecs.timestamp, DateTime.makeUnsafe("2024-01-31T10:00:00Z"));

const profileId = parse(
  codecs.profileId,
  "018f2b7c-1234-7abc-8def-0123456789ab"
);

const memberId = parse(codecs.memberId, "018f2b7c-1234-7abc-8def-0123456789ac");

const accountId = parse(
  codecs.providerAccountId,
  "018f2b7c-1234-7abc-8def-0123456789ad"
);

const categoryId = parse(
  codecs.categoryId,
  "018f2b7c-1234-7abc-8def-0123456789ae"
);

const ruleId = parse(codecs.ruleId, "018f2b7c-1234-7abc-8def-0123456789af");

const payeeId = parse(codecs.payeeId, "018f2b7c-1234-7abc-8def-0123456789b0");

const aliasId = parse(codecs.aliasId, "018f2b7c-1234-7abc-8def-0123456789b1");

const transactionId = parse(
  codecs.transactionId,
  "018f2b7c-1234-7abc-8def-0123456789b2"
);

const subscriptionId = parse(
  codecs.subscriptionId,
  "018f2b7c-1234-7abc-8def-0123456789b3"
);

const holdingId = parse(
  codecs.holdingId,
  "018f2b7c-1234-7abc-8def-0123456789b4"
);

const syncRunId = parse(
  codecs.syncRunId,
  "018f2b7c-1234-7abc-8def-0123456789b5"
);

const documentId = parse(
  codecs.documentId,
  "018f2b7c-1234-7abc-8def-0123456789b6"
);

const invoiceSourceId = parse(
  codecs.invoiceSourceId,
  "018f2b7c-1234-7abc-8def-0123456789b7"
);

const archiveTargetId = parse(
  codecs.archiveTargetId,
  "018f2b7c-1234-7abc-8def-0123456789b8"
);

const taxProfileId = parse(
  codecs.taxProfileId,
  "018f2b7c-1234-7abc-8def-0123456789b9"
);

const taxObligationId = parse(
  codecs.taxObligationId,
  "018f2b7c-1234-7abc-8def-0123456789ba"
);

const reportId = parse(codecs.reportId, "018f2b7c-1234-7abc-8def-0123456789bb");

const euro = (minor: number) => ({ currency: "EUR", minor });

const moneyOf = (code: string, minor: number) =>
  parse(codecs.money, { currency: code, minor });

const currencyOf = (code: string) => parse(codecs.currencyCode, code);

const dateOnly = (value: string): DateOnly => parse(codecs.dateOnly, value);

const rateOf = (value: string): Rate => parse(codecs.rate, value);

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

const strictRuleDecoder = (input: object) => parse(codecs.rule, input);

const strictTransactionDecoder = (input: object) =>
  parse(codecs.transaction, input);

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
      parse(codecs.profile, {
        baseCurrency: "EUR",
        createdAt: at,
        id: profileId,
        kind: "business",
        name: "Example Ltd",
      }).kind
    ).toBe("business");

    expect(
      parse(codecs.member, {
        createdAt: at,
        email: "demo@example.com",
        id: memberId,
        profileId,
        role: "owner",
      }).role
    ).toBe("owner");

    expect(
      parse(codecs.provider, {
        enabled: true,
        id: "wise",
        kind: "bank",
        label: "Demo Bank",
      }).kind
    ).toBe("bank");

    expect(
      parse(codecs.providerAccount, {
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
      parse(codecs.category, {
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
      parse(codecs.payee, {
        archivedAt: null,
        defaultCategoryId: null,
        id: payeeId,
        kind: "merchant",
        name: "Example Ltd",
        profileId,
      }).kind
    ).toBe("merchant");

    expect(
      parse(codecs.merchantAlias, {
        aliasId,
        matchType: "contains",
        pattern: "example",
        payeeId,
        profileId,
      }).matchType
    ).toBe("contains");

    expect(parse(codecs.rule, ruleWire()).kind).toBe("categorize");

    expect(
      parse(codecs.subscription, {
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
      parse(codecs.investmentPlatform, {
        connector: "manual",
        enabled: true,
        id: "demo-broker",
        label: "Demo Broker",
      }).connector
    ).toBe("manual");

    expect(parse(codecs.holding, holdingWire()).state).toBe("pending");

    expect(
      parse(codecs.exchangeRate, {
        asOf: "2024-01-31",
        base: "EUR",
        fetchedAt: at,
        quote: "USD",
        rate: "1.1",
      }).rate
    ).toBe(1_100_000_000_000n);

    expect(
      parse(codecs.invoiceDocument, {
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
      parse(codecs.invoiceSource, {
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
      parse(codecs.archiveTarget, {
        blocklist: ["private"],
        id: archiveTargetId,
        profileId,
        provider: "drive",
        rootRef: "demo-root",
      }).provider
    ).toBe("drive");

    expect(
      parse(codecs.invoiceException, {
        profileId,
        reason: "Demo invoice expected",
        recordedAt: at,
        transactionId,
      }).reason
    ).toBe("Demo invoice expected");

    expect(
      parse(codecs.taxProfile, {
        id: taxProfileId,
        jurisdiction: "UK",
        primary: true,
        profileId,
        yearStart: { day: 6, month: 4 },
      }).yearStart.month
    ).toBe(4);

    expect(parse(codecs.taxObligation, taxObligationWire()).kind).toBe("vat");

    expect(
      parse(codecs.syncRun, {
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
      parse(codecs.report, {
        html: "<p>Demo</p>",
        id: reportId,
        kind: "report",
        profileId,
        slug: "demo-report",
        title: "Demo Report",
      }).slug
    ).toBe("demo-report");

    expect(
      parse(codecs.appSetting, {
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

      expect(() => parse(codecs.amounts, tampered)).toThrow();
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

      expect(() => parse(codecs.amounts, withoutRate)).toThrow();
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

    expect(() => parse(codecs.amounts, tampered)).toThrow();
    expect(() => strictTransactionDecoder(withBase)).toThrow();
  });

  it("keeps one amount on a same-currency transaction", () => {
    const amount = moneyOf("EUR", 1000);

    const transaction = parse(
      codecs.transaction,
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
        rateOnSameCurrency({ currency: currencyOf("EUR") })
      );
    })
  );

  it("rejects a fee in another currency than the source", () => {
    expect(() =>
      parse(codecs.transaction, {
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

    expect(() => parse(codecs.categorization, withoutCategory)).toThrow();
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

    expect(() => parse(codecs.categorization, withoutModel)).toThrow();
  });

  it("accepts None and Confirmed with a category", () => {
    expect(
      parse(
        codecs.categorization,
        wire(CategorizationSchema, CategorizationSchema.cases.None.make({}))
      )
    ).toEqual(CategorizationSchema.cases.None.make({}));

    expect(parse(codecs.categorization, confirmed)).toEqual(
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
      parse(codecs.taxObligation, {
        ...taxObligationWire(),
        status: withoutSettling,
      })
    ).toThrow();
  });

  it("accepts a paid tax obligation that names its transaction", () => {
    expect(
      parse(codecs.taxObligation, {
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
    const pending = parse(codecs.holding, holdingWire());

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
      parse(codecs.holding, {
        ...holdingWire(),
        lastPrice: euro(500),
      })
    ).toThrow();

    expect(() =>
      parse(codecs.holding, {
        ...holdingWire(),
        pricedAt: at,
      })
    ).toThrow();
  });

  it("rejects a category that is its own parent", () => {
    expect(() =>
      parse(codecs.category, {
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
      parse(codecs.syncRun, {
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
      parse(codecs.report, {
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

    expect(() => parse(codecs.archiveState, withoutFile)).toThrow();
  });
});
