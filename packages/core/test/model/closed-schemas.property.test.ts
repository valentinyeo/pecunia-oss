import { DateTime, Predicate, Result, Schema } from "effect";
import type { SchemaAST } from "effect";
import { describe, expect, it } from "vitest";

import { ConvertedAmountSchema } from "../../src/model/converted-amount.js";
import * as model from "../../src/model/index.js";

type Codec = Schema.Top & {
  readonly DecodingServices: never;
  readonly EncodingServices: never;
};

type StrayPath = readonly (string | number)[];

const CandidateSchema = Schema.Record(Schema.String, Schema.Unknown);

type Candidate = typeof CandidateSchema.Type;

type StrayValue = string | number | Candidate | typeof model.MoneySchema.Type;

const at = Schema.decodeSync(model.TimestampSchema)(
  DateTime.makeUnsafe("2024-01-31T10:00:00Z")
);

const str = (seed: number) =>
  `018f2b7c-1234-7abc-8def-${String(seed).padStart(12, "0")}`;

const moneyOf = (currency: string, minor: number) =>
  Schema.decodeSync(model.MoneySchema)({ currency, minor });

const currencyOf = (code: string) =>
  Schema.decodeSync(model.CurrencyCodeSchema)(code);

const rateOf = (text: string) => Schema.decodeSync(model.RateSchema)(text);

const dateOf = (text: string) => Schema.decodeSync(model.DateOnlySchema)(text);

const wireOf = <S extends Codec>(schema: S, value: S["Type"]): S["Encoded"] =>
  Schema.encodeSync(schema)(value);

const moneyWire = moneyOf("EUR", 1000);

const sameCurrencyWire = wireOf(
  model.SameCurrencyAmountSchema,
  model.sameCurrencyAmount(moneyWire)
);

const convertedWire = wireOf(
  ConvertedAmountSchema,
  Result.getOrThrow(
    model.ConvertedAmount.converting(
      moneyOf("USD", 1000),
      currencyOf("EUR"),
      rateOf("0.85"),
      dateOf("2024-01-30")
    )
  )
);

const categorizationWire = wireOf(
  model.CategorizationSchema,
  model.CategorizationSchema.cases.None.make({})
);

const classificationWire = wireOf(
  model.ClassificationSchema,
  model.ClassificationSchema.cases.None.make({})
);

const archiveWire = wireOf(
  model.ArchiveStateSchema,
  model.ArchiveStateSchema.cases.Unarchived.make({})
);

const subscriptionStatusWire = wireOf(
  model.SubscriptionStatusSchema,
  model.SubscriptionStatusSchema.cases.Confirmed.make({ at })
);

const taxStatusWire = wireOf(
  model.TaxObligationStatusSchema,
  model.TaxObligationStatusSchema.cases.Estimated.make({ booksStatus: "open" })
);

const syncCountsWire = { imported: 1, rejected: 0, skipped: 0 };

const syncRunStateWire = wireOf(
  model.SyncRunStateSchema,
  model.SyncRunStateSchema.cases.Succeeded.make({
    at,
    counts: syncCountsWire,
  })
);

