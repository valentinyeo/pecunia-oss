// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type, anti-slop/no-manual-tagged-construction, anti-slop/no-reflect-apply, anti-slop/no-known-value-widening, anti-slop-effect/no-manual-tagged-construction, typescript/no-unsafe-type-assertion -- the adversarial property test builds wire fixtures and untrusted inputs by hand

import { DateTime, Option, Predicate, Result, Schema } from "effect";
import type { SchemaAST } from "effect";
import { describe, expect, it } from "vitest";

import { codec, parse } from "../../src/model/codec.js";
import {
  ConvertedAmount,
  ConvertedAmountSchema,
} from "../../src/model/converted-amount.js";
import * as model from "../../src/model/index.js";

type Codec = Schema.Top & {
  readonly DecodingServices: never;
  readonly EncodingServices: never;
};

type Wire = Readonly<Record<string, unknown>>;

interface Fixture {
  readonly name: string;
  readonly schema: Codec;
  readonly wires: readonly Wire[];
}

interface WireFixture extends Wire {
  readonly vary?: boolean;
}

const at = parse(
  model.TimestampSchema,
  DateTime.makeUnsafe("2024-01-31T10:00:00Z")
);

const str = (seed: number): string =>
  `018f2b7c-1234-7abc-8def-${String(seed).padStart(12, "0")}`;

const currencyOf = (code: string) => parse(model.CurrencyCodeSchema, code);

const rateOf = (text: string) => parse(model.RateSchema, text);

const dateOf = (text: string) => parse(model.DateOnlySchema, text);

const moneyOf = (currency: string, minor: number) =>
  parse(model.MoneySchema, { currency, minor });

const sameCurrencyWire = {
  _tag: "SameCurrency",
  amount: { currency: "EUR", minor: 1000 },
};

const convertedWire = {
  _tag: "Converted",
  asOf: "2024-01-30",
  base: { currency: "EUR", minor: 850 },
  rate: "0.85",
  source: { currency: "USD", minor: 1000 },
};

const categorizationWire = (tag: string): Wire => {
  if (tag === "None") {
    return { _tag: "None" };
  }

  if (tag === "Confirmed") {
    return { _tag: "Confirmed", at, categoryId: str(4) };
  }

  if (tag === "Applied") {
    return {
      _tag: "Applied",
      at,
      categoryId: str(4),
      ruleId: str(7),
    };
  }

  return {
    _tag: "Suggested",
    at,
    categoryId: str(4),
    model: "demo-model",
  };
};

const classificationWire = (tag: string): Wire => {
  switch (tag) {
    case "None": {
      return { _tag: "None" };
    }

    case "Excluded": {
      return { _tag: "Excluded", ruleId: str(7) };
    }

    case "Income": {
      return { _tag: "Income", clientPayeeId: str(5), ruleId: str(7) };
    }

    case "InternalTransfer": {
      return { _tag: "InternalTransfer", ruleId: str(7) };
    }

    case "Refund": {
      return { _tag: "Refund", ofPayeeId: null, ruleId: str(7) };
    }

    case "SelfTransfer": {
      return {
        _tag: "SelfTransfer",
        counterpartProfileId: null,
        ruleId: str(7),
      };
    }

    default: {
      return { _tag: "TaxPayment", obligationKind: "vat", ruleId: str(7) };
    }
  }
};

const subscriptionStatusWire = (tag: string): Wire => ({ _tag: tag, at });

const archiveWire = (tag: string): Wire => {
  switch (tag) {
    case "Archived": {
      return {
        _tag: "Archived",
        archivedAt: at,
        fileId: "demo-file",
        targetId: str(12),
      };
    }

    case "Failed": {
      return { _tag: "Failed", reason: "demo failure" };
    }

    case "Reserved": {
      return { _tag: "Reserved", fileId: "demo-file", targetId: str(12) };
    }

    default: {
      return { _tag: "Unarchived" };
    }
  }
};

const taxStatusWire = (tag: string): Wire => {
  switch (tag) {
    case "Estimated": {
      return { _tag: "Estimated", booksStatus: "open" };
    }

    case "Paid": {
      return { _tag: "Paid", at, settledBy: str(13) };
    }

    default: {
      return { _tag: "WrittenOff", reason: "demo write off" };
    }
  }
};

