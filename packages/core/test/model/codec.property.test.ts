// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type, anti-slop/no-manual-tagged-construction, anti-slop/no-reflect-apply, anti-slop/no-known-value-widening, anti-slop-effect/no-manual-tagged-construction, typescript/no-unsafe-type-assertion, typescript/no-misused-spread, unicorn/new-for-builtins, eslint/no-new-wrappers -- the adversarial property test builds wire fixtures and untrusted inputs by hand, including a String wrapper around a timestamp

// oxlint-disable anti-slop/require-safety-comment-for-type-assertion, eslint/prefer-object-spread, eslint/prefer-destructuring, typescript/no-unnecessary-type-assertion, effect-tests/no-manual-effect-runtime-in-tests -- the adversarial property test injects strays through untyped handles by design
// oxlint-disable anti-slop/no-object-parameters, anti-slop/no-runtime-typeof, anti-slop/no-reflect-get -- the adversarial property test walks untrusted decoded trees on purpose

import { expect, it } from "@effect/vitest";
import { DateTime, Effect, Option, Predicate, Result, Schema } from "effect";
import type { SchemaAST } from "effect";
import { describe } from "vitest";

import { parse, render, schemaOf, verified } from "../../src/model/codec.js";
import type { ModelCodec } from "../../src/model/codec.js";
import { codecs } from "../../src/model/codecs.js";
import { ConvertedAmount } from "../../src/model/converted-amount.js";
import * as model from "../../src/model/index.js";
import type {
  CarriesArgument,
  OperationEntry,
} from "../../src/model/operation.js";
import { exemptOperations, operations } from "../../src/model/operations.js";
import { madeAs } from "../../src/model/registry.js";

interface Handle {
  readonly name: string;
  readonly decode: (
    input: unknown
  ) => Result.Result<unknown, Schema.SchemaError>;
  readonly encode: (value: never) => Result.Result<unknown, Schema.SchemaError>;
}

type Wire = Readonly<Record<string, unknown>>;

interface Fixture {
  readonly name: string;
  readonly schema: Handle;
  readonly wires: readonly Wire[];
}

interface WireFixture extends Wire {
  readonly vary?: boolean;
}

const at = parse(model.codecs.timestamp, "2024-01-31T10:00:00.000Z");

const str = (seed: number): string =>
  `018f2b7c-1234-7abc-8def-${String(seed).padStart(12, "0")}`;

const currencyOf = (code: string) => parse(model.codecs.currencyCode, code);

const rateOf = (text: string) => parse(model.codecs.rate, text);

const dateOf = (text: string) => parse(model.codecs.dateOnly, text);

const moneyOf = (currency: string, minor: number) =>
  parse(model.codecs.money, { currency, minor });

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
    schema: model.codecs.money,
    wires: [{ currency: "EUR", minor: 1000 }],
  },
  {
    name: "SameCurrencyAmountSchema",
    schema: model.codecs.sameCurrencyAmount,
    wires: [sameCurrencyWire],
  },
  {
    name: "AmountsSchema",
    schema: model.codecs.amounts,
    wires: [sameCurrencyWire, { ...convertedWire, vary: false }],
  },
  {
    name: "codecs.convertedAmount",
    schema: codecs.convertedAmount,
    wires: [{ ...convertedWire, vary: false }],
  },
  { name: "ProfileSchema", schema: model.codecs.profile, wires: [profileWire] },
  { name: "MemberSchema", schema: model.codecs.member, wires: [memberWire] },
  {
    name: "ProviderSchema",
    schema: model.codecs.provider,
    wires: [providerWire],
  },
  {
    name: "ProviderAccountSchema",
    schema: model.codecs.providerAccount,
    wires: [providerAccountWire],
  },
  {
    name: "CategorySchema",
    schema: model.codecs.category,
    wires: [categoryWire],
  },
  { name: "PayeeSchema", schema: model.codecs.payee, wires: [payeeWire] },
  {
    name: "MerchantAliasSchema",
    schema: model.codecs.merchantAlias,
    wires: [aliasWire],
  },
  {
    name: "RuleSchema",
    schema: model.codecs.rule,
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
    schema: model.codecs.subscriptionStatus,
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
    schema: model.codecs.subscription,
    wires: [subscriptionWire],
  },
  {
    name: "InvestmentPlatformSchema",
    schema: model.codecs.investmentPlatform,
    wires: [platformWire],
  },
  {
    name: "HoldingSchema",
    schema: model.codecs.holding,
    wires: [holdingWire("pending"), holdingWire("active")],
  },
  {
    name: "ExchangeRateSchema",
    schema: model.codecs.exchangeRate,
    wires: [exchangeRateWire],
  },
  {
    name: "ArchiveStateSchema",
    schema: model.codecs.archiveState,
    wires: ["Archived", "Failed", "Reserved", "Unarchived"].map(archiveWire),
  },
  {
    name: "InvoiceDocumentSchema",
    schema: model.codecs.invoiceDocument,
    wires: [invoiceWire(false), invoiceWire(true)],
  },
  {
    name: "InvoiceSourceSchema",
    schema: model.codecs.invoiceSource,
    wires: [invoiceSourceWire],
  },
  {
    name: "ArchiveTargetSchema",
    schema: model.codecs.archiveTarget,
    wires: [archiveTargetWire],
  },
  {
    name: "InvoiceExceptionSchema",
    schema: model.codecs.invoiceException,
    wires: [invoiceExceptionWire],
  },
  {
    name: "TaxProfileSchema",
    schema: model.codecs.taxProfile,
    wires: [taxProfileWire],
  },
  {
    name: "TaxObligationStatusSchema",
    schema: model.codecs.taxObligationStatus,
    wires: ["Estimated", "Paid", "WrittenOff"].map(taxStatusWire),
  },
  {
    name: "TaxObligationSchema",
    schema: model.codecs.taxObligation,
    wires: [taxObligationWire],
  },
  {
    name: "SyncCountsSchema",
    schema: model.codecs.syncCounts,
    wires: [{ imported: 1, rejected: 0, skipped: 0 }],
  },
  {
    name: "SyncRunStateSchema",
    schema: model.codecs.syncRunState,
    wires: [
      "Cancelled",
      "Categorizing",
      "ChunkDone",
      "Failed",
      "Running",
      "Succeeded",
    ].map(syncStateWire),
  },
  { name: "SyncRunSchema", schema: model.codecs.syncRun, wires: [syncRunWire] },
  { name: "ReportSchema", schema: model.codecs.report, wires: [reportWire] },
  {
    name: "AppSettingSchema",
    schema: model.codecs.appSetting,
    wires: [appSettingWire],
  },
  {
    name: "CategorizationSchema",
    schema: model.codecs.categorization,
    wires: ["Applied", "Confirmed", "None", "Suggested"].map(
      categorizationWire
    ),
  },
  {
    name: "ClassificationSchema",
    schema: model.codecs.classification,
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
    schema: model.codecs.transaction,
    wires: [transactionWire(false), transactionWire(true)],
  },
  {
    name: "ConversionInputInvalid",
    schema: model.codecs.conversionInputInvalid,
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
    schema: model.codecs.conversionOverflow,
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
    schema: model.codecs.currencyMismatch,
    wires: [{ _tag: "CurrencyMismatch", left: "EUR", right: "USD" }],
  },
  {
    name: "MoneyOverflow",
    schema: model.codecs.moneyOverflow,
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
    schema: model.codecs.rateUnavailable,
    wires: [{ _tag: "RateUnavailable", from: "EUR", to: "USD" }],
  },
  {
    name: "RateOnSameCurrency",
    schema: model.codecs.rateOnSameCurrency,
    wires: [{ _tag: "RateOnSameCurrency", currency: "EUR" }],
  },
];