const table = {
  MoneySchema: {
    schema: model.MoneySchema,
    wire: moneyWire,
  },
  SameCurrencyAmountSchema: {
    schema: model.SameCurrencyAmountSchema,
    wire: sameCurrencyWire,
  },
  AmountsSchema: {
    schema: model.AmountsSchema,
    wire: sameCurrencyWire,
  },
  ConvertedAmountSchema: {
    schema: ConvertedAmountSchema,
    wire: convertedWire,
  },
  ProfileSchema: {
    schema: model.ProfileSchema,
    wire: {
      baseCurrency: "EUR",
      createdAt: at,
      id: str(1),
      kind: "business",
      name: "Example Ltd",
    },
  },
  MemberSchema: {
    schema: model.MemberSchema,
    wire: {
      createdAt: at,
      email: "demo@example.com",
      id: str(2),
      profileId: str(1),
      role: "owner",
    },
  },
  ProviderSchema: {
    schema: model.ProviderSchema,
    wire: { enabled: true, id: "wise", kind: "bank", label: "Demo Bank" },
  },
  ProviderAccountSchema: {
    schema: model.ProviderAccountSchema,
    wire: {
      createdAt: at,
      externalId: "demo-account",
      id: str(3),
      kind: "bank",
      label: "Demo Bank",
      profileId: str(1),
      providerId: "wise",
    },
  },
  CategorySchema: {
    schema: model.CategorySchema,
    wire: {
      archivedAt: null,
      color: "accent",
      id: str(4),
      name: "Groceries",
      parentId: null,
      profileId: str(1),
      spendingType: "personal",
    },
  },
  PayeeSchema: {
    schema: model.PayeeSchema,
    wire: {
      archivedAt: null,
      defaultCategoryId: null,
      id: str(5),
      kind: "merchant",
      name: "Example Ltd",
      profileId: str(1),
    },
  },
  MerchantAliasSchema: {
    schema: model.MerchantAliasSchema,
    wire: {
      aliasId: str(6),
      matchType: "contains",
      pattern: "example",
      payeeId: str(5),
      profileId: str(1),
    },
  },
  RuleSchema: {
    schema: model.RuleSchema,
    wire: {
      createdAt: at,
      direction: "any",
      enabled: true,
      id: str(7),
      matchField: "merchant",
      matchType: "contains",
      maxAmount: null,
      minAmount: null,
      pattern: "Example",
      priority: 0,
      profileId: str(1),
      categoryId: str(4),
      kind: "categorize",
    },
  },
  SubscriptionStatusSchema: {
    schema: model.SubscriptionStatusSchema,
    wire: subscriptionStatusWire,
  },
  SubscriptionSchema: {
    schema: model.SubscriptionSchema,
    wire: {
      amounts: sameCurrencyWire,
      categoryId: null,
      confidence: 0.9,
      frequency: "monthly",
      id: str(8),
      lastChargedOn: "2024-01-01",
      nextExpectedOn: "2024-02-01",
      payeeId: str(5),
      profileId: str(1),
      status: subscriptionStatusWire,
    },
  },
  InvestmentPlatformSchema: {
    schema: model.InvestmentPlatformSchema,
    wire: {
      connector: "manual",
      enabled: true,
      id: "demo-broker",
      label: "Demo Broker",
    },
  },
  HoldingSchema: {
    schema: model.HoldingSchema,
    wire: {
      assetType: "etf",
      costBasis: null,
      currency: "EUR",
      id: str(9),
      lastPrice: null,
      name: "Demo World ETF",
      openedOn: "2023-06-01",
      platformId: "demo-broker",
      pricedAt: null,
      profileId: str(1),
      quantity: 100_000_000,
      state: "pending",
      symbol: "DEMO",
    },
  },
  ExchangeRateSchema: {
    schema: model.ExchangeRateSchema,
    wire: {
      asOf: "2024-01-31",
      base: "EUR",
      fetchedAt: at,
      quote: "USD",
      rate: "1.1",
    },
  },
  ArchiveStateSchema: {
    schema: model.ArchiveStateSchema,
    wire: archiveWire,
  },
  InvoiceDocumentSchema: {
    schema: model.InvoiceDocumentSchema,
    wire: {
      amount: null,
      archive: archiveWire,
      contentType: "application/pdf",
      documentDate: "2024-01-15",
      documentType: "invoice",
      id: str(10),
      originalFilename: "invoice.pdf",
      profileId: str(1),
      r2Key: "profile/invoice.pdf",
      sha256: "a".repeat(64),
      sizeBytes: 1024,
      source: "upload",
      sourceRef: null,
      transactionId: null,
      vendorPayeeId: null,
    },
  },
  InvoiceSourceSchema: {
    schema: model.InvoiceSourceSchema,
    wire: {
      id: str(11),
      loginHint: null,
      pattern: "Example Ltd",
      portalUrl: null,
      profileId: str(1),
      retrieval: {
        bookkeeper: false,
        email: true,
        portal: false,
        twoFactor: false,
      },
      vendorPayeeId: null,
    },
  },
  ArchiveTargetSchema: {
    schema: model.ArchiveTargetSchema,
    wire: {
      blocklist: ["private"],
      id: str(12),
      profileId: str(1),
      provider: "drive",
      rootRef: "demo-root",
    },
  },
  InvoiceExceptionSchema: {
    schema: model.InvoiceExceptionSchema,
    wire: {
      profileId: str(1),
      reason: "Demo invoice expected",
      recordedAt: at,
      transactionId: str(13),
    },
  },
  TaxProfileSchema: {
    schema: model.TaxProfileSchema,
    wire: {
      id: str(14),
      jurisdiction: "UK",
      primary: true,
      profileId: str(1),
      yearStart: { day: 6, month: 4 },
    },
  },
  TaxObligationStatusSchema: {
    schema: model.TaxObligationStatusSchema,
    wire: taxStatusWire,
  },
  TaxObligationSchema: {
    schema: model.TaxObligationSchema,
    wire: {
      amount: moneyOf("EUR", 120_000),
      dueOn: "2024-05-07",
      id: str(15),
      kind: "vat",
      label: "",
      periodEndsOn: "2024-03-31",
      profileId: str(1),
      status: taxStatusWire,
      syncedAt: at,
      taxProfileId: str(14),
    },
  },
  SyncCountsSchema: {
    schema: model.SyncCountsSchema,
    wire: syncCountsWire,
  },
  SyncRunStateSchema: {
    schema: model.SyncRunStateSchema,
    wire: syncRunStateWire,
  },
  SyncRunSchema: {
    schema: model.SyncRunSchema,
    wire: {
      accountId: str(3),
      id: str(16),
      kind: "bank_sync",
      leaseExpiresAt: at,
      leaseOwner: "worker-1",
      profileId: str(1),
      state: syncRunStateWire,
      window: { from: "2024-01-01", to: "2024-01-31" },
    },
  },
  ReportSchema: {
    schema: model.ReportSchema,
    wire: {
      html: "<p>Demo</p>",
      id: str(17),
      kind: "report",
      profileId: str(1),
      slug: "demo-report",
      title: "Demo Report",
    },
  },
  AppSettingSchema: {
    schema: model.AppSettingSchema,
    wire: {
      locale: "en-GB",
      primaryProfileId: str(1),
      timezone: "Europe/London",
    },
  },
  CategorizationSchema: {
    schema: model.CategorizationSchema,
    wire: categorizationWire,
  },
  ClassificationSchema: {
    schema: model.ClassificationSchema,
    wire: classificationWire,
  },
  TransactionSchema: {
    schema: model.TransactionSchema,
    wire: {
      amounts: sameCurrencyWire,
      categorization: categorizationWire,
      classification: classificationWire,
      createdAt: at,
      direction: "out",
      externalId: "demo-transaction-1",
      fee: null,
      id: str(13),
      note: "",
      occurredAt: at,
      payeeId: null,
      profileId: str(1),
      providerAccountId: str(3),
      raw: {
        description: "Example Ltd",
        merchant: "Example Ltd",
        reference: "INV-1",
      },
      status: "posted",
      valueDate: "2024-01-30",
    },
  },
};