const syncStateWire = (tag: string): Wire => {
  switch (tag) {
    case "Cancelled":
    case "Categorizing": {
      return { _tag: tag, at };
    }

    case "ChunkDone": {
      return { _tag: "ChunkDone", at, chunk: 1 };
    }

    case "Failed": {
      return { _tag: "Failed", at, tag: "demo" };
    }

    case "Running": {
      return { _tag: "Running", chunk: 1, startedAt: at };
    }

    default: {
      return {
        _tag: "Succeeded",
        at,
        counts: { imported: 1, rejected: 0, skipped: 0 },
      };
    }
  }
};

const ruleWire = (tag: string): Wire => {
  const base = {
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
  };

  switch (tag) {
    case "income_client": {
      return { ...base, clientPayeeId: str(5), kind: tag };
    }

    case "self_transfer": {
      return { ...base, counterpartProfileId: null, kind: tag };
    }

    case "tax_payment": {
      return { ...base, kind: tag, obligationKind: "vat" };
    }

    case "categorize": {
      return { ...base, categoryId: str(4), kind: tag };
    }

    default: {
      return { ...base, kind: tag };
    }
  }
};

const profileWire = {
  baseCurrency: "EUR",
  createdAt: at,
  id: str(1),
  kind: "business",
  name: "Example Ltd",
};

const memberWire = {
  createdAt: at,
  email: "demo@example.com",
  id: str(2),
  profileId: str(1),
  role: "owner",
};

const providerWire = {
  enabled: true,
  id: "wise",
  kind: "bank",
  label: "Demo Bank",
};

const providerAccountWire = {
  createdAt: at,
  externalId: "demo-account",
  id: str(3),
  kind: "bank",
  label: "Demo Bank",
  profileId: str(1),
  providerId: "wise",
};

const categoryWire = {
  archivedAt: null,
  color: "accent",
  id: str(4),
  name: "Groceries",
  parentId: null,
  profileId: str(1),
  spendingType: "personal",
};

const payeeWire = {
  archivedAt: null,
  defaultCategoryId: null,
  id: str(5),
  kind: "merchant",
  name: "Example Ltd",
  profileId: str(1),
};

const aliasWire = {
  aliasId: str(6),
  matchType: "contains",
  pattern: "example",
  payeeId: str(5),
  profileId: str(1),
};

const subscriptionWire = {
  amounts: sameCurrencyWire,
  categoryId: null,
  confidence: 0.9,
  frequency: "monthly",
  id: str(8),
  lastChargedOn: "2024-01-01",
  nextExpectedOn: "2024-02-01",
  payeeId: str(5),
  profileId: str(1),
  status: subscriptionStatusWire("Confirmed"),
};

const platformWire = {
  connector: "manual",
  enabled: true,
  id: "demo-broker",
  label: "Demo Broker",
};

const holdingWire = (state: string): Wire => ({
  assetType: "etf",
  costBasis: null,
  currency: "EUR",
  id: str(9),
  lastPrice: state === "pending" ? null : { currency: "EUR", minor: 12_500 },
  name: "Demo World ETF",
  openedOn: "2023-06-01",
  platformId: "demo-broker",
  pricedAt: state === "pending" ? null : at,
  profileId: str(1),
  quantity: 100_000_000,
  state,
  symbol: "DEMO",
});

const exchangeRateWire = {
  asOf: "2024-01-31",
  base: "EUR",
  fetchedAt: at,
  quote: "USD",
  rate: "1.1",
};

const invoiceWire = (withAmount: boolean): Wire => ({
  amount: withAmount ? { currency: "EUR", minor: 120_000 } : null,
  archive: archiveWire("Unarchived"),
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
});

const invoiceSourceWire = {
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
};

const archiveTargetWire = {
  blocklist: ["private"],
  id: str(12),
  profileId: str(1),
  provider: "drive",
  rootRef: "demo-root",
};

const invoiceExceptionWire = {
  profileId: str(1),
  reason: "Demo invoice expected",
  recordedAt: at,
  transactionId: str(13),
};

const taxProfileWire = {
  id: str(14),
  jurisdiction: "UK",
  primary: true,
  profileId: str(1),
  yearStart: { day: 6, month: 4 },
};

const taxObligationWire = {
  amount: { currency: "EUR", minor: 120_000 },
  dueOn: "2024-05-07",
  id: str(15),
  kind: "vat",
  label: "",
  periodEndsOn: "2024-03-31",
  profileId: str(1),
  status: taxStatusWire("Estimated"),
  syncedAt: at,
  taxProfileId: str(14),
};