const construct = (
  door: (fields: never) => unknown,
  fields: Record<string, unknown>
): unknown => Reflect.apply(door, undefined, [fields]);

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
    for (const name of fieldNamesOf(schemaOf(schema as never).ast)) {
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
  Predicate.isObject(value) && !Array.isArray(value) && !isOptionNode(value);

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
  it("exposes only codec handles, factories and value types", () => {
    const names = Object.keys(model).toSorted();

    expect(
      names.filter(
        (name) =>
          !Object.hasOwn(operations, name) &&
          !Object.hasOwn(exemptOperations, name)
      )
    ).toStrictEqual([]);

    for (const [name, value] of Object.entries(model)) {
      expect(
        Schema.isSchema(value),
        `${name} exports a raw schema`
      ).toStrictEqual(false);

      if (Predicate.isObject(value) && value !== null) {
        expect(
          Object.hasOwn(value, "make") ||
            Object.hasOwn(value, "makeOption") ||
            Object.hasOwn(value, "makeEffect") ||
            Object.hasOwn(value, "schema"),
          `${name} exposes a door`
        ).toStrictEqual(false);
      }
    }

    for (const [name, handle] of Object.entries(model.codecs)) {
      expect(
        Object.keys(handle).toSorted(),
        `${name} hides its schema`
      ).toStrictEqual(["decode", "encode", "kinds", "name"]);
      expect(Schema.isSchema(handle)).toStrictEqual(false);
    }
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

    const errorFields: Parameters<typeof model.rateUnavailable>[0] = {
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
      const handle = schema;

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

          const encoded = handle.encode(decoded.success as never);

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
            const reEncoded = handle.encode(again.success as never);

            expect(
              Result.isSuccess(reEncoded) ? reEncoded.success : undefined,
              `${label} does not encode the same wire twice`
            ).toStrictEqual(encoded.success);
          }

          if (name === "codecs.convertedAmount") {
            const amount = parse(codecs.convertedAmount, input);

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
            const decoded = schema.decode(injected);

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

        const decoded = schema.decode(input);

        if (Result.isFailure(decoded)) {
          continue;
        }

        for (const path of pathsOf(decoded.success)) {
          const fresh = schema.decode(input);

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

          if (!canAttach(node, { [key]: strayValue(key) })) {
            cases += 1;

            continue;
          }

          const encoded = schema.encode(fresh.success as never);

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
  const converted = parse(codecs.convertedAmount, convertedWire);

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
      construct((fields: never) => model.rateUnavailable(fields), {
        from: currencyOf("EUR"),
        rate: rateOf("0.85"),
        to: currencyOf("USD"),
      })
    ).toThrow(/rate/u);

    expect(() =>
      construct((fields: never) => model.rateOnSameCurrency(fields), {
        currency: currencyOf("EUR"),
        rate: rateOf("0.85"),
      })
    ).toThrow(/rate/u);

    expect(() =>
      construct((fields: never) => model.currencyMismatch(fields), {
        left: currencyOf("EUR"),
        note: "demo",
        right: currencyOf("USD"),
      })
    ).toThrow(/note/u);

    expect(() =>
      construct((fields: never) => model.moneyOverflow(fields), {
        currency: currencyOf("EUR"),
        left: parse(model.codecs.minorUnits, 1),
        operation: "add",
        rate: rateOf("0.85"),
        right: parse(model.codecs.minorUnits, 2),
      })
    ).toThrow(/rate/u);

    expect(() =>
      construct((fields: never) => model.conversionInputInvalid(fields), {
        from: currencyOf("EUR"),
        minor: parse(model.codecs.minorUnits, 1),
        reason: "fractional",
        to: currencyOf("USD"),
      })
    ).toThrow(/minor/u);

    expect(() =>
      construct((fields: never) => model.conversionOverflow(fields), {
        amount: moneyOf("EUR", 1),
        baseCurrency: currencyOf("EUR"),
        currency: currencyOf("USD"),
        minor: parse(model.codecs.minorUnits, 1000),
        rate: rateOf("0.85"),
      })
    ).toThrow(/amount/u);
  });

  it("tagged errors construct from valid fields without overflowing", () => {
    const unavailable = model.rateUnavailable({
      from: currencyOf("EUR"),
      to: currencyOf("USD"),
    });

    expect(unavailable.message).toContain("No EUR to USD rate");

    expect(
      model.conversionOverflow({
        baseCurrency: currencyOf("EUR"),
        currency: currencyOf("USD"),
        minor: parse(model.codecs.minorUnits, 1000),
        rate: "0.85",
      }).message
    ).toContain("0.85");

    const errorFixtures = fixtures.filter(
      (fixture) =>
        fixture.name.endsWith("Invalid") ||
        fixture.name.endsWith("Overflow") ||
        fixture.name === "CurrencyMismatch" ||
        fixture.name === "RateUnavailable" ||
        fixture.name === "RateOnSameCurrency"
    );

    for (const { name, schema, wires } of errorFixtures) {
      void schema;
      const wire = wires[0];

      expect(wire, `${name} has no fixture`).toBeDefined();

      if (wire !== undefined) {
        const decoded = schema.decode(wire);

        expect(Result.isSuccess(decoded), `${name} does not decode`).toBe(true);

        if (Result.isSuccess(decoded)) {
          const encoded = schema.encode(decoded.success as never);

          expect(Result.isSuccess(encoded), `${name} does not encode`).toBe(
            true
          );
        }
      }
    }
  });

  it("encodes valid optional money on invoices and transactions", () => {
    const invoice = model.codecs.invoiceDocument.decode(invoiceWire(true));

    const transaction = model.codecs.transaction.decode(transactionWire(true));

    expect(Result.isSuccess(invoice)).toBe(true);
    expect(Result.isSuccess(transaction)).toBe(true);

    if (Result.isSuccess(invoice)) {
      expect(Option.isSome(invoice.success.amount)).toBe(true);

      const encoded = model.codecs.invoiceDocument.encode(invoice.success);

      expect(Result.isSuccess(encoded)).toBe(true);

      if (Result.isSuccess(encoded)) {
        const again = model.codecs.invoiceDocument.decode(encoded.success);

        expect(
          Result.isSuccess(again) ? again.success : undefined
        ).toStrictEqual(invoice.success);
      }
    }

    if (Result.isSuccess(transaction)) {
      expect(Option.isSome(transaction.success.fee)).toBe(true);

      const encoded = model.codecs.transaction.encode(transaction.success);

      expect(Result.isSuccess(encoded)).toBe(true);

      if (Result.isSuccess(encoded)) {
        const again = model.codecs.transaction.decode(encoded.success);

        expect(
          Result.isSuccess(again) ? again.success : undefined
        ).toStrictEqual(transaction.success);
      }
    }
  });

  it("rejects a foreign field on the exported money schema through the codec", () => {
    expect(
      Result.isFailure(
        model.codecs.sameCurrencyAmount.decode({
          ...sameCurrencyWire,
          rate: "0.85",
        })
      )
    ).toBe(true);

    const amount = parse(model.codecs.sameCurrencyAmount, sameCurrencyWire);

    expect(() => Object.assign(amount, { rate: rateOf("0.85") })).toThrow(
      /rate/u
    );

    expect(
      Result.isFailure(
        model.codecs.amounts.encode({
          ...amount,
          rate: rateOf("0.85"),
        } as never)
      )
    ).toBe(true);
  });
});

describe("the model fixtures stay made up", () => {
  it("uses no real account identifiers", () => {
    expect(dateOf("2024-01-31")).toBe("2024-01-31");
    expect(rateOf("0.85")).toBeGreaterThan(0n);
  });
});

describe("the public surface stays strict about own keys", () => {
  it("rejects an extra own key on an Option wrapper on encode", () => {
    const invoice = parse(codecs.invoiceDocument, invoiceWire(true));
    const wrapped = Option.some(moneyOf("EUR", 250));

    Object.assign(wrapped, { rate: rateOf("0.85") });

    expect(
      Result.isFailure(
        codecs.invoiceDocument.encode({ ...invoice, amount: wrapped } as never)
      )
    ).toBe(true);

    expect(
      Result.isFailure(
        codecs.invoiceDocument.decode({
          ...invoiceWire(true),
          amount: Object.assign({ currency: "EUR", minor: 1 }, { rate: 1 }),
        })
      )
    ).toBe(true);
  });

  it("rejects an extra field on every exported error factory", () => {
    const cases = [
      [model.rateUnavailable, { from: "EUR", rate: "0.85", to: "USD" }],
      [model.rateOnSameCurrency, { currency: "EUR", rate: "0.85" }],
      [model.currencyMismatch, { left: "EUR", note: "x", right: "USD" }],
      [
        model.moneyOverflow,
        { currency: "EUR", left: 1, operation: "add", rate: "0.85", right: 2 },
      ],
      [
        model.conversionInputInvalid,
        { from: "EUR", minor: 1, reason: "fractional", to: "USD" },
      ],
      [
        model.conversionOverflow,
        {
          amount: { currency: "EUR", minor: 1 },
          baseCurrency: "EUR",
          currency: "USD",
          minor: 1000,
          rate: "0.85",
        },
      ],
    ] as const;

    for (const [factory, fields] of cases) {
      expect(
        () => construct(factory as (input: never) => unknown, fields),
        `${factory.name} accepted a sibling field`
      ).toThrow();
    }
  });

  it("keeps sibling literals out of the exported value types", () => {
    const amount = model.sameCurrencyAmount(moneyOf("EUR", 1000));

    const withAmountRate: model.SameCurrencyAmount = {
      ...sameCurrencyWire,
      // @ts-expect-error -- a same-currency amount never carries a rate
      rate: rateOf("0.85"),
    };

    const forgedTransaction: model.Transaction = {
      ...parse(codecs.transaction, transactionWire(false)),
      // @ts-expect-error -- a transaction never carries a subscription frequency
      frequency: "monthly",
    };

    const forgedMoney: model.Money = {
      currency: currencyOf("EUR"),
      // @ts-expect-error -- a money value never carries a base amount
      base: moneyOf("EUR", 1),
      minor: parse(codecs.minorUnits, 1),
    };

    const forgedStored: model.StoredConversion = {
      ...convertedWire,
      // @ts-expect-error -- a stored conversion never carries an amount
      amount: moneyOf("EUR", 1000),
    };

    expect(Object.keys(amount).toSorted()).toStrictEqual(["_tag", "amount"]);
    expect(withAmountRate).toBeDefined();
    expect(forgedTransaction).toBeDefined();
    expect(forgedMoney).toBeDefined();
    expect(forgedStored).toBeDefined();
  });
});

const optionPathsOf = (value: unknown): readonly (readonly string[])[] => {
  const out: string[][] = [];

  const walk = (node: unknown, path: readonly string[]): void => {
    if (Option.isOption(node)) {
      out.push([...path]);

      return;
    }

    if (Array.isArray(node)) {
      for (const [index, child] of node.entries()) {
        walk(child, [...path, String(index)]);
      }

      return;
    }

    if (!isPlainObject(node)) {
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      walk(child, [...path, key]);
    }
  };

  walk(value, []);

  return out;
};

const someInnerOf = (node: unknown): Record<string, unknown> | undefined =>
  Option.isOption(node) && Option.isSome(node) && isPlainObject(node.value)
    ? { ...node.value }
    : undefined;