const scalars = [
  "AliasIdSchema",
  "ArchiveTargetIdSchema",
  "AssetTypeSchema",
  "CategoryIdSchema",
  "CurrencyCodeSchema",
  "DateOnlySchema",
  "DirectionSchema",
  "DocumentIdSchema",
  "DocumentSourceSchema",
  "DocumentTypeSchema",
  "FrequencySchema",
  "HoldingIdSchema",
  "InvoiceSourceIdSchema",
  "MatchFieldSchema",
  "MatchTypeSchema",
  "MemberIdSchema",
  "MinorUnitsSchema",
  "PayeeIdSchema",
  "PayeeKindSchema",
  "PlatformIdSchema",
  "ProfileIdSchema",
  "ProfileKindSchema",
  "ProviderAccountIdSchema",
  "ProviderIdSchema",
  "ProviderKindSchema",
  "QuantitySchema",
  "RateSchema",
  "ReportIdSchema",
  "RoleSchema",
  "RuleDirectionSchema",
  "RuleIdSchema",
  "SpendingTypeSchema",
  "SubscriptionIdSchema",
  "SyncRunIdSchema",
  "SyncRunKindSchema",
  "TaxObligationIdSchema",
  "TaxProfileIdSchema",
  "TimestampSchema",
  "TransactionIdSchema",
];