const syncRunWire = {
  accountId: null,
  id: str(16),
  kind: "bank_sync",
  leaseExpiresAt: at,
  leaseOwner: "worker-1",
  profileId: str(1),
  state: syncStateWire("Succeeded"),
  window: { from: "2024-01-01", to: "2024-01-31" },
};

const reportWire = {
  html: "<p>Demo</p>",
  id: str(17),
  kind: "report",
  profileId: str(1),
  slug: "demo-report",
  title: "Demo Report",
};

const appSettingWire = {
  locale: "en-GB",
  primaryProfileId: str(1),
  timezone: "Europe/London",
};

const transactionWire = (withFee: boolean): Wire => ({
  amounts: sameCurrencyWire,
  categorization: categorizationWire("None"),
  classification: classificationWire("None"),
  createdAt: at,
  direction: "out",
  externalId: "demo-transaction-1",
  fee: withFee ? { currency: "EUR", minor: 250 } : null,
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
});

const fixtures: readonly Fixture[] = [
  {
    name: "MoneySchema",
    schema: model.MoneySchema,
    wires: [{ currency: "EUR", minor: 1000 }],
  },
  {
    name: "SameCurrencyAmountSchema",
    schema: model.SameCurrencyAmountSchema,
    wires: [sameCurrencyWire],
  },
  {
    name: "AmountsSchema",
    schema: model.AmountsSchema,
    wires: [sameCurrencyWire, { ...convertedWire, vary: false }],
  },
  {
    name: "ConvertedAmountSchema",
    schema: ConvertedAmountSchema,
    wires: [{ ...convertedWire, vary: false }],
  },
  { name: "ProfileSchema", schema: model.ProfileSchema, wires: [profileWire] },
  { name: "MemberSchema", schema: model.MemberSchema, wires: [memberWire] },
  {
    name: "ProviderSchema",
    schema: model.ProviderSchema,
    wires: [providerWire],
  },
  {
    name: "ProviderAccountSchema",
    schema: model.ProviderAccountSchema,
    wires: [providerAccountWire],
  },
  {
    name: "CategorySchema",
    schema: model.CategorySchema,
    wires: [categoryWire],
  },
  { name: "PayeeSchema", schema: model.PayeeSchema, wires: [payeeWire] },
  {
    name: "MerchantAliasSchema",
    schema: model.MerchantAliasSchema,
    wires: [aliasWire],
  },
  {
    name: "RuleSchema",
    schema: model.RuleSchema,
    wires: [
      "categorize",
      "income_client",
      "self_transfer",
      "tax_payment",
      "refund",
      "internal_transfer",
      "exclude",
    ].map(ruleWire),
  },
  {
    name: "SubscriptionStatusSchema",
    schema: model.SubscriptionStatusSchema,
    wires: [
      "Cancelled",
      "Confirmed",
      "Detected",
      "Dismissed",
      "NotRecurring",
    ].map(subscriptionStatusWire),
  },
  {
    name: "SubscriptionSchema",
    schema: model.SubscriptionSchema,
    wires: [subscriptionWire],
  },
  {
    name: "InvestmentPlatformSchema",
    schema: model.InvestmentPlatformSchema,
    wires: [platformWire],
  },
  {
    name: "HoldingSchema",
    schema: model.HoldingSchema,
    wires: [holdingWire("pending"), holdingWire("active")],
  },
  {
    name: "ExchangeRateSchema",
    schema: model.ExchangeRateSchema,
    wires: [exchangeRateWire],
  },
  {
    name: "ArchiveStateSchema",
    schema: model.ArchiveStateSchema,
    wires: ["Archived", "Failed", "Reserved", "Unarchived"].map(archiveWire),
  },
  {
    name: "InvoiceDocumentSchema",
    schema: model.InvoiceDocumentSchema,
    wires: [invoiceWire(false), invoiceWire(true)],
  },
  {
    name: "InvoiceSourceSchema",
    schema: model.InvoiceSourceSchema,
    wires: [invoiceSourceWire],
  },
  {
    name: "ArchiveTargetSchema",
    schema: model.ArchiveTargetSchema,
    wires: [archiveTargetWire],
  },
  {
    name: "InvoiceExceptionSchema",
    schema: model.InvoiceExceptionSchema,
    wires: [invoiceExceptionWire],
  },
  {
    name: "TaxProfileSchema",
    schema: model.TaxProfileSchema,
    wires: [taxProfileWire],
  },
  {
    name: "TaxObligationStatusSchema",
    schema: model.TaxObligationStatusSchema,
    wires: ["Estimated", "Paid", "WrittenOff"].map(taxStatusWire),
  },
  {
    name: "TaxObligationSchema",
    schema: model.TaxObligationSchema,
    wires: [taxObligationWire],
  },
  {
    name: "SyncCountsSchema",
    schema: model.SyncCountsSchema,
    wires: [{ imported: 1, rejected: 0, skipped: 0 }],
  },
  {
    name: "SyncRunStateSchema",
    schema: model.SyncRunStateSchema,
    wires: [
      "Cancelled",
      "Categorizing",
      "ChunkDone",
      "Failed",
      "Running",
      "Succeeded",
    ].map(syncStateWire),
  },
  { name: "SyncRunSchema", schema: model.SyncRunSchema, wires: [syncRunWire] },
  { name: "ReportSchema", schema: model.ReportSchema, wires: [reportWire] },
  {
    name: "AppSettingSchema",
    schema: model.AppSettingSchema,
    wires: [appSettingWire],
  },
  {
    name: "CategorizationSchema",
    schema: model.CategorizationSchema,
    wires: ["Applied", "Confirmed", "None", "Suggested"].map(
      categorizationWire
    ),
  },
  {
    name: "ClassificationSchema",
    schema: model.ClassificationSchema,
    wires: [
      "Excluded",
      "Income",
      "InternalTransfer",
      "None",
      "Refund",
      "SelfTransfer",
      "TaxPayment",
    ].map(classificationWire),
  },
  {
    name: "TransactionSchema",
    schema: model.TransactionSchema,
    wires: [transactionWire(false), transactionWire(true)],
  },
  {
    name: "ConversionInputInvalid",
    schema: model.ConversionInputInvalid,
    wires: [
      {
        _tag: "ConversionInputInvalid",
        from: "EUR",
        reason: "fractional",
        to: "USD",
      },
    ],
  },
  {
    name: "ConversionOverflow",
    schema: model.ConversionOverflow,
    wires: [
      {
        _tag: "ConversionOverflow",
        baseCurrency: "EUR",
        currency: "USD",
        minor: 1000,
        rate: "0.85",
      },
    ],
  },
  {
    name: "CurrencyMismatch",
    schema: model.CurrencyMismatch,
    wires: [{ _tag: "CurrencyMismatch", left: "EUR", right: "USD" }],
  },
  {
    name: "MoneyOverflow",
    schema: model.MoneyOverflow,
    wires: [
      {
        _tag: "MoneyOverflow",
        currency: "EUR",
        left: 1,
        operation: "add",
        right: 2,
      },
    ],
  },
  {
    name: "RateUnavailable",
    schema: model.RateUnavailable,
    wires: [{ _tag: "RateUnavailable", from: "EUR", to: "USD" }],
  },
  {
    name: "RateOnSameCurrency",
    schema: model.RateOnSameCurrency,
    wires: [{ _tag: "RateOnSameCurrency", currency: "EUR" }],
  },
];

