import { insertStep } from "./sqlite-database.js";
import type { Row, SqlStep } from "./sqlite-database.js";

const createdAt = 1_767_225_600_000;

const laterAt = 1_767_225_900_000;

export const profileRow: Row = {
  base_currency: "EUR",
  created_at: createdAt,
  id: "profile-demo",
  kind: "business",
  name: "Example Ltd",
};

export const otherProfileRow: Row = {
  base_currency: "EUR",
  created_at: createdAt,
  id: "profile-other",
  kind: "personal",
  name: "Demo Person",
};

export const memberRow: Row = {
  created_at: createdAt,
  email: "member@example.com",
  id: "member-demo",
  profile_id: "profile-demo",
  role: "owner",
};

export const checkMemberRow: Row = {
  ...memberRow,
  email: "check@example.com",
  id: "member-check",
};

export const appSettingRow: Row = {
  id: 1,
  locale: "en-GB",
  primary_profile_id: "profile-demo",
  timezone: "Europe/London",
  updated_at: createdAt,
};

export const providerRow: Row = {
  enabled: 1,
  id: "provider-demo",
  kind: "manual",
  label: "Demo Provider",
};

export const accountRow: Row = {
  created_at: createdAt,
  external_id: "account-external-demo",
  id: "account-demo",
  kind: "bank",
  label: "Demo Bank",
  profile_id: "profile-demo",
  provider_id: "wise",
};

export const otherAccountRow: Row = {
  ...accountRow,
  external_id: "account-external-other",
  id: "account-other",
  profile_id: "profile-other",
};

export const checkAccountRow: Row = {
  ...accountRow,
  external_id: "account-external-check",
  id: "account-check",
};

export const platformRow: Row = {
  connector: "manual",
  enabled: 1,
  id: "platform-demo",
  label: "Demo Platform",
};

export const payeeRow: Row = {
  created_at: createdAt,
  id: "payee-demo",
  kind: "client",
  name: "Example Ltd",
  normalized_name: "example-ltd",
  profile_id: "profile-demo",
};

export const otherPayeeRow: Row = {
  ...payeeRow,
  id: "payee-other",
  kind: "merchant",
  name: "Demo Merchant",
  normalized_name: "demo-merchant",
  profile_id: "profile-other",
};

export const checkPayeeRow: Row = {
  ...payeeRow,
  id: "payee-check",
  name: "Check Merchant",
  normalized_name: "check-merchant",
};

export const categoryRow: Row = {
  color: "accent",
  created_at: createdAt,
  id: "category-demo",
  name: "Software",
  profile_id: "profile-demo",
  spending_type: "business",
};

export const otherCategoryRow: Row = {
  ...categoryRow,
  id: "category-other",
  name: "Other Software",
  profile_id: "profile-other",
};

export const checkCategoryRow: Row = {
  ...categoryRow,
  id: "category-check",
  name: "Check Software",
};

export const ruleRow: Row = {
  category_id: "category-demo",
  created_at: createdAt,
  id: "rule-demo",
  kind: "categorize",
  match_field: "merchant",
  match_type: "contains",
  pattern: "Example",
  profile_id: "profile-demo",
  updated_at: createdAt,
};

export const otherRuleRow: Row = {
  ...ruleRow,
  category_id: "category-other",
  id: "rule-other",
  pattern: "Other",
  profile_id: "profile-other",
};

export const checkRuleRow: Row = {
  ...ruleRow,
  id: "rule-check",
  pattern: "Check",
};

export const aliasRow: Row = {
  created_at: createdAt,
  id: "alias-demo",
  match_type: "contains",
  pattern: "EXAMPLE",
  payee_id: "payee-demo",
  profile_id: "profile-demo",
};

export const transactionRow: Row = {
  base_currency: "EUR",
  base_minor: 12_000,
  created_at: createdAt,
  direction: "out",
  external_id: "transaction-external-demo",
  id: "transaction-demo",
  occurred_at: createdAt,
  profile_id: "profile-demo",
  provider_account_id: "account-demo",
  source_currency: "EUR",
  source_minor: 12_000,
  status: "posted",
  updated_at: createdAt,
  value_date: "2026-01-01",
};

export const checkTransactionRow: Row = {
  ...transactionRow,
  external_id: "transaction-external-check",
  fee_currency: "EUR",
  fee_minor: 150,
  id: "transaction-check",
};

export const otherTransactionRow: Row = {
  ...transactionRow,
  external_id: "transaction-external-other",
  id: "transaction-other",
  profile_id: "profile-other",
  provider_account_id: "account-other",
};

export const exchangeRateRow: Row = {
  as_of: "2026-01-01",
  base_currency: "EUR",
  fetched_at: createdAt,
  quote_currency: "USD",
  rate: 1.05,
};