const schemaNames = (): string[] =>
  Object.entries(model)
    .filter(
      ([name, value]) => name.endsWith("Schema") && Schema.isSchema(value)
    )
    .map(([name]) => name)
    .toSorted();

const SEED = 0x5f_3a_91_c7;

const rng = () => {
  let state = SEED;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
};

const unitRandom = rng();

const integer = (low: number, high: number): number =>
  low + Math.floor(unitRandom() * (high - low + 1));

const hex = (length: number): string => {
  const digits = "0123456789abcdef";
  let out = "";

  for (let index = 0; index < length; index += 1) {
    out += digits.charAt(integer(0, 15));
  }

  return out;
};

const isPlainObject = (value: unknown): value is Candidate => {
  if (!Predicate.isObject(value) || Array.isArray(value)) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

const objectPaths = (
  value: Candidate,
  path: StrayPath,
  out: StrayPath[]
): void => {
  out.push(path);

  for (const [key, child] of Object.entries(value)) {
    if (isPlainObject(child)) {
      objectPaths(
        Schema.decodeSync(CandidateSchema)(child),
        [...path, key],
        out
      );
    }
  }
};

const allPaths = (value: Candidate): StrayPath[] => {
  const paths: StrayPath[] = [];

  objectPaths(value, [], paths);

  return paths;
};

const nodeAt = (root: Candidate, path: StrayPath): Candidate | undefined => {
  let node: Candidate | undefined = root;

  for (const step of path) {
    const child: unknown = node === undefined ? undefined : node[String(step)];

    node = isPlainObject(child) ? child : undefined;
  }

  return node;
};

const nodeIn = (root: Candidate, path: StrayPath): Candidate | undefined => {
  let node: Candidate | undefined = root;

  for (const step of path) {
    if (node === undefined) {
      return undefined;
    }

    const descriptor = Object.getOwnPropertyDescriptor(node, String(step));

    const child: unknown =
      descriptor === undefined ? undefined : descriptor.value;

    node = isPlainObject(child) ? child : undefined;
  }

  return node;
};

const withStray = (
  root: Candidate,
  path: StrayPath,
  key: string,
  value: StrayValue
): Candidate => {
  const [head, ...rest] = path;

  if (head === undefined) {
    return { ...root, [key]: value };
  }

  const child = nodeAt(root, [head]);

  return child === undefined
    ? root
    : { ...root, [String(head)]: withStray(child, rest, key, value) };
};

const fieldNamesOf = (ast: SchemaAST.AST): string[] => {
  if (Predicate.isTagged(ast, "Objects")) {
    return ast.propertySignatures.flatMap((signature) =>
      Predicate.isString(signature.name) &&
      !Predicate.isTagged(signature.type, "Never")
        ? [signature.name]
        : []
    );
  }

  if (Predicate.isTagged(ast, "Union")) {
    return ast.types.flatMap(fieldNamesOf);
  }

  if (Predicate.isTagged(ast, "Declaration")) {
    return ast.typeParameters.flatMap(fieldNamesOf);
  }

  return [];
};

const foreignNames = (): string[] => {
  const names = new Set<string>(["amount", "asOf", "base", "rate", "source"]);

  for (const { schema } of Object.values(table)) {
    for (const name of fieldNamesOf(Schema.toEncoded(schema).ast)) {
      names.add(name);
    }
  }

  return [...names];
};

const strayValue = (key: string): StrayValue => {
  if (key.endsWith("Id")) {
    return str(999);
  }

  if (key === "amount" || key === "base" || key === "source") {
    return moneyOf("EUR", 1);
  }

  return integer(0, 9);
};

describe("every exported model schema rejects foreign fields", () => {
  it("registers every object schema the model exports", () => {
    const registered = Object.keys(table).toSorted();

    expect(
      schemaNames().filter((name) => !registered.includes(name))
    ).toStrictEqual([...scalars].toSorted());
    expect(
      registered.filter((name) => !schemaNames().includes(name))
    ).toStrictEqual(["ConvertedAmountSchema"]);
  });

  it("keeps the same-currency type free of conversion fields", () => {
    const amount = model.sameCurrencyAmount(moneyWire);
    const rate = rateOf("0.85");

    // @ts-expect-error -- a same-currency amount can never carry a rate
    const withRate: model.SameCurrencyAmount = { ...amount, rate };

    expect(Object.keys(withRate).toSorted()).toStrictEqual([
      "_tag",
      "amount",
      "rate",
    ]);
  });

  it("decodes a valid value for every registered schema and round-trips it", () => {
    for (const [name, { schema, wire }] of Object.entries(table)) {
      const decoded = Schema.decodeUnknownResult(schema)(wire);

      expect(Result.isSuccess(decoded), `${name} rejects its own fixture`).toBe(
        true
      );

      if (Result.isSuccess(decoded)) {
        const encoded = Schema.encodeUnknownResult(schema)(decoded.success);

        expect(
          Result.isSuccess(encoded),
          `${name} does not encode its own value`
        ).toBe(true);

        if (Result.isSuccess(encoded)) {
          expect(
            Schema.decodeUnknownResult(schema)(encoded.success),
            `${name} does not round-trip`
          ).toStrictEqual(decoded);
        }
      }
    }
  });

  it("rejects foreign fields on decode and encode, naming the field", () => {
    const foreign = foreignNames();
    let cases = 0;

    for (const [name, { schema, wire }] of Object.entries(table)) {
      const candidate = Schema.decodeUnknownSync(CandidateSchema)(wire);

      for (const path of allPaths(candidate)) {
        const node = nodeAt(candidate, path);

        if (node === undefined) {
          continue;
        }

        for (let index = 0; index < 24; index += 1) {
          const drawn = foreign[index] ?? `extra${hex(6)}`;
          const key = Object.hasOwn(node, drawn) ? `${drawn}${index}` : drawn;
          const value = strayValue(key);
          const label = `${name}${path.map((step) => `[${String(step)}]`).join("")}.${key}`;

          const decodedStray = Schema.decodeUnknownResult(schema)(
            withStray(candidate, path, key, value)
          );

          expect(
            Result.isFailure(decodedStray),
            `${label} decoded with a foreign field`
          ).toBe(true);

          if (Result.isFailure(decodedStray)) {
            expect(
              decodedStray.failure.message,
              `${label} decode message`
            ).toContain(key);
          }

          const decoded = Result.getOrThrow(
            Schema.decodeUnknownResult(schema)(wire)
          );

          const root = Predicate.isObject(decoded) ? decoded : undefined;

          const target =
            path.length === 0
              ? root
              : nodeIn(
                  Schema.decodeUnknownSync(CandidateSchema)(decoded),
                  path
                );

          if (target === undefined) {
            continue;
          }

          Object.assign(target, { [key]: value });

          const encodedStray = Schema.encodeUnknownResult(schema)(decoded);

          expect(
            Result.isFailure(encodedStray),
            `${label} encoded with a foreign field`
          ).toBe(true);

          if (Result.isFailure(encodedStray)) {
            expect(
              encodedStray.failure.message,
              `${label} encode message`
            ).toContain(key);
          }

          cases += 2;
        }
      }
    }

    expect(cases).toBeGreaterThanOrEqual(600);
  });
});