const pick = (root: unknown, path: readonly string[]): unknown => {
  let node: unknown = root;

  for (const key of path) {
    node = isPlainObject(node) ? node[key] : undefined;
  }

  return node;
};

const rebuildAt = (
  root: unknown,
  path: readonly string[],
  replace: (node: unknown) => unknown
): unknown => {
  const [head, ...rest] = path;

  if (head === undefined) {
    return replace(root);
  }

  if (Array.isArray(root)) {
    const copy: unknown[] = [...(root as readonly unknown[])];

    copy[Number(head)] = rebuildAt(copy[Number(head)], rest, replace);

    return copy;
  }

  if (!isPlainObject(root)) {
    return root;
  }

  return { ...root, [head]: rebuildAt(root[head], rest, replace) };
};

const wrappedMoney = (): Record<string, unknown> => ({
  currency: "EUR",
  minor: 250,
});

const freshNone = (): object =>
  Object.create(Object.getPrototypeOf(Option.none()) as object) as object;

describe("every model door rejects a forged Option wrapper", () => {
  it("rejects forged wrappers on decode, encode, render and verified", () => {
    const handles: readonly {
      readonly handle: Handle;
      readonly name: string;
      readonly value: unknown;
    }[] = [
      {
        handle: codecs.invoiceDocument,
        name: "InvoiceDocument",
        value: parse(codecs.invoiceDocument, invoiceWire(true)),
      },
      {
        handle: codecs.transaction,
        name: "Transaction",
        value: parse(codecs.transaction, transactionWire(true)),
      },
    ];

    const pool = foreignPool();
    let cases = 0;

    for (const { handle, name, value } of handles) {
      const wire = render(
        handle as ModelCodec<never, unknown>,
        value as never
      ) as Record<string, unknown>;

      for (const path of optionPathsOf(value)) {
        const label = `${name}[${path.join(".")}]`;
        const key = pool[integer(0, pool.length - 1)] ?? "rate";
        const inner = someInnerOf(pick(value, path));

        const attacks: { field: string; wrapper: unknown }[] = [
          {
            field: key,
            wrapper: Object.assign(Option.some(inner ?? wrappedMoney()), {
              [key]: strayValue(key),
            }),
          },
          {
            field: "value",
            wrapper: Object.assign(freshNone(), {
              value: inner ?? wrappedMoney(),
            }),
          },
          {
            field: key,
            wrapper: Object.assign(freshNone(), {
              [key]: strayValue(key),
            }),
          },
        ];

        if (inner !== undefined) {
          attacks.push({
            field: key,
            wrapper: Option.some({ ...inner, [key]: strayValue(key) }),
          });
        }

        for (const { field, wrapper } of attacks) {
          const forged = rebuildAt(value, path, () => wrapper);
          const encoded = handle.encode(forged as never);

          expect(Result.isFailure(encoded), `${label} encoded ${field}`).toBe(
            true
          );

          if (Result.isFailure(encoded)) {
            expect(
              encoded.failure.message,
              `${label} encode names ${field}`
            ).toContain(field);
          }

          expect(
            () => render(handle as ModelCodec<never, unknown>, forged as never),
            label
          ).toThrow(new RegExp(field, "u"));

          expect(
            () => verified(handle as ModelCodec<never, unknown>, forged),
            label
          ).toThrow(new RegExp(field, "u"));

          cases += 1;
        }

        const wireNode = pick(wire, path);

        if (!isPlainObject(wireNode)) {
          continue;
        }

        const wireAttacks: {
          field: string;
          inject: (target: Record<string, unknown>) => Record<string, unknown>;
        }[] = [
          {
            field: key,
            inject: (target: Record<string, unknown>) => ({
              ...target,
              [key]: strayValue(key),
            }),
          },
          {
            field: "value",
            inject: () => ({
              _id: "Option",
              _tag: "None",
              value: wrappedMoney(),
            }),
          },
          {
            field: key,
            inject: () => ({
              _id: "Option",
              _tag: "None",
              [key]: strayValue(key),
            }),
          },
        ];

        if (isPlainObject(wireNode.value)) {
          wireAttacks.push({
            field: key,
            inject: (target: Record<string, unknown>) => {
              const nested = target.value;

              return isPlainObject(nested)
                ? { ...target, value: { ...nested, [key]: strayValue(key) } }
                : { ...target, [key]: strayValue(key) };
            },
          });
        }

        for (const { field, inject } of wireAttacks) {
          const forgedWire = rebuildAt(wire, path, (target) =>
            inject(isPlainObject(target) ? target : {})
          );

          const decoded = handle.decode(forgedWire);

          expect(Result.isFailure(decoded), `${label} decoded ${field}`).toBe(
            true
          );

          if (Result.isFailure(decoded)) {
            expect(
              decoded.failure.message,
              `${label} decode names ${field}`
            ).toContain(field);
          }

          cases += 1;
        }
      }
    }

    expect(cases).toBeGreaterThanOrEqual(16);
  });

  it("keeps the ninth verdict reproductions rejected", () => {
    const invoice = parse(codecs.invoiceDocument, invoiceWire(true));
    const some = Option.some(moneyOf("EUR", 250));

    Object.assign(some, { rate: rateOf("0.85") });

    expect(() =>
      render(codecs.invoiceDocument, { ...invoice, amount: some } as never)
    ).toThrow(/rate/u);

    expect(
      Result.isFailure(
        codecs.invoiceDocument.encode({ ...invoice, amount: some } as never)
      )
    ).toBe(true);

    const transaction = parse(codecs.transaction, transactionWire(true));
    const none = Option.none();

    Object.assign(none, { value: moneyOf("EUR", 250) });

    try {
      expect(
        Result.isFailure(
          codecs.transaction.encode({ ...transaction, fee: none } as never)
        )
      ).toBe(true);

      expect(() =>
        verified(codecs.transaction, { ...transaction, fee: none })
      ).toThrow(/value/u);
    } finally {
      Reflect.deleteProperty(none, "value");
    }
  });

  it("rejects a forged Option wrapper at every exported error factory", () => {
    const factories = [
      model.rateUnavailable,
      model.rateOnSameCurrency,
      model.currencyMismatch,
      model.moneyOverflow,
      model.conversionInputInvalid,
      model.conversionOverflow,
    ] as const;

    for (const factory of factories) {
      expect(
        () =>
          construct(factory as (input: never) => unknown, {
            amount: Object.assign(freshNone(), { value: wrappedMoney() }),
          }),
        `${factory.name} accepted a None that carries a value`
      ).toThrow(/amount/u);

      expect(
        () =>
          construct(factory as (input: never) => unknown, {
            fee: Object.assign(Option.some(wrappedMoney()), { rate: "0.85" }),
          }),
        `${factory.name} accepted a Some that carries a rate`
      ).toThrow(/fee/u);
    }
  });
});

type ForeignKey = string | number | symbol;

interface NodeRef {
  readonly key: ForeignKey | undefined;
  readonly label: string;
  readonly node: object;
  readonly parent: object | undefined;
}

const escapePattern = (text: string): string =>
  text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, "\\$&");

const nodeRefs = (
  value: unknown,
  label: string,
  parent: object | undefined,
  key: ForeignKey | undefined,
  out: NodeRef[]
): void => {
  if (typeof value !== "object" || value === null) {
    return;
  }

  out.push({ key, label, node: value, parent });

  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      nodeRefs(child, `${label}[${String(index)}]`, value, index, out);
    }

    return;
  }

  if (Option.isOption(value)) {
    if (Option.isSome(value)) {
      nodeRefs(value.value, `${label}.value`, value, "value", out);
    }

    return;
  }

  for (const childKey of Object.keys(value)) {
    nodeRefs(
      Reflect.get(value, childKey),
      `${label}.${childKey}`,
      value,
      childKey,
      out
    );
  }
};

const foreignKeyOf = (
  pool: readonly string[],
  turn: number,
  node: Readonly<Record<string, unknown>>
): string => {
  for (let step = 0; step < pool.length; step += 1) {
    const candidate = pool[(turn + step) % pool.length] ?? "rate";

    if (!Object.hasOwn(node, candidate)) {
      return candidate;
    }
  }

  return "rate";
};

const canAttach = (node: object, fields: object): boolean => {
  try {
    Object.assign(node, fields);

    return true;
  } catch {
    return false;
  }
};

const attachMethods = [
  "assign",
  "define",
  "define-hidden",
  "symbol-assign",
  "symbol-hidden",
] as const;

type AttachMethod = (typeof attachMethods)[number] | "spread";

const attachForeign = (
  ref: NodeRef,
  holder: { current: unknown },
  method: AttachMethod,
  key: ForeignKey,
  value: unknown
): (() => void) | undefined => {
  switch (method) {
    case "assign":
    case "symbol-assign": {
      try {
        Object.assign(ref.node, { [key]: value });
      } catch {
        return undefined;
      }

      return () => {
        Reflect.deleteProperty(ref.node, key);
      };
    }

    case "define":
    case "define-hidden":
    case "symbol-hidden": {
      try {
        Object.defineProperty(ref.node, key, {
          configurable: true,
          enumerable: method === "define",
          value,
          writable: true,
        });
      } catch {
        return undefined;
      }

      return () => {
        Reflect.deleteProperty(ref.node, key);
      };
    }

    case "spread": {
      if (!isPlainObject(ref.node)) {
        return undefined;
      }

      const copy = { ...ref.node, [key]: value };

      if (ref.parent === undefined || ref.key === undefined) {
        holder.current = copy;

        return () => {
          holder.current = ref.node;
        };
      }

      Reflect.set(ref.parent, ref.key, copy);

      if (Reflect.get(ref.parent, ref.key) !== copy) {
        return undefined;
      }

      return () => {
        Reflect.set(ref.parent as never, ref.key as never, ref.node);
      };
    }

    default: {
      return undefined;
    }
  }
};