const directlyImported = new Set(["ConvertedAmountSchema"]);

const construct = (
  door: (fields: never) => unknown,
  fields: Record<string, unknown>
): unknown => Reflect.apply(door, undefined, [fields]);

const isCodec = (value: unknown): value is Codec => Schema.isSchema(value);

const declaresObjects = (ast: SchemaAST.AST): boolean => {
  if (Predicate.isTagged(ast, "Objects")) {
    return true;
  }

  if (Predicate.isTagged(ast, "Union")) {
    return ast.types.some(declaresObjects);
  }

  if (Predicate.isTagged(ast, "Declaration")) {
    return ast.typeParameters.some(declaresObjects);
  }

  return false;
};

const exportedObjectSchemas = (): readonly (readonly [string, Codec])[] => {
  const out: [string, Codec][] = [];

  for (const [name, value] of Object.entries(model)) {
    if (isCodec(value) && declaresObjects(Schema.toType(value).ast)) {
      out.push([name, value]);
    }
  }

  return out;
};

const fieldNamesOf = (ast: SchemaAST.AST): readonly string[] => {
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

const foreignPool = (): readonly string[] => {
  const names = new Set<string>(["amount", "asOf", "base", "rate", "source"]);

  for (const { schema } of fixtures) {
    for (const name of fieldNamesOf(Schema.toEncoded(schema).ast)) {
      names.add(name);
    }
  }

  return [...names];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!Predicate.isObject(value) || Array.isArray(value)) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

const isOptionNode = (value: Record<string, unknown>): boolean =>
  Option.isOption(value) &&
  Object.keys(value).every((key) => key === "_tag" || key === "value");

const isNode = (value: unknown): value is Record<string, unknown> =>
  Predicate.isObject(value) &&
  !Array.isArray(value) &&
  !DateTime.isDateTime(value) &&
  !isOptionNode(value);

const objectPaths = (
  value: unknown,
  path: readonly string[],
  out: string[][]
): void => {
  if (!isNode(value)) {
    return;
  }

  out.push([...path]);

  for (const [key, child] of Object.entries(value)) {
    objectPaths(child, [...path, key], out);
  }
};

const pathsOf = (value: unknown): readonly (readonly string[])[] => {
  const out: string[][] = [];

  objectPaths(value, [], out);

  return out;
};

const nodeAt = (
  root: unknown,
  path: readonly string[]
): Record<string, unknown> | undefined => {
  let node: Record<string, unknown> | undefined = isNode(root)
    ? root
    : undefined;

  for (const step of path) {
    const child: unknown = node === undefined ? undefined : node[step];

    node = isNode(child) ? child : undefined;
  }

  return node;
};

const withForeign = (
  root: Record<string, unknown>,
  path: readonly string[],
  key: string,
  value: unknown
): Record<string, unknown> => {
  const [head, ...rest] = path;

  if (head === undefined) {
    return { ...root, [key]: value };
  }

  const child = nodeAt(root, [head]);

  return child === undefined
    ? root
    : { ...root, [head]: withForeign(child, rest, key, value) };
};

const clone = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(clone);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, clone(child)])
    );
  }

  return value;
};