export const holdingRow: Row = {
  asset_type: "etf",
  created_at: createdAt,
  currency: "EUR",
  id: "holding-demo",
  name: "Demo World ETF",
  opened_on: "2026-01-02",
  platform_id: "manual",
  profile_id: "profile-demo",
  quantity_micros: 100_000_000,
  state: "active",
  symbol: "DEMO",
  updated_at: createdAt,
};

export const checkHoldingRow: Row = {
  ...holdingRow,
  cost_basis_currency: "EUR",
  cost_basis_minor: 450_000,
  id: "holding-check",
  last_price_currency: "EUR",
  last_price_minor: 520_000,
  priced_at: createdAt,
  symbol: "CHECK",
};

export const subscriptionRow: Row = {
  base_currency: "EUR",
  category_id: "category-demo",
  created_at: createdAt,
  frequency: "monthly",
  id: "subscription-demo",
  last_charged_on: "2025-12-08",
  next_expected_on: "2026-01-08",
  payee_id: "payee-demo",
  profile_id: "profile-demo",
  status: "confirmed",
  status_changed_at: createdAt,
  typical_base_minor: 29_900,
  typical_currency: "EUR",
  typical_minor: 29_900,
  updated_at: createdAt,
};

export const otherSubscriptionRow: Row = {
  ...subscriptionRow,
  category_id: "category-other",
  id: "subscription-other",
  payee_id: "payee-other",
  profile_id: "profile-other",
};

export const syncRunRow: Row = {
  id: "run-demo",
  kind: "bank_sync",
  lease_expires_at: laterAt,
  lease_owner: "worker-demo",
  profile_id: "profile-demo",
  provider_account_id: "account-demo",
  started_at: createdAt,
  state: "running",
  updated_at: createdAt,
};

export const otherSyncRunRow: Row = {
  ...syncRunRow,
  id: "run-other",
  profile_id: "profile-other",
  provider_account_id: "account-other",
};

export const checkSyncRunRow: Row = {
  ...syncRunRow,
  id: "run-check",
};

export const rejectionRow: Row = {
  created_at: createdAt,
  detail: "Demo Bank returned an account the demo book does not hold.",
  id: "rejection-demo",
  reason: "unknown-account",
  run_id: "run-check",
};

export const archiveTargetRow: Row = {
  blocklist: "[]",
  created_at: createdAt,
  id: "archive-target-demo",
  profile_id: "profile-demo",
  provider: "local",
  root_ref: "demo-archive",
};

export const otherArchiveTargetRow: Row = {
  ...archiveTargetRow,
  id: "archive-target-other",
  profile_id: "profile-other",
};

export const invoiceSourceRow: Row = {
  created_at: createdAt,
  id: "invoice-source-demo",
  pattern: "Demo Design Tool",
  profile_id: "profile-demo",
  updated_at: createdAt,
};

export const invoiceDocumentRow: Row = {
  content_type: "application/pdf",
  created_at: createdAt,
  document_date: "2026-01-05",
  document_type: "invoice",
  id: "document-demo",
  original_filename: "invoice.pdf",
  profile_id: "profile-demo",
  r2_key: "documents/invoice.pdf",
  sha256: "a".repeat(64),
  size_bytes: 4096,
  source: "upload",
};

export const checkInvoiceDocumentRow: Row = {
  ...invoiceDocumentRow,
  amount_currency: "EUR",
  amount_minor: 299_000,
  id: "document-check",
  sha256: "b".repeat(64),
};

export const invoiceExceptionRow: Row = {
  profile_id: "profile-demo",
  reason: "Waiting for the demo vendor receipt.",
  recorded_at: createdAt,
  transaction_id: "transaction-demo",
};

export const taxProfileRow: Row = {
  created_at: createdAt,
  id: "tax-profile-demo",
  jurisdiction: "GB",
  profile_id: "profile-demo",
  year_start_day: 6,
  year_start_month: 4,
};

export const otherTaxProfileRow: Row = {
  ...taxProfileRow,
  created_at: createdAt,
  id: "tax-profile-other",
  profile_id: "profile-other",
};

export const taxObligationRow: Row = {
  amount_currency: "EUR",
  amount_minor: 250_000,
  created_at: createdAt,
  due_on: "2026-01-31",
  id: "obligation-demo",
  kind: "vat",
  period_ends_on: "2025-12-31",
  profile_id: "profile-demo",
  status: "estimated",
  synced_at: createdAt,
  tax_profile_id: "tax-profile-demo",
};

export const reportRow: Row = {
  created_at: createdAt,
  html: "<!doctype html><html><body><h1>Demo report</h1></body></html>",
  id: "report-demo",
  kind: "report",
  profile_id: "profile-demo",
  slug: "demo-report",
  title: "Demo report",
  updated_at: createdAt,
};

export const setupSteps = [
  ["profiles", profileRow],
  ["profiles", otherProfileRow],
  ["provider_accounts", accountRow],
  ["categories", categoryRow],
  ["payees", payeeRow],
  ["members", memberRow],
  ["transactions", transactionRow],
  ["tax_profiles", taxProfileRow],
] as const;