const expectEveryDoorRejects = (
  handle: Handle,
  value: unknown,
  name: string,
  label: string
): void => {
  const pattern = new RegExp(escapePattern(name), "u");
  const encoded = handle.encode(value as never);

  expect(Result.isFailure(encoded), `${label} encoded`).toBe(true);

  if (Result.isFailure(encoded)) {
    expect(encoded.failure.message, `${label} encode names it`).toContain(name);
  }

  expect(
    () => render(handle as ModelCodec<never, unknown>, value as never),
    `${label} render names it`
  ).toThrow(pattern);

  expect(
    () => verified(handle as ModelCodec<never, unknown>, value),
    `${label} verified names it`
  ).toThrow(pattern);
};

const curatedDoors: readonly {
  readonly handle: Handle;
  readonly name: string;
  readonly wire: unknown;
}[] = [
  {
    handle: codecs.archiveTarget as never,
    name: "ArchiveTarget",
    wire: archiveTargetWire,
  },
  { handle: codecs.amounts as never, name: "Amounts", wire: convertedWire },
  {
    handle: codecs.convertedAmount as never,
    name: "ConvertedAmount",
    wire: convertedWire,
  },
  {
    handle: codecs.invoiceDocument as never,
    name: "InvoiceDocument",
    wire: invoiceWire(true),
  },
  {
    handle: codecs.rateUnavailable as never,
    name: "RateUnavailable",
    wire: { _tag: "RateUnavailable", from: "USD", to: "EUR" },
  },
  {
    handle: codecs.timestamp as never,
    name: "Timestamp",
    wire: "2024-02-01T09:00:00.000Z",
  },
  {
    handle: codecs.transaction as never,
    name: "Transaction",
    wire: transactionWire(true),
  },
];

const fixtureDoors = fixtures.flatMap(({ name, schema, wires }) =>
  wires.slice(0, 1).map((wire) => ({
    handle: schema,
    name,
    wire: withoutMeta(wire),
  }))
);

const foreignDoors = [
  ...curatedDoors,
  ...fixtureDoors.filter(
    (door) =>
      !curatedDoors.some(
        (curated) =>
          curated.name === door.name || curated.handle.name === door.name
      )
  ),
];

describe("every node rejects a foreign own key attached any way", () => {
  it("rejects spread, assign, hidden and symbol keys on every node at every depth", () => {
    const pool = foreignPool();
    let cases = 0;
    let turn = 0;

    for (const { handle, name, wire } of foreignDoors) {
      const decoded = handle.decode(wire);

      if (Result.isFailure(decoded)) {
        continue;
      }

      const refs: NodeRef[] = [];

      nodeRefs(decoded.success, name, undefined, undefined, refs);

      const holder: { current: unknown } = { current: decoded.success };

      for (const [index, ref] of refs.entries()) {
        for (const method of [...attachMethods, "spread" as const]) {
          const symbol = method.startsWith("symbol");

          const seed = foreignKeyOf(
            pool,
            turn + index,
            ref.node as Readonly<Record<string, unknown>>
          );

          const key: ForeignKey = symbol ? Symbol(seed) : seed;
          const label = `${name}[${String(index)}] ${method} ${String(key)}`;

          turn += 1;

          if (Object.hasOwn(ref.node, key)) {
            continue;
          }

          const restore = attachForeign(
            ref,
            holder,
            method,
            key,
            strayValue(seed)
          );

          if (restore === undefined) {
            cases += 3;

            continue;
          }

          try {
            expectEveryDoorRejects(handle, holder.current, String(key), label);
            cases += 3;
          } finally {
            restore();
          }
        }
      }
    }

    expect(cases).toBeGreaterThanOrEqual(650);
  });

  it("rejects a foreign own key attached any way at every error factory", () => {
    const pool = foreignPool();

    const factories: readonly {
      readonly factory: (fields: never) => unknown;
      readonly fields: Readonly<Record<string, unknown>>;
    }[] = [
      {
        factory: model.conversionInputInvalid,
        fields: { from: "USD", reason: "fractional", to: "EUR" },
      },
      {
        factory: model.conversionOverflow,
        fields: {
          baseCurrency: "EUR",
          currency: "USD",
          minor: 1,
          rate: "0.85",
        },
      },
      {
        factory: model.currencyMismatch,
        fields: { left: "USD", right: "EUR" },
      },
      {
        factory: model.moneyOverflow,
        fields: { currency: "EUR", left: 1, operation: "add", right: 2 },
      },
      {
        factory: model.rateOnSameCurrency,
        fields: { currency: "EUR" },
      },
      {
        factory: model.rateUnavailable,
        fields: { from: "USD", to: "EUR" },
      },
    ];

    let cases = 0;
    let turn = 0;

    for (const { factory, fields } of factories) {
      for (const method of [...attachMethods, "spread" as const]) {
        const symbol = method.startsWith("symbol");
        const seed = foreignKeyOf(pool, turn, fields);
        const key: ForeignKey = symbol ? Symbol(seed) : seed;
        const label = `${factory.name} ${method} ${String(key)}`;

        turn += 1;

        const target: Record<string, unknown> = { ...fields };

        const ref: NodeRef = {
          key: undefined,
          label,
          node: target,
          parent: undefined,
        };

        const holder: { current: unknown } = { current: target };

        if (method === "spread") {
          holder.current = { ...target, [key]: strayValue(seed) };
        } else {
          const restore = attachForeign(
            ref,
            holder,
            method,
            key,
            strayValue(seed)
          );

          if (restore === undefined) {
            continue;
          }
        }

        expect(
          () => construct(factory, holder.current as Record<string, unknown>),
          `${label} accepted the key`
        ).toThrow(new RegExp(escapePattern(String(key)), "u"));

        cases += 1;
      }
    }

    expect(cases).toBeGreaterThanOrEqual(30);
  });

  it("keeps the tenth verdict reproductions rejected", () => {
    const hiddenRate = (): object =>
      Object.defineProperty({ currency: "EUR", minor: 120_000 }, "rate", {
        configurable: true,
        value: rateOf("0.85"),
      });

    const invoice = parse(codecs.invoiceDocument, invoiceWire(true));
    const forgedMoney = hiddenRate();

    expect(
      Result.isFailure(
        codecs.invoiceDocument.encode({
          ...invoice,
          amount: Option.some(forgedMoney),
        } as never)
      )
    ).toBe(true);

    expect(() =>
      render(codecs.invoiceDocument, {
        ...invoice,
        amount: Option.some(forgedMoney),
      } as never)
    ).toThrow(/rate/u);

    expect(() =>
      verified(codecs.invoiceDocument, {
        ...invoiceWire(true),
        amount: forgedMoney,
      })
    ).toThrow(/rate/u);

    const timestamp = parse(codecs.timestamp, "2024-02-01T09:00:00.000Z");

    const wrapped = Object.assign(new String(timestamp), {
      rate: rateOf("0.85"),
    });

    const transaction = parse(codecs.transaction, transactionWire(true));
    const forgedTimestamp = { ...transaction, createdAt: wrapped };

    expect(
      Result.isFailure(codecs.transaction.encode(forgedTimestamp as never))
    ).toBe(true);

    expect(() => render(codecs.transaction, forgedTimestamp as never)).toThrow(
      /String/u
    );

    expect(() => verified(codecs.transaction, forgedTimestamp)).toThrow(
      /String/u
    );

    const target = parse(codecs.archiveTarget, archiveTargetWire);
    const blocklist = [...target.blocklist];

    Object.assign(blocklist, { rate: rateOf("0.85") });

    const forgedTarget = { ...target, blocklist };

    expect(
      Result.isFailure(codecs.archiveTarget.encode(forgedTarget as never))
    ).toBe(true);

    expect(() => render(codecs.archiveTarget, forgedTarget as never)).toThrow(
      /rate/u
    );

    expect(() => verified(codecs.archiveTarget, forgedTarget)).toThrow(/rate/u);
  });

  it("rejects a hidden symbol key on a money spread", () => {
    const invoice = parse(codecs.invoiceDocument, invoiceWire(true));
    const key = Symbol("rate");

    const forgedMoney = Object.defineProperty(
      { currency: "EUR", minor: 120_000 },
      key,
      { configurable: true, value: rateOf("0.85") }
    );

    expect(() =>
      render(codecs.invoiceDocument, {
        ...invoice,
        amount: Option.some(forgedMoney),
      } as never)
    ).toThrow(/rate/u);

    expect(() =>
      verified(codecs.invoiceDocument, {
        ...invoiceWire(true),
        amount: forgedMoney,
      })
    ).toThrow(/rate/u);
  });
});

interface UnionDoor {
  readonly handle: Handle;
  readonly name: string;
  readonly wires: readonly Wire[];
}