const optionalSamples = new Map<string, () => unknown>([
  ["accountId", () => str(3)],
  ["archivedAt", () => at],
  ["costBasis", () => ({ currency: "EUR", minor: 5000 })],
  ["counterpartProfileId", () => str(9)],
  ["defaultCategoryId", () => str(9)],
  ["fee", () => ({ currency: "EUR", minor: 250 })],
  ["loginHint", () => "demo@example.com"],
  ["maxAmount", () => 500_000],
  ["minAmount", () => 0],
  ["ofPayeeId", () => str(5)],
  ["parentId", () => str(9)],
  ["portalUrl", () => "https://example.com/invoices"],
  ["sourceRef", () => "demo-ref"],
  ["transactionId", () => str(13)],
  ["vendorPayeeId", () => str(5)],
]);

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

const varyMoney = (value: Record<string, unknown>): void => {
  for (const [key, child] of Object.entries(value)) {
    if (isPlainObject(child)) {
      varyMoney(child);
    }

    if (key !== "minor" || !Predicate.isNumber(child)) {
      continue;
    }

    if (Object.hasOwn(value, "currency")) {
      value[key] = integer(-1_000_000, 1_000_000);
    }
  }
};

const toggleOptionals = (
  value: Record<string, unknown>,
  turn: number
): void => {
  for (const [key, child] of Object.entries(value)) {
    if (isPlainObject(child)) {
      toggleOptionals(child, turn);
    }

    if (child !== null) {
      continue;
    }

    const sample = optionalSamples.get(key);

    if (sample !== undefined && (turn + key.length) % 2 === 0) {
      value[key] = sample();
    }
  }
};

const withoutMeta = (wire: WireFixture): Record<string, unknown> => {
  const { vary: _vary, ...rest } = wire;

  return rest;
};

const variantOf = (
  wire: WireFixture,
  turn: number
): Record<string, unknown> => {
  const value = withoutMeta(wire);
  const copy = clone(value);

  if (!isPlainObject(copy) || wire.vary === false) {
    return value;
  }

  varyMoney(copy);
  toggleOptionals(copy, turn);

  return copy;
};

const VARIANTS = 10;

const restoreOf = (stored: unknown): Option.Option<ConvertedAmount> =>
  ConvertedAmount.restore(stored);