export const checkProfileRow: Row = {
  ...profileRow,
  id: "profile-check",
  name: "Check Ltd",
};

interface IntegerCase {
  readonly columns: readonly string[];
  readonly parents?: readonly SqlStep[];
  readonly row: Row;
  readonly table: string;
}

interface CurrencyCase {
  readonly columns: readonly string[];
  readonly row: Row;
  readonly table: string;
}

export const integerCases: readonly IntegerCase[] = [
  { columns: ["updated_at"], row: appSettingRow, table: "app_setting" },
  { columns: ["created_at"], row: archiveTargetRow, table: "archive_targets" },
  {
    columns: ["archived_at", "created_at"],
    row: checkCategoryRow,
    table: "categories",
  },
  {
    columns: ["fetched_at"],
    row: exchangeRateRow,
    table: "exchange_rates",
  },
  {
    columns: [
      "cost_basis_minor",
      "created_at",
      "last_price_minor",
      "priced_at",
      "quantity_micros",
      "updated_at",
    ],
    row: checkHoldingRow,
    table: "holdings",
  },
  {
    columns: ["amount_minor", "archived_at", "created_at", "size_bytes"],
    row: checkInvoiceDocumentRow,
    table: "invoice_documents",
  },
  {
    columns: ["recorded_at"],
    row: invoiceExceptionRow,
    table: "invoice_exceptions",
  },
  {
    columns: [
      "created_at",
      "retrieval_bookkeeper",
      "retrieval_email",
      "retrieval_portal",
      "retrieval_two_factor",
      "updated_at",
    ],
    row: invoiceSourceRow,
    table: "invoice_sources",
  },
  {
    columns: ["enabled"],
    row: platformRow,
    table: "investment_platforms",
  },
  { columns: ["created_at"], row: checkMemberRow, table: "members" },
  { columns: ["created_at"], row: aliasRow, table: "merchant_aliases" },
  {
    columns: ["archived_at", "created_at"],
    row: checkPayeeRow,
    table: "payees",
  },
  {
    columns: ["archived_at", "created_at"],
    row: checkProfileRow,
    table: "profiles",
  },
  {
    columns: ["archived_at", "created_at", "last_synced_at"],
    row: checkAccountRow,
    table: "provider_accounts",
  },
  { columns: ["enabled"], row: providerRow, table: "providers" },
  {
    columns: ["created_at", "updated_at"],
    row: reportRow,
    table: "reports",
  },
  {
    columns: [
      "created_at",
      "enabled",
      "max_amount_minor",
      "min_amount_minor",
      "priority",
      "updated_at",
    ],
    row: checkRuleRow,
    table: "rules",
  },
  {
    columns: [
      "created_at",
      "occurrence_count",
      "status_changed_at",
      "typical_base_minor",
      "typical_minor",
      "updated_at",
    ],
    row: subscriptionRow,
    table: "subscriptions",
  },
  {
    columns: ["created_at"],
    parents: [insertStep("sync_runs", checkSyncRunRow)],
    row: rejectionRow,
    table: "sync_run_rejections",
  },
  {
    columns: [
      "chunk_index",
      "finished_at",
      "imported",
      "lease_expires_at",
      "rejected",
      "skipped",
      "started_at",
      "updated_at",
    ],
    row: checkSyncRunRow,
    table: "sync_runs",
  },
  {
    columns: ["amount_minor", "created_at", "synced_at"],
    row: taxObligationRow,
    table: "tax_obligations",
  },
  {
    columns: ["created_at", "primary", "year_start_day", "year_start_month"],
    row: { ...taxProfileRow, id: "tax-profile-check" },
    table: "tax_profiles",
  },
  {
    columns: [
      "base_minor",
      "created_at",
      "fee_minor",
      "occurred_at",
      "source_minor",
      "suggested_at",
      "updated_at",
    ],
    row: checkTransactionRow,
    table: "transactions",
  },
];

export const currencyCases: readonly CurrencyCase[] = [
  {
    columns: ["base_currency", "quote_currency"],
    row: exchangeRateRow,
    table: "exchange_rates",
  },
  {
    columns: ["cost_basis_currency", "currency", "last_price_currency"],
    row: checkHoldingRow,
    table: "holdings",
  },
  {
    columns: ["amount_currency"],
    row: checkInvoiceDocumentRow,
    table: "invoice_documents",
  },
  { columns: ["base_currency"], row: checkProfileRow, table: "profiles" },
  {
    columns: ["base_currency", "typical_currency"],
    row: subscriptionRow,
    table: "subscriptions",
  },
  {
    columns: ["amount_currency"],
    row: taxObligationRow,
    table: "tax_obligations",
  },
  {
    columns: ["base_currency", "fee_currency", "source_currency"],
    row: checkTransactionRow,
    table: "transactions",
  },
];