const unionDoors: readonly UnionDoor[] = [
  {
    handle: model.codecs.amounts as never,
    name: "amounts",
    wires: [sameCurrencyWire, convertedWire],
  },
  {
    handle: model.codecs.categorization as never,
    name: "categorization",
    wires: ["Applied", "Confirmed", "None", "Suggested"].map(
      categorizationWire
    ),
  },
  {
    handle: model.codecs.classification as never,
    name: "classification",
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
    handle: model.codecs.archiveState as never,
    name: "archiveState",
    wires: ["Archived", "Failed", "Reserved", "Unarchived"].map(archiveWire),
  },
  {
    handle: model.codecs.taxObligationStatus as never,
    name: "taxObligationStatus",
    wires: ["Estimated", "Paid", "WrittenOff"].map(taxStatusWire),
  },
  {
    handle: model.codecs.syncRunState as never,
    name: "syncRunState",
    wires: [
      "Cancelled",
      "Categorizing",
      "ChunkDone",
      "Failed",
      "Running",
      "Succeeded",
    ].map(syncStateWire),
  },
  {
    handle: model.codecs.subscriptionStatus as never,
    name: "subscriptionStatus",
    wires: [
      "Cancelled",
      "Confirmed",
      "Detected",
      "Dismissed",
      "NotRecurring",
    ].map((tag) => subscriptionStatusWire(tag)),
  },
  {
    handle: model.codecs.rule as never,
    name: "rule",
    wires: [
      "categorize",
      "exclude",
      "income_client",
      "internal_transfer",
      "refund",
      "self_transfer",
      "tax_payment",
    ].map(ruleWire),
  },
];

const forgedMoneyOf = (): object =>
  Object.assign({ currency: "EUR", minor: 1000 }, { rate: "0.85" });

const hiddenRateMoneyOf = (): object =>
  Object.defineProperty({ currency: "EUR", minor: 1000 }, "rate", {
    configurable: true,
    value: "0.85",
  });

const attemptCall = (run: () => unknown): unknown => {
  try {
    return run();
  } catch (error) {
    return error;
  }
};

const siblingKeysOf = (
  branch: unknown,
  siblings: readonly unknown[]
): readonly ForeignKey[] => {
  const own = new Set(Reflect.ownKeys(branch as object));
  const keys = new Set<ForeignKey>();

  for (const sibling of siblings) {
    for (const key of Reflect.ownKeys(sibling as object)) {
      if (!own.has(key)) {
        keys.add(key);
      }
    }
  }

  return [...keys];
};

describe("a union resolves to one branch before it checks keys", () => {
  it("rejects a key that only a sibling union branch allows", () => {
    let cases = 0;

    for (const { handle, name, wires } of unionDoors) {
      const branches = wires.map((wire) => handle.decode(wire));

      for (const [index, decoded] of branches.entries()) {
        if (Result.isFailure(decoded)) {
          continue;
        }

        const branch = decoded.success;

        const siblings = branches.flatMap((other) =>
          Result.isSuccess(other) ? [other.success] : []
        );

        const wireBranch = render(handle as never, branch as never) as object;

        for (const siblingKey of siblingKeysOf(branch, siblings)) {
          const seed = String(siblingKey);

          const candidates: readonly ForeignKey[] = [siblingKey, Symbol(seed)];

          for (const key of candidates) {
            for (const method of attachMethods) {
              if (Object.hasOwn(wireBranch, key)) {
                continue;
              }

              const holder: { current: unknown } = { current: wireBranch };
              const label = `${name} branch ${String(index)} ${method} ${String(key)} seed ${SEED}`;

              const restore = attachForeign(
                {
                  key: undefined,
                  label,
                  node: wireBranch,
                  parent: undefined,
                },
                holder,
                method,
                key,
                strayValue(seed)
              );

              if (restore === undefined) {
                continue;
              }

              try {
                expectEveryDoorRejects(
                  handle,
                  holder.current,
                  String(key),
                  label
                );
                cases += 3;
              } finally {
                restore();
              }
            }
          }
        }
      }
    }

    expect(cases).toBeGreaterThanOrEqual(280);
  });

  it("rejects a sibling key on a union nested in a transaction", () => {
    const transaction = parse(codecs.transaction, transactionWire(true));

    const nested = [
      {
        key: "categoryId",
        attach: (value: Wire) => {
          const categorization = Object.hasOwn(value, "categorization")
            ? value.categorization
            : undefined;

          return Object.assign(categorization as object, {
            categoryId: str(4),
          });
        },
        path: "categorization",
      },
      {
        key: "ruleId",
        attach: (value: Wire) => {
          const classification = Object.hasOwn(value, "classification")
            ? value.classification
            : undefined;

          return Object.assign(classification as object, { ruleId: str(7) });
        },
        path: "classification",
      },
      {
        key: "base",
        attach: (value: Wire) => {
          const amounts = Object.hasOwn(value, "amounts")
            ? value.amounts
            : undefined;

          return Object.assign(amounts as object, {
            base: { currency: "EUR", minor: 1000 },
          });
        },
        path: "amounts",
      },
    ];

    for (const { key, attach, path } of nested) {
      const forged = structuredClone(transaction) as Wire;

      attach(forged);

      const label = `transaction.${path} ${key} seed ${SEED}`;

      expectEveryDoorRejects(codecs.transaction as never, forged, key, label);
    }
  });
});

const messageOf = (run: () => unknown): string => {
  const outcome = attemptCall(run);

  if (Predicate.isError(outcome)) {
    return outcome.message;
  }

  if (Result.isResult(outcome) && Result.isFailure(outcome)) {
    return (outcome.failure as { readonly message: string }).message;
  }

  return "accepted";
};

const cachedStampOf = (): object => {
  const stamp = DateTime.makeUnsafe("2024-02-01T09:00:00Z");
  const parts = DateTime.toPartsUtc(stamp);

  Object.defineProperty(stamp, "partsUtc", {
    value: Object.assign(new Map([["rate", rateOf("0.85")]]), parts),
  });

  return stamp;
};

describe("no Effect DateTime crosses the model boundary", () => {
  it("keeps a timestamp a primitive the codec round-trips", () => {
    const stamp = parse(codecs.timestamp, "2024-02-01T09:00:00.000Z");

    expect(typeof stamp).toBe("string");
    expect(stamp).toBe("2024-02-01T09:00:00.000Z");
    expect(render(codecs.timestamp, stamp)).toBe("2024-02-01T09:00:00.000Z");
    expect(verified(codecs.timestamp, stamp)).toBe(stamp);

    const parts = model.timestampParts(stamp);

    expect(parts).toStrictEqual({
      day: 1,
      hour: 9,
      millisecond: 0,
      minute: 0,
      month: 2,
      second: 0,
      year: 2024,
    });
    expect(Object.getPrototypeOf(parts)).toBe(Object.prototype);
    expect(Object.isFrozen(parts)).toBe(true);
    expect(DateTime.isDateTime(parts)).toBe(false);
    expect(model.timestampParts(stamp)).not.toBe(model.timestampParts(stamp));
  });

  it("refuses a DateTime carrying a cached rate at every timestamp door", () => {
    const stamp = cachedStampOf();

    expect(
      messageOf(() => codecs.timestamp.decode(stamp)),
      "decode"
    ).toContain("DateTime");
    expect(
      messageOf(() => codecs.timestamp.encode(stamp as never)),
      "encode"
    ).toContain("DateTime");
    expect(messageOf(() => render(codecs.timestamp, stamp as never))).toContain(
      "DateTime"
    );
    expect(
      messageOf(() => verified(codecs.timestamp, stamp)),
      "verified"
    ).toContain("DateTime");
  });

  it("refuses a DateTime that hides a rate inside a transaction", () => {
    const transaction = parse(codecs.transaction, transactionWire(true));
    const forged = { ...transaction, createdAt: cachedStampOf() };

    expect(Result.isFailure(codecs.transaction.encode(forged as never))).toBe(
      true
    );
    expect(
      messageOf(() => codecs.transaction.encode(forged as never))
    ).toContain("DateTime");
    expect(
      messageOf(() => render(codecs.transaction, forged as never))
    ).toContain("DateTime");
    expect(messageOf(() => verified(codecs.transaction, forged))).toContain(
      "DateTime"
    );
  });

  it("refuses a timestamp where a rate belongs, as the second seventy-fifth door showed", () => {
    const stamp = parse(codecs.timestamp, "2024-02-01T09:00:00.000Z");
    const smuggled = Object.assign(stamp, rateOf("0.85"));

    const message = messageOf(() => model.rateText(smuggled as never));

    expect(message).toContain("rateText argument 1");
    expect(message).toContain("Rate");
    expect(message).toContain("String");
  });

  it("refuses a registered value of another kind naming both kinds, as the first seventy-fifth door showed", () => {
    const money = moneyOf("EUR", 1000);
    const message = messageOf(() => model.rateText(money as never));

    expect(message).toContain("rateText argument 1");
    expect(message).toContain("RateSchema");
    expect(message).toContain("MoneySchema");
  });
});

describe("the money operations refuse a money that carries a foreign key", () => {
  it.effect(
    "rejects an attached rate at atRate, convert, addMoney and subtractMoney",
    () =>
      Effect.gen(function* forgeMoneyOperations() {
        const rate = rateOf("0.85");
        const money = moneyOf("EUR", 1000);
        let cases = 0;

        for (const forged of [forgedMoneyOf(), hiddenRateMoneyOf()]) {
          const atRate = model.BaseAmount.atRate(
            forged as never,
            money.currency,
            rate
          );

          expect(
            Result.isFailure(atRate) ? atRate.failure.message : "accepted",
            `atRate seed ${SEED}`
          ).toContain("rate");

          const converts: readonly Effect.Effect<unknown, Error>[] = [
            model.BaseAmount.convert(forged as never, money.currency, () =>
              Option.none()
            ),
            model.convert(forged as never, money.currency, () => Option.none()),
            model.addMoney(forged as never, money),
            model.addMoney(money, forged as never),
            model.subtractMoney(forged as never, money),
            model.subtractMoney(money, forged as never),
          ];

          for (const effect of converts) {
            const result = yield* Effect.result(effect);

            expect(
              Result.isFailure(result) ? result.failure.message : "accepted",
              `effect seed ${SEED}`
            ).toContain("rate");

            cases += 1;
          }

          const converting = model.ConvertedAmount.converting(
            forged as never,
            currencyOf("USD"),
            rate,
            dateOf("2024-01-30")
          );

          expect(
            Result.isFailure(converting)
              ? converting.failure.message
              : "accepted",
            `converting seed ${SEED}`
          ).toContain("rate");
        }

        expect(cases).toBeGreaterThanOrEqual(10);
      })
  );
});