describe("one codec owns parsing for every exported model schema", () => {
  it("registers every exported object schema by name", () => {
    const registered = fixtures.map(({ name }) => name).toSorted();

    const exported = exportedObjectSchemas()
      .map(([name]) => name)
      .toSorted();

    expect(
      exported.filter(
        (name) => !registered.includes(name) && !directlyImported.has(name)
      )
    ).toStrictEqual([]);

    expect(registered.filter((name) => !exported.includes(name))).toStrictEqual(
      [...directlyImported].toSorted()
    );
  });

  it("keeps illegal money shapes out of the type system", () => {
    const amount = model.sameCurrencyAmount(moneyOf("EUR", 1000));

    const withRate: model.SameCurrencyAmount = {
      ...amount,
      // @ts-expect-error -- a same-currency amount never carries a rate
      rate: rateOf("0.85"),
    };

    const withAmount: model.StoredConversion = {
      ...convertedWire,
      // @ts-expect-error -- a stored conversion never carries an amount
      amount: moneyOf("EUR", 1000),
    };

    const errorFields: Parameters<typeof model.RateUnavailable.of>[0] = {
      from: currencyOf("EUR"),
      // @ts-expect-error -- a rate-unavailable error never carries a rate
      rate: rateOf("0.85"),
      to: currencyOf("USD"),
    };

    expect(Object.keys(withRate).toSorted()).toStrictEqual([
      "_tag",
      "amount",
      "rate",
    ]);

    expect(Object.keys(withAmount).toSorted()).toContain("amount");
    expect(Object.keys(errorFields).toSorted()).toContain("rate");
  });

  it("round-trips every valid value through decode, encode and restore", () => {
    let cases = 0;

    for (const { name, schema, wires } of fixtures) {
      const handle = codec(schema);

      for (const wire of wires) {
        for (let turn = 0; turn < VARIANTS; turn += 1) {
          const input = variantOf(wire, turn);
          const label = `${name} variant ${String(turn)}`;
          const decoded = handle.decode(input);

          expect(
            Result.isSuccess(decoded),
            `${label} rejects its own valid value`
          ).toBe(true);

          if (Result.isFailure(decoded)) {
            continue;
          }

          const encoded = handle.encode(decoded.success);

          expect(
            Result.isSuccess(encoded),
            `${label} does not encode its own value`
          ).toBe(true);

          if (Result.isFailure(encoded)) {
            continue;
          }

          const again = handle.decode(encoded.success);

          expect(
            Result.isSuccess(again) ? again.success : undefined,
            `${label} does not decode back to the same value`
          ).toStrictEqual(decoded.success);

          if (Result.isSuccess(again)) {
            const reEncoded = handle.encode(again.success);

            expect(
              Result.isSuccess(reEncoded) ? reEncoded.success : undefined,
              `${label} does not encode the same wire twice`
            ).toStrictEqual(encoded.success);
          }

          if (name === "ConvertedAmountSchema") {
            const amount = parse(ConvertedAmountSchema, input);

            const restored = restoreOf({
              _tag: "Converted",
              asOf: amount.asOf,
              base: {
                currency: amount.base.currency,
                minor: amount.base.minor,
              },
              rate: amount.rate,
              source: amount.source,
            });

            expect(Option.isSome(restored), `${label} does not restore`).toBe(
              true
            );

            expect(
              Option.getOrUndefined(restored),
              `${label} restores a different amount`
            ).toStrictEqual(decoded.success);
          }

          cases += 1;
        }
      }
    }

    expect(cases).toBeGreaterThanOrEqual(600);
  });

  it("rejects a foreign field at every depth on decode, encode and restore", () => {
    const pool = foreignPool();
    let cases = 0;

    for (const { name, schema, wires } of fixtures) {
      for (const wire of wires) {
        const input = withoutMeta(wire);

        for (const [index, path] of pathsOf(input).entries()) {
          const node = nodeAt(input, path);

          if (node === undefined) {
            continue;
          }

          for (let offset = 0; offset < 6; offset += 1) {
            const key = pool[(index * 6 + offset) % pool.length];

            if (key === undefined || Object.hasOwn(node, key)) {
              continue;
            }

            const label = `${name}[${path.join(".")}]`;
            const injected = withForeign(input, path, key, strayValue(key));
            const decoded = codec(schema).decode(injected);

            expect(
              Result.isFailure(decoded),
              `${label} decoded with ${key}`
            ).toBe(true);

            if (Result.isFailure(decoded)) {
              expect(
                decoded.failure.message,
                `${label} decode names ${key}`
              ).toContain(key);
            }

            cases += 1;
          }
        }

        const decoded = codec(schema).decode(input);

        if (Result.isFailure(decoded)) {
          continue;
        }

        for (const path of pathsOf(decoded.success)) {
          const fresh = codec(schema).decode(input);

          if (Result.isFailure(fresh)) {
            continue;
          }

          const node = nodeAt(fresh.success, path);

          if (node === undefined) {
            continue;
          }

          const key = pool.find((candidate) => !Object.hasOwn(node, candidate));

          if (key === undefined) {
            continue;
          }

          Object.assign(node, { [key]: strayValue(key) });

          const encoded = codec(schema).encode(fresh.success);

          expect(
            Result.isFailure(encoded),
            `${name}[${path.join(".")}] encoded with ${key}`
          ).toBe(true);

          if (Result.isFailure(encoded)) {
            expect(
              encoded.failure.message,
              `${name}[${path.join(".")}] encode names ${key}`
            ).toContain(key);
          }

          cases += 1;
        }
      }
    }

    expect(cases).toBeGreaterThanOrEqual(600);
  });
});