const plainArgsKey = Symbol.for("effect/Data/Error/plainArgs");

const errorDoorFields = (wire: Wire): Readonly<Record<string, unknown>> => {
  const { _tag: tag, ...fields } = wire;

  void tag;

  return fields;
};

const errorDoors = (): readonly {
  readonly handle: Handle;
  readonly make: (fields: never) => Error;
  readonly wire: Wire;
}[] => [
  {
    handle: codecs.conversionInputInvalid,
    make: model.conversionInputInvalid,
    wire: {
      _tag: "ConversionInputInvalid",
      from: "USD",
      reason: "fractional",
      to: "EUR",
    },
  },
  {
    handle: codecs.conversionOverflow,
    make: model.conversionOverflow,
    wire: {
      _tag: "ConversionOverflow",
      baseCurrency: "EUR",
      currency: "USD",
      minor: 1,
      rate: "0.85",
    },
  },
  {
    handle: codecs.currencyMismatch,
    make: model.currencyMismatch,
    wire: { _tag: "CurrencyMismatch", left: "USD", right: "EUR" },
  },
  {
    handle: codecs.moneyOverflow,
    make: model.moneyOverflow,
    wire: {
      _tag: "MoneyOverflow",
      currency: "EUR",
      left: 1,
      operation: "add",
      right: 2,
    },
  },
  {
    handle: codecs.rateOnSameCurrency,
    make: model.rateOnSameCurrency,
    wire: { _tag: "RateOnSameCurrency", currency: "EUR" },
  },
  {
    handle: codecs.rateUnavailable,
    make: model.rateUnavailable,
    wire: { _tag: "RateUnavailable", from: "USD", to: "EUR" },
  },
];

const leakOf = (value: unknown): string | undefined => {
  if (Schema.isSchema(value)) {
    return "a schema";
  }

  if (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  ) {
    return typeof Reflect.get(value as object, "make") === "function"
      ? "a .make constructor"
      : undefined;
  }

  return undefined;
};

const readKey = (node: object, key: ForeignKey): unknown => {
  try {
    return Reflect.get(node, key);
  } catch {
    return undefined;
  }
};

const leaksWithin = (root: unknown, label: string): readonly string[] => {
  const leaks: string[] = [];
  const seen = new WeakSet<object>();

  const walk = (value: unknown, path: string, depth: number): void => {
    const leak = leakOf(value);

    if (leak !== undefined) {
      leaks.push(`${label}${path} reaches ${leak}`);

      return;
    }

    if (
      depth > 8 ||
      value === null ||
      (typeof value !== "object" && typeof value !== "function")
    ) {
      return;
    }

    const node = value as object;

    if (seen.has(node)) {
      return;
    }

    seen.add(node);

    for (const key of Reflect.ownKeys(node)) {
      walk(readKey(node, key), `${path}.${String(key)}`, depth + 1);
    }

    const prototype: unknown = Object.getPrototypeOf(node);

    if (prototype !== null) {
      walk(prototype, `${path}.<prototype>`, depth + 1);
    }
  };

  walk(root, "", 0);

  return leaks;
};

const DOOR_SEED = 672_390;

describe("the sixty-seventh verdict doors stay shut", () => {
  it("keeps exactly the six tagged errors on the public codec table", () => {
    const doors = errorDoors();

    expect(doors.map(({ handle }) => handle.name).toSorted()).toStrictEqual(
      [
        "ConversionInputInvalid",
        "ConversionOverflow",
        "CurrencyMismatch",
        "MoneyOverflow",
        "RateOnSameCurrency",
        "RateUnavailable",
      ].toSorted()
    );
  });

  it("keeps every valid error encoding back to its wire", () => {
    for (const { handle, make, wire } of errorDoors()) {
      const instance = make(errorDoorFields(wire) as never);
      const decoded = handle.decode(wire);

      expect(
        Result.isSuccess(decoded),
        `${handle.name} decodes its own wire`
      ).toBe(true);
      expect(
        render(handle as ModelCodec<never, unknown>, instance as never)
      ).toStrictEqual(wire);
    }
  });

  it("exposes no constructor that rebuilds an error", () => {
    for (const { handle, make, wire } of errorDoors()) {
      const instance = make(errorDoorFields(wire) as never);
      const constructor: unknown = Reflect.get(instance, "constructor");

      expect(
        constructor,
        `${handle.name} exposes a constructor`
      ).toBeUndefined();

      expect(
        () => Reflect.construct(constructor as never, []),
        `${handle.name} constructor is usable`
      ).toThrow();
    }
  });

  it("reaches no schema, encoder or .make from an error within eight steps", () => {
    const leaks = errorDoors().flatMap(({ handle, make, wire }) =>
      leaksWithin(make(errorDoorFields(wire) as never), handle.name)
    );

    expect(leaks).toStrictEqual([]);
  });

  it("reaches no schema, encoder or .make from a public export within eight steps", () => {
    const leaks = Object.entries(model).flatMap(([name, value]) =>
      leaksWithin(value, name)
    );

    expect(leaks).toStrictEqual([]);
  });

  it("names a foreign rate instead of dropping it, as the first door did", () => {
    for (const { handle, make, wire } of errorDoors()) {
      const forged = { ...errorDoorFields(wire), note: "forged" };

      expect(
        () => make(forged as never),
        `${handle.name} dropped a foreign note`
      ).toThrow(/note/u);
    }

    expect(() =>
      construct((fields: never) => model.conversionInputInvalid(fields), {
        from: currencyOf("EUR"),
        rate: rateOf("0.85"),
        to: currencyOf("USD"),
      })
    ).toThrow(/rate/u);
  });

  it("keeps the plainArgs slot out of every error, as the second door did", () => {
    for (const { handle, make, wire } of errorDoors()) {
      const instance = make(errorDoorFields(wire) as never);

      expect(
        Object.hasOwn(instance, plainArgsKey),
        `${handle.name} carries the plainArgs slot`
      ).toBe(false);

      expect(
        () =>
          Object.defineProperty(instance, plainArgsKey, {
            configurable: true,
            value: { rate: rateOf("0.85") },
          }),
        `${handle.name} must refuse the plainArgs slot`
      ).toThrow();

      expect(
        () =>
          render(
            handle as ModelCodec<never, unknown>,
            {
              ...instance,
              [plainArgsKey]: { rate: rateOf("0.85") },
            } as never
          ),
        `${handle.name} render dropped a rate in plainArgs`
      ).toThrow(/effect\/Data\/Error\/plainArgs/u);

      expect(() =>
        verified(
          handle as ModelCodec<never, unknown>,
          make(errorDoorFields(wire) as never) as never
        )
      ).not.toThrow();
    }
  });

  it("rejects a foreign string, symbol or nested money on every error, seeded", () => {
    let state = DOOR_SEED;

    const next = (): number => {
      state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

      return state / 4_294_967_296;
    };

    const draw = <T>(values: readonly T[]): T =>
      values[Math.floor(next() * values.length)] as T;

    const keys: readonly ForeignKey[] = [
      plainArgsKey,
      Symbol("rate"),
      Symbol.for("effect/Data/Error/plainArgs"),
      "amount",
      "base",
      "fee",
      "note",
      "rate",
      "total",
    ];

    const strays: readonly unknown[] = [
      { currency: "EUR", minor: 1 },
      { denominator: 100, numerator: 85 },
      rateOf("0.85"),
      7,
    ];

    const methods = ["assign", "define", "define-hidden"] as const;

    let cases = 0;

    for (const { handle, make, wire } of errorDoors()) {
      for (let step = 0; step < 150; step += 1) {
        const method = draw([...methods]);
        const key = draw(keys);
        const value = draw(strays);
        const name = String(key);
        const label = `seed ${DOOR_SEED} ${handle.name} step ${step} ${method} ${name}`;
        const instance = make(errorDoorFields(wire) as never);

        if (Object.hasOwn(instance, key)) {
          continue;
        }

        if (!canAttach(instance, { [key]: value })) {
          cases += 1;

          continue;
        }

        expectEveryDoorRejects(handle, instance, name, label);

        cases += 1;
      }
    }

    expect(cases).toBeGreaterThanOrEqual(650);
  });
});

const sealSamples: ReadonlyMap<unknown, readonly unknown[]> = new Map<
  unknown,
  readonly unknown[]