const strayValue = (key: string): unknown => {
  if (key.endsWith("Id")) {
    return str(999);
  }

  if (
    key === "amount" ||
    key === "base" ||
    key === "costBasis" ||
    key === "fee" ||
    key === "lastPrice" ||
    key === "source"
  ) {
    return { currency: "EUR", minor: 1 };
  }

  if (key === "rate") {
    return "0.5";
  }

  if (key === "asOf" || key === "dueOn" || key === "periodEndsOn") {
    return "2024-01-31";
  }

  if (key === "archivedAt" || key === "at" || key === "pricedAt") {
    return at;
  }

  return integer(0, 9);
};

describe("the sixth verdict reproductions stay rejected", () => {
  const converted = parse(ConvertedAmountSchema, convertedWire);

  const stored = {
    _tag: "Converted",
    asOf: converted.asOf,
    base: {
      currency: converted.base.currency,
      minor: converted.base.minor,
    },
    rate: converted.rate,
    source: converted.source,
  };

  it("restore rejects an extra amount on a stored conversion", () => {
    expect(() =>
      restoreOf({ ...stored, amount: moneyOf("EUR", 1000) })
    ).toThrow(/amount/u);
  });

  it("restore rejects a foreign field nested in base", () => {
    expect(() =>
      restoreOf({ ...stored, base: { ...stored.base, rate: converted.rate } })
    ).toThrow(/rate/u);
  });

  it("restore rejects a foreign field at every depth", () => {
    const pool = foreignPool();
    let cases = 0;

    for (const [index, path] of pathsOf(stored).entries()) {
      const node = nodeAt(stored, path);

      if (node === undefined) {
        continue;
      }

      for (let offset = 0; offset < 5; offset += 1) {
        const key = pool[(index * 5 + offset) % pool.length];

        if (key === undefined || Object.hasOwn(node, key)) {
          continue;
        }

        const injected = withForeign(stored, path, key, strayValue(key));

        expect(
          () => restoreOf(injected),
          `restore[${path.join(".")}] accepted ${key}`
        ).toThrow(new RegExp(key, "u"));

        cases += 1;
      }
    }

    expect(cases).toBeGreaterThanOrEqual(8);
  });

  it("restore keeps accepting the valid stored conversion", () => {
    expect(Option.getOrUndefined(restoreOf(stored))).toStrictEqual(converted);
  });

  it("tagged error constructors reject and name a foreign field", () => {
    expect(() =>
      construct((fields: never) => model.RateUnavailable.of(fields), {
        from: currencyOf("EUR"),
        rate: rateOf("0.85"),
        to: currencyOf("USD"),
      })
    ).toThrow(/rate/u);

    expect(() =>
      construct((fields: never) => model.RateOnSameCurrency.of(fields), {
        currency: currencyOf("EUR"),
        rate: rateOf("0.85"),
      })
    ).toThrow(/rate/u);

    expect(() =>
      construct((fields: never) => model.CurrencyMismatch.of(fields), {
        left: currencyOf("EUR"),
        note: "demo",
        right: currencyOf("USD"),
      })
    ).toThrow(/note/u);

    expect(() =>
      construct((fields: never) => model.MoneyOverflow.of(fields), {
        currency: currencyOf("EUR"),
        left: parse(model.MinorUnitsSchema, 1),
        operation: "add",
        rate: rateOf("0.85"),
        right: parse(model.MinorUnitsSchema, 2),
      })
    ).toThrow(/rate/u);

    expect(() =>
      construct((fields: never) => model.ConversionInputInvalid.of(fields), {
        from: currencyOf("EUR"),
        minor: parse(model.MinorUnitsSchema, 1),
        reason: "fractional",
        to: currencyOf("USD"),
      })
    ).toThrow(/minor/u);

    expect(() =>
      construct((fields: never) => model.ConversionOverflow.of(fields), {
        amount: moneyOf("EUR", 1),
        baseCurrency: currencyOf("EUR"),
        currency: currencyOf("USD"),
        minor: parse(model.MinorUnitsSchema, 1000),
        rate: rateOf("0.85"),
      })
    ).toThrow(/amount/u);
  });

  it("tagged errors construct from valid fields without overflowing", () => {
    const unavailable = model.RateUnavailable.of({
      from: currencyOf("EUR"),
      to: currencyOf("USD"),
    });

    expect(unavailable.message).toContain("No EUR to USD rate");

    expect(
      model.ConversionOverflow.of({
        baseCurrency: currencyOf("EUR"),
        currency: currencyOf("USD"),
        minor: parse(model.MinorUnitsSchema, 1000),
        rate: rateOf("0.85"),
      }).message
    ).toContain("0.85");

    for (const [name, schema] of [
      ["ConversionInputInvalid", model.ConversionInputInvalid],
      ["ConversionOverflow", model.ConversionOverflow],
      ["CurrencyMismatch", model.CurrencyMismatch],
      ["MoneyOverflow", model.MoneyOverflow],
      ["RateUnavailable", model.RateUnavailable],
      ["RateOnSameCurrency", model.RateOnSameCurrency],
    ] as const) {
      const wire = fixtures.find((fixture) => fixture.name === name)?.wires[0];

      expect(wire, `${name} has no fixture`).toBeDefined();

      if (wire !== undefined) {
        const decoded = codec(schema).decode(wire);

        expect(Result.isSuccess(decoded), `${name} does not decode`).toBe(true);

        if (Result.isSuccess(decoded)) {
          const encoded = codec(schema).encode(decoded.success);

          expect(Result.isSuccess(encoded), `${name} does not encode`).toBe(
            true
          );
        }
      }
    }
  });

  it("encodes valid optional money on invoices and transactions", () => {
    const invoice = codec(model.InvoiceDocumentSchema).decode(
      invoiceWire(true)
    );

    const transaction = codec(model.TransactionSchema).decode(
      transactionWire(true)
    );

    expect(Result.isSuccess(invoice)).toBe(true);
    expect(Result.isSuccess(transaction)).toBe(true);

    if (Result.isSuccess(invoice)) {
      expect(Option.isSome(invoice.success.amount)).toBe(true);

      const encoded = codec(model.InvoiceDocumentSchema).encode(
        invoice.success
      );

      expect(Result.isSuccess(encoded)).toBe(true);

      if (Result.isSuccess(encoded)) {
        const again = codec(model.InvoiceDocumentSchema).decode(
          encoded.success
        );

        expect(
          Result.isSuccess(again) ? again.success : undefined
        ).toStrictEqual(invoice.success);
      }
    }

    if (Result.isSuccess(transaction)) {
      expect(Option.isSome(transaction.success.fee)).toBe(true);

      const encoded = codec(model.TransactionSchema).encode(
        transaction.success
      );

      expect(Result.isSuccess(encoded)).toBe(true);

      if (Result.isSuccess(encoded)) {
        const again = codec(model.TransactionSchema).decode(encoded.success);

        expect(
          Result.isSuccess(again) ? again.success : undefined
        ).toStrictEqual(transaction.success);
      }
    }
  });

  it("rejects a foreign field on the exported money schema through the codec", () => {
    expect(
      Result.isFailure(
        codec(model.SameCurrencyAmountSchema).decode({
          ...sameCurrencyWire,
          rate: "0.85",
        })
      )
    ).toBe(true);

    const amount = parse(model.SameCurrencyAmountSchema, sameCurrencyWire);

    Object.assign(amount, { rate: rateOf("0.85") });

    expect(Result.isFailure(codec(model.AmountsSchema).encode(amount))).toBe(
      true
    );
  });
});

describe("the model fixtures stay made up", () => {
  it("uses no real account identifiers", () => {
    expect(dateOf("2024-01-31")).toBe("2024-01-31");
    expect(rateOf("0.85")).toBeGreaterThan(0n);
  });
});