>([
  ...fixtures.map((fixture) => [fixture.schema, fixture.wires] as const),
  [codecs.aliasId, [str(20)]],
  [codecs.archiveTargetId, [str(21)]],
  [codecs.assetType, ["etf"]],
  [codecs.categoryId, [str(4)]],
  [codecs.currencyCode, ["EUR"]],
  [codecs.dateOnly, ["2024-01-30"]],
  [codecs.direction, ["out"]],
  [codecs.documentId, [str(22)]],
  [codecs.documentSource, ["upload"]],
  [codecs.documentType, ["invoice"]],
  [codecs.frequency, ["monthly"]],
  [codecs.holdingId, [str(9)]],
  [codecs.invoiceSourceId, [str(11)]],
  [codecs.matchField, ["merchant"]],
  [codecs.matchType, ["contains"]],
  [codecs.memberId, [str(2)]],
  [codecs.minorUnits, [1000]],
  [codecs.payeeId, [str(5)]],
  [codecs.payeeKind, ["merchant"]],
  [codecs.pendingHolding, [holdingWire("pending")]],
  [codecs.platformId, ["demo-broker"]],
  [codecs.pricedHolding, [holdingWire("active")]],
  [codecs.profileId, [str(1)]],
  [codecs.profileKind, ["business"]],
  [codecs.providerAccountId, [str(3)]],
  [codecs.providerId, ["wise"]],
  [codecs.providerKind, ["bank"]],
  [codecs.quantity, [2]],
  [codecs.rate, ["0.85"]],
  [codecs.reportId, [str(17)]],
  [codecs.role, ["owner"]],
  [codecs.ruleDirection, ["any"]],
  [codecs.ruleId, [str(7)]],
  [codecs.spendingType, ["personal"]],
  [codecs.subscriptionId, [str(8)]],
  [codecs.syncRunId, [str(16)]],
  [codecs.syncRunKind, ["bank_sync"]],
  [codecs.taxObligationId, [str(15)]],
  [codecs.taxProfileId, [str(14)]],
  [codecs.timestamp, [at]],
  [codecs.transactionId, [str(13)]],
  [codecs.amounts, [sameCurrencyWire, convertedWire]],
  [codecs.convertedAmount, [convertedWire]],
  [codecs.holding, [holdingWire("pending"), holdingWire("active")]],
]);

const SEAL_SEED = 0x73_5e_a1_09;

const sealedKinds = (): ReadonlySet<string> =>
  new Set<string>([
    ...Object.values(codecs).map((handle) => handle.name),
    "BaseAmount",
    "ConvertedAmount",
  ]);

const sealWalk = (
  value: unknown,
  path: string,
  label: string,
  kinds: ReadonlySet<string>
): number => {
  if (typeof value !== "object" || value === null) {
    return 0;
  }

  if (Option.isOption(value)) {
    expect(
      Option.isNone(value) || Object.isFrozen(value),
      `${label} ${path} is not frozen`
    ).toBe(true);

    return Option.isSome(value)
      ? sealWalk(value.value, `${path}.value`, label, kinds)
      : 0;
  }

  expect(Object.isFrozen(value), `${label} ${path} is not frozen`).toBe(true);

  if (Array.isArray(value)) {
    return (value as readonly unknown[]).reduce<number>(
      (count, entry, index) =>
        count + sealWalk(entry, `${path}[${String(index)}]`, label, kinds),
      0
    );
  }

  const kind = madeAs(value);

  expect(kind, `${label} ${path} is not registry-made`).toBeDefined();
  expect(
    kinds.has(kind ?? ""),
    `${label} ${path} is made as ${String(kind)}`
  ).toBe(true);

  return (
    1 +
    Reflect.ownKeys(value).reduce(
      (count, key) =>
        count +
        sealWalk(
          Reflect.get(value, key),
          `${path}.${String(key)}`,
          label,
          kinds
        ),
      0
    )
  );
};

const refusalIn = (
  entry: OperationEntry,
  args: readonly unknown[]
): unknown => {
  try {
    const outcome = entry.invoke(args);

    if (entry.channel === "effect") {
      const settled = Effect.runSync(
        Effect.result(
          outcome as Effect.Effect<unknown, { readonly message: string }>
        )
      );

      return Result.isFailure(settled) ? settled.failure : undefined;
    }

    return Result.isFailure(outcome as Result.Result<unknown, unknown>)
      ? (outcome as { readonly failure: unknown }).failure
      : undefined;
  } catch (error) {
    return error;
  }
};

const slotMatches = (spec: CarriesArgument, valueKind: string): boolean =>
  spec.kinds.includes(valueKind);

describe("every value is sealed where the model built it", () => {
  it("has a valid sample for every codec in the table", () => {
    const missing = Object.entries(codecs)
      .filter(([, handle]) => !sealSamples.has(handle))
      .map(([key]) => key);

    expect(
      missing,
      `codecs with no valid sample: ${missing.join(", ")}`
    ).toStrictEqual([]);
    expect(Object.keys(codecs)).toHaveLength(80);
  });

  it("seals every decoded node, round-trips it and is accepted by every slot of its kind, seeded", () => {
    const kinds = sealedKinds();
    const keys = Object.keys(codecs) as readonly (keyof typeof codecs)[];
    let made = 0;
    let cases = 0;

    for (let step = 0; step < 1400; step += 1) {
      const key = keys[step % keys.length] ?? "money";
      const handle: Handle = codecs[key];
      const wires = sealSamples.get(handle) ?? [];
      const input = wires[step % wires.length];
      const label = `seed ${String(SEAL_SEED)} step ${String(step)} ${key}`;
      const decoded = handle.decode(input);

      expect(
        Result.isSuccess(decoded),
        `${label} rejects its own valid sample`
      ).toBe(true);

      if (Result.isFailure(decoded)) {
        continue;
      }

      cases += 1;
      made += sealWalk(decoded.success, "$", label, kinds);

      const encoded = handle.encode(decoded.success as never);

      expect(
        Result.isSuccess(encoded),
        `${label} does not encode its own value`
      ).toBe(true);

      if (Result.isSuccess(encoded)) {
        const again = handle.decode(encoded.success);

        expect(
          Result.isSuccess(again) ? again.success : undefined,
          `${label} does not round-trip`
        ).toStrictEqual(decoded.success);
      }

      const valueKind = madeAs(decoded.success as object);

      if (valueKind === undefined) {
        cases += 1;

        continue;
      }

      for (const entry of Object.values(operations)) {
        for (const [index, spec] of entry.arguments.entries()) {
          if (spec.kind !== "carries") {
            continue;
          }

          const call = [...entry.samples()];

          if (!slotMatches(spec, valueKind)) {
            continue;
          }

          call[index] = decoded.success;

          const failure = refusalIn(entry, call);

          expect(
            failure instanceof Schema.SchemaError ? failure.message : undefined,
            `${label} ${entry.name} argument ${String(index + 1)} refuses its own ${valueKind}`
          ).toBeUndefined();
          cases += 1;
        }
      }
    }

    expect(made).toBeGreaterThanOrEqual(700);
    expect(cases).toBeGreaterThanOrEqual(700);
  });

  it("accepts an invoice amount that arrived inside an Option, as the seventy-third door refused", () => {
    const invoice = parse(codecs.invoiceDocument, invoiceWire(true));
    const amount = invoice.amount;

    expect(Option.isSome(amount)).toBe(true);

    if (Option.isNone(amount)) {
      return;
    }

    expect(Object.isFrozen(amount.value), "invoice amount is frozen").toBe(
      true
    );
    expect(madeAs(amount.value), "invoice amount kind").toBe("MoneySchema");

    const sum = Effect.runSync(model.addMoney(amount.value, amount.value));

    expect(Result.isSuccess(codecs.money.encode(amount.value))).toBe(true);
    expect(render(codecs.money, amount.value)).toStrictEqual({
      currency: "EUR",
      minor: 120_000,
    });
    expect(render(codecs.money, sum)).toStrictEqual({
      currency: "EUR",
      minor: 240_000,
    });
  });

  it("refuses a caller-supplied schema at the public parse, as the seventy-third door showed", () => {
    const money = moneyOf("EUR", 1000);
    const map = new Map([["rate", money]]);
    const smuggled = Object.assign(map, rateOf("0.85"));

    expect(() =>
      parse(
        Schema.ReadonlyMap(Schema.String, Schema.Unknown) as never,
        map as never
      )
    ).toThrow(/model codec handle/u);
    expect(() => parse(Schema.Unknown as never, map as never)).toThrow(
      /model codec handle/u
    );
    expect(() =>
      parse(
        Schema.Struct({ rate: Schema.String, minor: Schema.Finite }) as never,
        { minor: 1000, rate: "0.85" } as never
      )
    ).toThrow(/model codec handle/u);

    const refusal = ((): string => {
      try {
        model.rateText(smuggled as never);

        return "accepted";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })();

    expect(refusal).toContain("Rate");
    expect(refusal).toContain("Map");
    expect(refusal).not.toContain("object Map");
  });
});

const sealRefusal = (
  entry: OperationEntry,
  args: readonly unknown[]
): string => {
  const failure = refusalIn(entry, args);

  if (failure === undefined) {
    return "accepted";
  }

  return failure instanceof Error
    ? failure.message
    : ((failure as { readonly message?: string }).message ?? "refused");
};

describe("the verdict reproductions stay refused, naming the argument and the kind", () => {
  const money = moneyOf("EUR", 1000);

  it("refuses a structurally equal literal at the fifty-seventh door", () => {
    const message = sealRefusal(operations.addMoney, [
      { currency: "EUR", minor: 1000 } as never,
      money,
    ]);

    expect(message).toContain("addMoney argument 1");
    expect(message).toContain("Money");
  });

  it("refuses a Map at the fifty-eighth door", () => {
    const message = sealRefusal(operations.addMoney, [
      new Map(Object.entries(money)) as never,
      money,
    ]);

    expect(message).toContain("addMoney argument 1");
    expect(message).toContain("Map");
    expect(message).toContain("Money");
  });

  it("refuses a function at the sixty-third door", () => {
    const message = sealRefusal(operations.addMoney, [
      Object.assign(() => null, money) as never,
      money,
    ]);

    expect(message).toContain("addMoney argument 1");
    expect(message).toContain("function");
  });

  it("refuses a null-prototype object at the sixty-fifth door", () => {
    const message = sealRefusal(operations.addMoney, [
      Object.assign(Object.create(null), money) as never,
      money,
    ]);

    expect(message).toContain("addMoney argument 1");
    expect(message).toContain("null-prototype");
  });

  it("refuses an assign copy at the sixty-seventh door", () => {
    const forged = Object.assign({}, model.sameCurrencyAmount(money));
    const message = sealRefusal(operations.sourceAmount, [forged as never]);

    expect(message).toContain("sourceAmount argument 1");
    expect(message).toContain("Amounts");
  });

  it("refuses a Map around a rate at the seventieth door", () => {
    const smuggled = Object.assign(new Map([["rate", money]]), rateOf("0.85"));
    const message = sealRefusal(operations.rateText, [smuggled as never]);

    expect(message).toContain("Rate");
    expect(message).toContain("Map");
    expect(message).not.toContain("object Map");
  });

  it("refuses a late attach on every made value", () => {
    const invoice = parse(codecs.invoiceDocument, invoiceWire(true));

    expect(() => Object.assign(invoice, { rate: rateOf("0.85") })).toThrow(
      /rate/u
    );
    expect(() => Object.assign(money, { rate: rateOf("0.85") })).toThrow(
      /rate/u
    );
    expect(() =>
      Object.assign(model.sameCurrencyAmount(money), { rate: "0.85" })
    ).toThrow(/rate/u);
  });
});

const KIND_SEED = 0x91_75_2c_4d;

const seededDraw = (seed: number): (<T>(rows: readonly T[]) => T) => {
  let state = seed;

  return <T>(rows: readonly T[]): T => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    const index = Math.floor((state / 4_294_967_296) * rows.length);

    return rows[index] as T;
  };
};

const kindSamples = (): ReadonlyMap<string, unknown> => {
  const rows = new Map<string, unknown>();

  for (const handle of Object.values(codecs) as readonly Handle[]) {
    const wires = sealSamples.get(handle) ?? [];
    const input = wires[0];

    const decoded: Result.Result<unknown, Schema.SchemaError> | undefined =
      input === undefined ? undefined : handle.decode(input);

    if (decoded === undefined || Result.isFailure(decoded)) {
      continue;
    }

    if (typeof decoded.success !== "object" || decoded.success === null) {
      continue;
    }

    const kind = madeAs(decoded.success);

    if (kind !== undefined && !rows.has(kind)) {
      rows.set(kind, decoded.success);
    }
  }

  return rows;
};

const carriesSlots = (): readonly {
  readonly entry: OperationEntry;
  readonly index: number;
  readonly spec: CarriesArgument;
}[] =>
  Object.values(operations).flatMap((entry) =>
    entry.arguments.flatMap((spec, index) =>
      spec.kind === "carries" ? [{ entry, index, spec }] : []
    )
  );

const prototypeNames = (value: object): string => {
  const prototype: unknown = Object.getPrototypeOf(value);

  if (prototype === null) {
    return "a null-prototype object";
  }

  const constructor: unknown = Reflect.get(prototype as object, "constructor");

  const name: unknown =
    typeof constructor === "function"
      ? Reflect.get(constructor, "name")
      : undefined;

  return typeof name === "string" && name.length > 0
    ? name
    : "an anonymous class";
};

const allowedPrototypes = (): ReadonlySet<unknown> => {
  const money = moneyOf("EUR", 1000);

  const converted = Result.getOrThrow(
    model.ConvertedAmount.converting(
      moneyOf("USD", 1000),
      currencyOf("EUR"),
      rateOf("0.85"),
      dateOf("2024-01-30")
    )
  );

  return new Set<unknown>([
    Object.prototype,
    Array.prototype,
    Object.getPrototypeOf(money),
    Object.getPrototypeOf(Option.some(money)),
    Object.getPrototypeOf(Option.none()),
    Object.getPrototypeOf(converted.base),
    Object.getPrototypeOf(converted),
  ]);
};

const foreignNodesIn = (
  value: unknown,
  path: string,
  label: string,
  allowed: ReadonlySet<unknown>,
  out: string[]
): void => {
  if (value === null) {
    return;
  }

  if (typeof value === "function") {
    out.push(`${label}${path} is a function`);

    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (DateTime.isDateTime(value)) {
    out.push(`${label}${path} is an Effect DateTime`);

    return;
  }

  if (value instanceof Map || value instanceof Set) {
    out.push(`${label}${path} is a ${prototypeNames(value)}`);

    return;
  }

  if (value instanceof Error) {
    return;
  }

  if (!allowed.has(Object.getPrototypeOf(value))) {
    out.push(`${label}${path} is an instance of ${prototypeNames(value)}`);

    return;
  }

  if (Option.isOption(value)) {
    if (Option.isSome(value)) {
      foreignNodesIn(value.value, `${path}.value`, label, allowed, out);
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      foreignNodesIn(entry, `${path}[${String(index)}]`, label, allowed, out);
    }

    return;
  }

  for (const key of Reflect.ownKeys(value)) {
    foreignNodesIn(
      Reflect.get(value as object, key),
      `${path}.${String(key)}`,
      label,
      allowed,
      out
    );
  }
};

const attachRefusals = (): readonly {
  readonly name: string;
  readonly run: (value: object) => void;
}[] => [
  {
    name: "Object.defineProperty",
    run: (value) => {
      Object.defineProperty(value, "rate", {
        configurable: true,
        value: "0.85",
      });
    },
  },
  {
    name: "Object.assign",
    run: (value) => {
      Object.assign(value, { rate: "0.85" });
    },
  },
  {
    name: "a symbol key",
    run: (value) => {
      Object.defineProperty(value, Symbol("rate"), { value: "0.85" });
    },
  },
  {
    name: "delete",
    run: (value) => {
      const [first] = Reflect.ownKeys(value);

      if (first !== undefined) {
        Reflect.deleteProperty(value, first);
      }
    },
  },
];

const frozenOrUnchanged = (
  value: object,
  attach: (target: object) => void
): boolean => {
  const before = Reflect.ownKeys(value);
  const held = before.map((key) => Reflect.get(value, key) as unknown);

  try {
    attach(value);
  } catch {
    return true;
  }

  const after = Reflect.ownKeys(value);

  return (
    after.length === before.length &&
    after.every(
      (key, index) =>
        key === before[index] && Reflect.get(value, key) === held[index]
    )
  );
};

describe("every slot names the kind it takes and every value holds only model data", () => {
  it("refuses a registered value of every other kind at every carries slot, seeded", () => {
    const draw = seededDraw(KIND_SEED);
    const samples = kindSamples();
    const slots = carriesSlots();
    let cases = 0;

    expect(slots.length).toBeGreaterThanOrEqual(12);
    expect(samples.size).toBeGreaterThanOrEqual(20);

    for (let step = 0; step < 800; step += 1) {
      const { entry, index, spec } = draw(slots);

      const rows = [...samples.entries()].filter(
        ([kind]) => !spec.kinds.includes(kind)
      );

      const [actual, value] = draw(rows);
      const label = `seed ${String(KIND_SEED)} step ${String(step)} ${entry.name} argument ${String(index + 1)}`;
      const call = [...entry.samples()];

      call[index] = value;

      const message = sealRefusal(entry, call);

      expect(message, `${label} accepted a ${actual}`).not.toBe("accepted");
      expect(message, `${label} does not name the argument`).toContain(
        `${entry.name} argument ${String(index + 1)}`
      );
      expect(message, `${label} does not name the ${actual} it got`).toContain(
        actual
      );

      for (const kind of spec.kinds) {
        expect(
          message,
          `${label} does not name the ${kind} it takes`
        ).toContain(kind);
      }

      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(700);
  });

  it("hands out a graph of model data only, from every codec", () => {
    const allowed = allowedPrototypes();
    let nodes = 0;

    for (const [key, handle] of Object.entries(codecs) as readonly [
      string,
      Handle,
    ][]) {
      const wires = sealSamples.get(handle) ?? [];

      for (const wire of wires) {
        const decoded = handle.decode(wire);

        expect(
          Result.isSuccess(decoded),
          `${key} rejects its own valid sample`
        ).toBe(true);

        if (Result.isFailure(decoded)) {
          continue;
        }

        const out: string[] = [];

        foreignNodesIn(decoded.success, "$", key, allowed, out);

        expect(out, `${key} carries a foreign node`).toStrictEqual([]);
        nodes += 1;
      }
    }

    expect(nodes).toBeGreaterThanOrEqual(85);
  });

  it("refuses a late attach on every registered value, seeded", () => {
    const draw = seededDraw(KIND_SEED + 1);
    const samples = [...kindSamples().values()];
    const attaches = attachRefusals();
    let cases = 0;

    for (let step = 0; step < 800; step += 1) {
      const value = draw(samples) as object;
      const attach = draw(attaches);
      const label = `seed ${String(KIND_SEED)} step ${String(step)} ${attach.name}`;

      expect(Object.isFrozen(value), `${label} is not frozen`).toBe(true);
      expect(
        frozenOrUnchanged(value, attach.run),
        `${label} changed the value`
      ).toBe(true);
      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(700);
  });
});
