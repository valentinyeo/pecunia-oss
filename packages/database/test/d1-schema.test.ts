import { expect, it } from "@effect/vitest";
import { getTableName } from "drizzle-orm";
import { Effect } from "effect";

import { RunLogs } from "../src/schema/d1.js";
import {
  accountKindRow,
  aliasRow,
  archiveTargetRow,
  booleanCases,
  checkHoldingRow,
  checkMemberRow,
  checkPayeeRow,
  checkRuleRow,
  checkTransactionRow,
  currencyCases,
  exchangeRateRow,
  holdingRow,
  integerCases,
  invoiceDocumentRow,
  invoiceExceptionRow,
  invoiceSourceRow,
  memberRow,
  nullPrimaryKeyCases,
  otherAccountRow,
  otherArchiveTargetRow,
  otherCategoryRow,
  otherPayeeRow,
  otherRuleRow,
  otherSubscriptionRow,
  otherSyncRunRow,
  otherTaxProfileRow,
  otherTransactionRow,
  payeeRow,
  reportRow,
  ruleRow,
  setupSteps,
  subscriptionRow,
  syncRunRow,
  taxObligationRow,
  transactionRow,
} from "./rows.js";
import {
  insertStep,
  openMigratedDatabase,
  rowCount,
  runStep,
  schemaModule,
} from "./sqlite-database.js";
import type { Row, SqlStep } from "./sqlite-database.js";

const catalogTables = new Set(["investment_platforms", "providers"]);

const operationalTables = new Set<string>([getTableName(RunLogs)]);

const schemaTables: readonly string[] = Object.values(schemaModule).map(
  (table) => getTableName(table)
);

const migratedBook = Effect.gen(function* openBook() {
  const database = yield* openMigratedDatabase;

  for (const [table, row] of setupSteps) {
    runStep(database, insertStep(table, row));
  }

  return database;
});

const rejectedMessage = (run: () => void): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  return "";
};

const foreignKeyMessage = "FOREIGN KEY constraint failed";

interface ConstraintCase {
  readonly constraint: string;
  readonly legal: readonly SqlStep[];
  readonly name: string;
  readonly rejected: readonly SqlStep[];
}

const constraintCases: readonly ConstraintCase[] = [
  {
    constraint: "transactions_categorization_category_check",
    legal: [
      insertStep("transactions", {
        ...transactionRow,
        categorization: "none",
        category_id: null,
        external_id: "transaction-external-legal",
        id: "transaction-legal",
      }),
    ],
    name: "a category on an uncategorized transaction",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        categorization: "none",
        category_id: "category-demo",
        external_id: "transaction-external-rejected",
        id: "transaction-rejected",
      }),
    ],
  },
  {
    constraint: "transactions_rate_check",
    legal: [
      insertStep("transactions", {
        ...transactionRow,
        base_currency: "EUR",
        base_minor: 12_960,
        external_id: "transaction-external-legal",
        id: "transaction-legal",
        rate: 1.08,
        rate_as_of: "2026-01-01",
        source_currency: "USD",
      }),
    ],
    name: "a non-base transaction without a rate",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        external_id: "transaction-external-rejected",
        id: "transaction-rejected",
        source_currency: "USD",
      }),
    ],
  },
  {
    constraint: "transactions_source_currency_code_check",
    legal: [
      insertStep("transactions", {
        ...transactionRow,
        external_id: "transaction-external-legal",
        id: "transaction-legal",
      }),
    ],
    name: "an empty currency pair that a rate check would read as equal",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        base_currency: "",
        external_id: "transaction-external-rejected",
        id: "transaction-rejected",
        source_currency: "",
      }),
    ],
  },
  {
    constraint: "rules_amount_bounds_check",
    legal: [
      insertStep("rules", {
        ...ruleRow,
        category_id: null,
        id: "rule-legal",
        kind: "exclude",
        max_amount_minor: 2000,
        min_amount_minor: 1000,
      }),
    ],
    name: "inverted amount bounds on a rule",
    rejected: [
      insertStep("rules", {
        ...ruleRow,
        category_id: null,
        id: "rule-rejected",
        kind: "exclude",
        max_amount_minor: 1000,
        min_amount_minor: 2000,
      }),
    ],
  },
  {
    constraint: "UNIQUE constraint failed: sync_runs.provider_account_id",
    legal: [
      insertStep("sync_runs", {
        ...syncRunRow,
        id: "run-legal-open",
        provider_account_id: "account-demo",
      }),
      insertStep("sync_runs", {
        ...syncRunRow,
        finished_at: 1_767_225_700_000,
        id: "run-legal-closed",
        provider_account_id: "account-demo",
        state: "succeeded",
      }),
    ],
    name: "two open sync runs for one account",
    rejected: [
      insertStep("sync_runs", {
        ...syncRunRow,
        id: "run-rejected-open",
        provider_account_id: "account-demo",
      }),
    ],
  },
  {
    constraint:
      "UNIQUE constraint failed: sync_runs.profile_id, sync_runs.kind",
    legal: [
      insertStep("sync_runs", {
        ...syncRunRow,
        id: "run-legal-open",
        provider_account_id: null,
        state: "running",
      }),
      insertStep("sync_runs", {
        ...syncRunRow,
        id: "run-legal-closed",
        provider_account_id: null,
        state: "succeeded",
        finished_at: 1_767_225_700_000,
      }),
      insertStep("sync_runs", {
        ...syncRunRow,
        id: "run-legal-other-kind",
        kind: "categorization",
        provider_account_id: null,
        state: "running",
      }),
    ],
    name: "two open sync runs for one profile without an account",
    rejected: [
      insertStep("sync_runs", {
        ...syncRunRow,
        id: "run-rejected-open",
        provider_account_id: null,
        state: "running",
      }),
    ],
  },
  {
    constraint: "tax_obligations_paid_settled_check",
    legal: [
      insertStep("tax_obligations", {
        ...taxObligationRow,
        id: "obligation-legal",
      }),
    ],
    name: "a paid tax obligation without a settled transaction",
    rejected: [
      insertStep("tax_obligations", {
        ...taxObligationRow,
        id: "obligation-rejected",
        status: "paid",
      }),
    ],
  },
  {
    constraint: "invoice_documents_archived_check",
    legal: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        archive_state: "unarchived",
        id: "document-legal",
      }),
    ],
    name: "an archived document without a file id",
    rejected: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        archive_state: "archived",
        id: "document-rejected",
      }),
    ],
  },
  {
    constraint: "holdings_pending_price_check",
    legal: [
      insertStep("holdings", {
        ...holdingRow,
        id: "holding-legal",
      }),
    ],
    name: "a pending holding with a market price",
    rejected: [
      insertStep("holdings", {
        ...holdingRow,
        id: "holding-rejected",
        last_price_currency: "EUR",
        last_price_minor: 150_000,
        state: "pending",
      }),
    ],
  },
  {
    constraint: "rules_target_check",
    legal: [
      insertStep("rules", {
        ...ruleRow,
        category_id: "category-demo",
        id: "rule-legal",
      }),
    ],
    name: "a rule with two targets",
    rejected: [
      insertStep("rules", {
        ...ruleRow,
        category_id: "category-demo",
        client_payee_id: "payee-demo",
        id: "rule-rejected",
      }),
    ],
  },
  {
    constraint: "provider_accounts_kind_check",
    legal: [
      insertStep("provider_accounts", {
        ...accountKindRow,
        id: "account-legal-kind",
      }),
    ],
    name: "a provider account whose kind is outside the declared kinds",
    rejected: [
      insertStep("provider_accounts", {
        ...accountKindRow,
        external_id: "account-external-rejected-kind",
        id: "account-rejected-kind",
        kind: "invalid",
      }),
    ],
  },
  {
    constraint: "UNIQUE constraint failed: index 'rules_match_idx'",
    legal: [
      insertStep("rules", {
        ...ruleRow,
        category_id: null,
        id: "rule-null-bounds-legal",
        kind: "exclude",
        pattern: "Duplicate",
      }),
    ],
    name: "a second identical rule whose bounds are both null",
    rejected: [
      insertStep("rules", {
        ...ruleRow,
        category_id: null,
        id: "rule-null-bounds-rejected",
        kind: "exclude",
        pattern: "Duplicate",
      }),
    ],
  },
  {
    constraint:
      "UNIQUE constraint failed: tax_obligations.settled_transaction_id",
    legal: [
      insertStep("tax_obligations", {
        ...taxObligationRow,
        id: "obligation-legal-paid",
        settled_transaction_id: "transaction-demo",
        status: "paid",
      }),
      insertStep("tax_obligations", {
        ...taxObligationRow,
        id: "obligation-legal-estimated",
        label: "Second quarter",
        period_ends_on: "2026-03-31",
      }),
    ],
    name: "one payment settling two tax obligations",
    rejected: [
      insertStep("tax_obligations", {
        ...taxObligationRow,
        id: "obligation-rejected-paid",
        label: "Third quarter",
        period_ends_on: "2026-06-30",
        settled_transaction_id: "transaction-demo",
        status: "paid",
      }),
    ],
  },
  {
    constraint: "transactions_base_amount_check",
    legal: [
      insertStep("transactions", {
        ...transactionRow,
        external_id: "transaction-external-base-legal",
        id: "transaction-base-legal",
      }),
    ],
    name: "a same-currency transaction whose base amount disagrees",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        base_minor: 1,
        external_id: "transaction-external-base-rejected",
        id: "transaction-base-rejected",
        source_minor: 480_000,
      }),
    ],
  },
  {
    constraint: "transactions_suggested_check",
    legal: [
      insertStep("transactions", {
        ...transactionRow,
        categorization: "confirmed",
        category_id: "category-demo",
        external_id: "transaction-external-confirmed-legal",
        id: "transaction-confirmed-legal",
      }),
    ],
    name: "a confirmed transaction that keeps an AI suggestion payload",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        categorization: "confirmed",
        category_id: "category-demo",
        external_id: "transaction-external-confirmed-rejected",
        id: "transaction-confirmed-rejected",
        suggested_at: 1_767_225_900_000,
        suggestion_model: "demo-model",
      }),
    ],
  },
  {
    constraint: "transactions_classification_rule_check",
    legal: [
      insertStep("rules", ruleRow),
      insertStep("transactions", {
        ...transactionRow,
        classification: "excluded",
        classification_rule_id: "rule-demo",
        external_id: "transaction-external-excluded-legal",
        id: "transaction-excluded-legal",
      }),
    ],
    name: "an excluded transaction with no classification rule",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        classification: "excluded",
        external_id: "transaction-external-excluded-rejected",
        id: "transaction-excluded-rejected",
      }),
    ],
  },
  {
    constraint: "transactions_income_payee_check",
    legal: [
      insertStep("rules", ruleRow),
      insertStep("transactions", {
        ...transactionRow,
        classification: "income",
        classification_rule_id: "rule-demo",
        client_payee_id: "payee-demo",
        external_id: "transaction-external-income-legal",
        id: "transaction-income-legal",
      }),
    ],
    name: "an excluded transaction that names a client payee",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        classification: "excluded",
        classification_rule_id: "rule-demo",
        client_payee_id: "payee-demo",
        external_id: "transaction-external-excluded-payee",
        id: "transaction-excluded-payee",
      }),
    ],
  },
  {
    constraint: "transactions_rate_amount_check",
    legal: [
      insertStep("transactions", {
        ...transactionRow,
        base_minor: 11_000,
        external_id: "transaction-external-conversion-legal",
        id: "transaction-conversion-legal",
        rate: 1.1,
        rate_as_of: "2026-01-01",
        source_currency: "USD",
        source_minor: 10_000,
      }),
    ],
    name: "a foreign-currency transaction whose base amount contradicts its stored rate",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        base_minor: 1,
        external_id: "transaction-external-conversion-rejected",
        id: "transaction-conversion-rejected",
        rate: 1.1,
        rate_as_of: "2026-01-01",
        source_currency: "USD",
        source_minor: 10_000,
      }),
    ],
  },
  {
    constraint: "transactions_suggested_check",
    legal: [
      insertStep("transactions", {
        ...transactionRow,
        categorization: "confirmed",
        category_id: "category-demo",
        external_id: "transaction-external-model-only-legal",
        id: "transaction-model-only-legal",
      }),
    ],
    name: "a confirmed transaction that keeps only a suggestion model",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        categorization: "confirmed",
        category_id: "category-demo",
        external_id: "transaction-external-model-only-rejected",
        id: "transaction-model-only-rejected",
        suggestion_model: "demo-model",
      }),
    ],
  },
  {
    constraint: "transactions_suggested_check",
    legal: [
      insertStep("transactions", {
        ...transactionRow,
        categorization: "confirmed",
        category_id: "category-demo",
        external_id: "transaction-external-time-only-legal",
        id: "transaction-time-only-legal",
      }),
    ],
    name: "a confirmed transaction that keeps only a suggestion timestamp",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        categorization: "confirmed",
        category_id: "category-demo",
        external_id: "transaction-external-time-only-rejected",
        id: "transaction-time-only-rejected",
        suggested_at: 1_767_225_900_000,
      }),
    ],
  },
  {
    constraint: "transactions_rate_as_of_date_check",
    legal: [
      insertStep("transactions", {
        ...transactionRow,
        base_minor: 11_000,
        external_id: "transaction-external-rate-date-legal",
        id: "transaction-rate-date-legal",
        rate: 1.1,
        rate_as_of: "2026-01-01",
        source_currency: "USD",
        source_minor: 10_000,
      }),
    ],
    name: "a foreign-currency transaction whose rate date is not an ISO date",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        base_minor: 11_000,
        external_id: "transaction-external-rate-date-rejected",
        id: "transaction-rate-date-rejected",
        rate: 1.1,
        rate_as_of: "yesterday",
        source_currency: "USD",
        source_minor: 10_000,
      }),
    ],
  },
  {
    constraint: "transactions_rate_as_of_date_check",
    legal: [
      insertStep("transactions", {
        ...transactionRow,
        base_minor: 11_000,
        external_id: "transaction-external-rate-blank-legal",
        id: "transaction-rate-blank-legal",
        rate: 1.1,
        rate_as_of: "2026-01-01",
        source_currency: "USD",
        source_minor: 10_000,
      }),
    ],
    name: "a foreign-currency transaction whose rate date is blank",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        base_minor: 11_000,
        external_id: "transaction-external-rate-blank-rejected",
        id: "transaction-rate-blank-rejected",
        rate: 1.1,
        rate_as_of: "",
        source_currency: "USD",
        source_minor: 10_000,
      }),
    ],
  },
  {
    constraint: "transactions_value_date_date_check",
    legal: [
      insertStep("transactions", {
        ...transactionRow,
        external_id: "transaction-external-value-date-legal",
        id: "transaction-value-date-legal",
        value_date: "2026-01-01",
      }),
    ],
    name: "a transaction whose value date is not an ISO date",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        external_id: "transaction-external-value-date-rejected",
        id: "transaction-value-date-rejected",
        value_date: "yesterday",
      }),
    ],
  },
  {
    constraint: "transactions_value_date_date_check",
    legal: [
      insertStep("transactions", {
        ...transactionRow,
        external_id: "transaction-external-value-blank-legal",
        id: "transaction-value-blank-legal",
        value_date: "2026-01-01",
      }),
    ],
    name: "a transaction whose value date is blank",
    rejected: [
      insertStep("transactions", {
        ...transactionRow,
        external_id: "transaction-external-value-blank-rejected",
        id: "transaction-value-blank-rejected",
        value_date: "",
      }),
    ],
  },
  {
    constraint: "invoice_documents_reserved_check",
    legal: [
      insertStep("archive_targets", archiveTargetRow),
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        archive_file_id: "demo-file-reserved-legal",
        archive_state: "reserved",
        archive_target_id: "archive-target-demo",
        id: "document-reserved-legal",
      }),
    ],
    name: "a reserved document with no archive target",
    rejected: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        archive_file_id: "demo-file-reserved-rejected",
        archive_state: "reserved",
        id: "document-reserved-rejected",
      }),
    ],
  },
  {
    constraint: "invoice_documents_unarchived_check",
    legal: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        archive_state: "unarchived",
        id: "document-unarchived-legal",
      }),
    ],
    name: "an unarchived document that still holds an archive file id",
    rejected: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        archive_file_id: "demo-file-unarchived-rejected",
        archive_state: "unarchived",
        id: "document-unarchived-rejected",
      }),
    ],
  },
  {
    constraint: "invoice_documents_unarchived_check",
    legal: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        archive_state: "unarchived",
        id: "document-unarchived-target-legal",
      }),
    ],
    name: "an unarchived document that still holds an archive target",
    rejected: [
      insertStep("archive_targets", archiveTargetRow),
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        archive_state: "unarchived",
        archive_target_id: "archive-target-demo",
        id: "document-unarchived-target-rejected",
      }),
    ],
  },
  {
    constraint: "invoice_documents_failed_check",
    legal: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        archive_failure_reason: "The demo archive refused the upload.",
        archive_state: "failed",
        id: "document-failed-legal",
      }),
    ],
    name: "a failed document with no archive failure reason",
    rejected: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        archive_state: "failed",
        id: "document-failed-rejected",
      }),
    ],
  },
  {
    constraint: "invoice_documents_failed_check",
    legal: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        archive_failure_reason: "The demo archive refused the upload.",
        archive_state: "failed",
        id: "document-failed-blank-legal",
      }),
    ],
    name: "a failed document whose archive failure reason is blank",
    rejected: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        archive_failure_reason: "   ",
        archive_state: "failed",
        id: "document-failed-blank-rejected",
      }),
    ],
  },
  {
    constraint: "invoice_documents_sha256_check",
    legal: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        id: "document-sha-legal",
        sha256: "c".repeat(64),
      }),
    ],
    name: "a document fingerprint that is not 64 lowercase hex characters",
    rejected: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        id: "document-sha-rejected",
        sha256: "not-a-hash",
      }),
    ],
  },
  {
    constraint: "invoice_documents_sha256_check",
    legal: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        id: "document-sha-case-legal",
        sha256: "c".repeat(64),
      }),
    ],
    name: "a document fingerprint written in uppercase hex",
    rejected: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        id: "document-sha-case-rejected",
        sha256: "C".repeat(64),
      }),
    ],
  },
  {
    constraint: "invoice_documents_sha256_check",
    legal: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        id: "document-sha-length-legal",
        sha256: "c".repeat(64),
      }),
    ],
    name: "a document fingerprint one character short",
    rejected: [
      insertStep("invoice_documents", {
        ...invoiceDocumentRow,
        id: "document-sha-length-rejected",
        sha256: "c".repeat(63),
      }),
    ],
  },
  {
    constraint: "tax_obligations_write_off_check",
    legal: [
      insertStep("tax_obligations", {
        ...taxObligationRow,
        id: "obligation-written-off-legal",
        status: "written_off",
        write_off_reason: "The demo company closed before the demo due date.",
      }),
    ],
    name: "a written-off tax obligation without a reason",
    rejected: [
      insertStep("tax_obligations", {
        ...taxObligationRow,
        id: "obligation-written-off-rejected",
        status: "written_off",
      }),
    ],
  },
  {
    constraint: "tax_obligations_write_off_check",
    legal: [
      insertStep("tax_obligations", {
        ...taxObligationRow,
        id: "obligation-written-off-blank-legal",
        status: "written_off",
        write_off_reason: "The demo company closed before the demo due date.",
      }),
    ],
    name: "a written-off tax obligation whose reason is blank",
    rejected: [
      insertStep("tax_obligations", {
        ...taxObligationRow,
        id: "obligation-written-off-blank-rejected",
        status: "written_off",
        write_off_reason: "   ",
      }),
    ],
  },
  {
    constraint: "tax_obligations_write_off_check",
    legal: [
      insertStep("tax_obligations", {
        ...taxObligationRow,
        id: "obligation-estimated-legal",
      }),
    ],
    name: "an unpaid tax obligation that carries a write-off reason",
    rejected: [
      insertStep("tax_obligations", {
        ...taxObligationRow,
        id: "obligation-estimated-rejected",
        write_off_reason: "The demo company closed before the demo due date.",
      }),
    ],
  },
  {
    constraint: "subscriptions_confidence_check",
    legal: [
      insertStep("subscriptions", {
        ...subscriptionRow,
        confidence: 0.96,
      }),
    ],
    name: "a confidence stored as text",
    rejected: [
      insertStep("subscriptions", {
        ...subscriptionRow,
        confidence: "high",
      }),
    ],
  },
  {
    constraint: "subscriptions_confidence_check",
    legal: [
      insertStep("subscriptions", {
        ...subscriptionRow,
        confidence: 0.96,
      }),
    ],
    name: "a confidence above one",
    rejected: [
      insertStep("subscriptions", {
        ...subscriptionRow,
        confidence: 1.5,
      }),
    ],
  },
  {
    constraint: "subscriptions_confidence_check",
    legal: [
      insertStep("subscriptions", {
        ...subscriptionRow,
        confidence: 0.96,
      }),
    ],
    name: "a negative confidence",
    rejected: [
      insertStep("subscriptions", {
        ...subscriptionRow,
        confidence: -0.1,
      }),
    ],
  },
  {
    constraint: "subscriptions_confidence_check",
    legal: [
      insertStep("subscriptions", {
        ...subscriptionRow,
        confidence: 0.96,
      }),
    ],
    name: "an infinite confidence",
    rejected: [
      insertStep("subscriptions", {
        ...subscriptionRow,
        confidence: Number.POSITIVE_INFINITY,
      }),
    ],
  },
  {
    constraint: "subscriptions_amount_cv_check",
    legal: [
      insertStep("subscriptions", {
        ...subscriptionRow,
        amount_cv: 0.18,
      }),
    ],
    name: "an amount spread stored as text",
    rejected: [
      insertStep("subscriptions", {
        ...subscriptionRow,
        amount_cv: "high",
      }),
    ],
  },
  {
    constraint: "subscriptions_amount_cv_check",
    legal: [
      insertStep("subscriptions", {
        ...subscriptionRow,
        amount_cv: 0.18,
      }),
    ],
    name: "a negative amount spread",
    rejected: [
      insertStep("subscriptions", {
        ...subscriptionRow,
        amount_cv: -0.18,
      }),
    ],
  },
  {
    constraint: "reports_slug_check",
    legal: [
      insertStep("reports", {
        ...reportRow,
        id: "report-slug-legal",
        slug: "demo-report-2025",
      }),
    ],
    name: "a report slug that climbs out of its directory",
    rejected: [
      insertStep("reports", {
        ...reportRow,
        id: "report-slug-traversal-rejected",
        slug: "../other-profile",
      }),
    ],
  },
  {
    constraint: "reports_slug_check",
    legal: [
      insertStep("reports", {
        ...reportRow,
        id: "report-slug-case-legal",
        slug: "demo-report-2025",
      }),
    ],
    name: "a report slug with uppercase letters",
    rejected: [
      insertStep("reports", {
        ...reportRow,
        id: "report-slug-case-rejected",
        slug: "Demo-Report",
      }),
    ],
  },
  {
    constraint: "reports_slug_check",
    legal: [
      insertStep("reports", {
        ...reportRow,
        id: "report-slug-dots-legal",
        slug: "demo-report-2025",
      }),
    ],
    name: "a report slug with two hyphens in a row",
    rejected: [
      insertStep("reports", {
        ...reportRow,
        id: "report-slug-dots-rejected",
        slug: "demo--report",
      }),
    ],
  },
  {
    constraint: "reports_slug_check",
    legal: [
      insertStep("reports", {
        ...reportRow,
        id: "report-slug-dot-legal",
        slug: "demo-report-2025",
      }),
    ],
    name: "a report slug ending in a hyphen",
    rejected: [
      insertStep("reports", {
        ...reportRow,
        id: "report-slug-dot-rejected",
        slug: "demo-report-",
      }),
    ],
  },
  {
    constraint: "members_email_check",
    legal: [insertStep("members", checkMemberRow)],
    name: "a member email that is blank",
    rejected: [
      insertStep("members", {
        ...checkMemberRow,
        email: "   ",
        id: "member-blank-email-rejected",
      }),
    ],
  },
  {
    constraint: "members_email_check",
    legal: [insertStep("members", checkMemberRow)],
    name: "a member email that is empty",
    rejected: [
      insertStep("members", {
        ...checkMemberRow,
        email: "",
        id: "member-empty-email-rejected",
      }),
    ],
  },
  {
    constraint: "rules_pattern_check",
    legal: [insertStep("rules", checkRuleRow)],
    name: "a rule pattern that is blank",
    rejected: [
      insertStep("rules", {
        ...checkRuleRow,
        id: "rule-blank-pattern-rejected",
        pattern: "   ",
      }),
    ],
  },
  {
    constraint: "rules_pattern_check",
    legal: [insertStep("rules", checkRuleRow)],
    name: "a rule pattern that is empty",
    rejected: [
      insertStep("rules", {
        ...checkRuleRow,
        id: "rule-empty-pattern-rejected",
        pattern: "",
      }),
    ],
  },
  {
    constraint: "merchant_aliases_pattern_check",
    legal: [insertStep("merchant_aliases", aliasRow)],
    name: "a merchant alias pattern that is blank",
    rejected: [
      insertStep("merchant_aliases", {
        ...aliasRow,
        id: "alias-blank-pattern-rejected",
        pattern: "   ",
      }),
    ],
  },
  {
    constraint: "invoice_sources_pattern_check",
    legal: [insertStep("invoice_sources", invoiceSourceRow)],
    name: "an invoice source pattern that is empty",
    rejected: [
      insertStep("invoice_sources", {
        ...invoiceSourceRow,
        id: "invoice-source-empty-pattern-rejected",
        pattern: "",
      }),
    ],
  },
];

const integerValues = [1.5];

const firstUnsafeInteger = 2 ** 53;

const currencyValues = ["", "eur", "EURO", "123", "EUR\u0000BAD"];

const booleanValues = [2, -1];

const rejectedRates: readonly {
  readonly label: string;
  readonly rate: number | string | null;
}[] = [
  { label: "a null rate with dated evidence", rate: null },
  { label: "a rate stored as text", rate: "nope" },
  { label: "an infinite rate", rate: Number.POSITIVE_INFINITY },
];

const storedRateCases = rejectedRates.filter(({ rate }) => rate !== null);

interface CrossProfileCase {
  readonly child: SqlStep;
  readonly name: string;
  readonly parents: readonly SqlStep[];
}

const crossProfileCases: readonly CrossProfileCase[] = [
  {
    child: insertStep("transactions", {
      ...transactionRow,
      categorization: "confirmed",
      category_id: "category-other",
      external_id: "transaction-external-cross",
      id: "transaction-cross",
    }),
    name: "a transaction pointing at another profile's category",
    parents: [insertStep("categories", otherCategoryRow)],
  },
  {
    child: insertStep("transactions", {
      ...transactionRow,
      external_id: "transaction-external-cross",
      id: "transaction-cross",
      payee_id: "payee-other",
    }),
    name: "a transaction pointing at another profile's payee",
    parents: [insertStep("payees", otherPayeeRow)],
  },
  {
    child: insertStep("transactions", {
      ...transactionRow,
      classification: "income",
      classification_rule_id: "rule-demo",
      client_payee_id: "payee-other",
      external_id: "transaction-external-cross",
      id: "transaction-cross",
    }),
    name: "a transaction pointing at another profile's client payee",
    parents: [
      insertStep("payees", otherPayeeRow),
      insertStep("rules", ruleRow),
    ],
  },
  {
    child: insertStep("transactions", {
      ...transactionRow,
      external_id: "transaction-external-cross",
      id: "transaction-cross",
      provider_account_id: "account-other",
    }),
    name: "a transaction pointing at another profile's provider account",
    parents: [insertStep("provider_accounts", otherAccountRow)],
  },
  {
    child: insertStep("transactions", {
      ...transactionRow,
      applied_rule_id: "rule-other",
      categorization: "applied",
      category_id: "category-demo",
      external_id: "transaction-external-cross",
      id: "transaction-cross",
    }),
    name: "a transaction pointing at another profile's rule",
    parents: [
      insertStep("categories", otherCategoryRow),
      insertStep("rules", otherRuleRow),
    ],
  },
  {
    child: insertStep("transactions", {
      ...transactionRow,
      external_id: "transaction-external-cross",
      id: "transaction-cross",
      import_run_id: "run-other",
    }),
    name: "a transaction pointing at another profile's import run",
    parents: [
      insertStep("provider_accounts", otherAccountRow),
      insertStep("sync_runs", otherSyncRunRow),
    ],
  },
  {
    child: insertStep("merchant_aliases", {
      ...aliasRow,
      payee_id: "payee-other",
    }),
    name: "a merchant alias pointing at another profile's payee",
    parents: [insertStep("payees", otherPayeeRow)],
  },
  {
    child: insertStep("rules", {
      ...ruleRow,
      category_id: "category-other",
      pattern: "Cross",
    }),
    name: "a rule pointing at another profile's category",
    parents: [insertStep("categories", otherCategoryRow)],
  },
  {
    child: insertStep("rules", {
      ...ruleRow,
      category_id: null,
      client_payee_id: "payee-other",
      kind: "income_client",
      pattern: "Cross",
    }),
    name: "a rule pointing at another profile's client payee",
    parents: [insertStep("payees", otherPayeeRow)],
  },
  {
    child: insertStep("payees", {
      ...payeeRow,
      default_category_id: "category-other",
      id: "payee-cross",
      name: "Cross Merchant",
      normalized_name: "cross-merchant",
    }),
    name: "a payee defaulting to another profile's category",
    parents: [insertStep("categories", otherCategoryRow)],
  },
  {
    child: insertStep("categories", {
      ...otherCategoryRow,
      id: "category-cross",
      name: "Cross Software",
      parent_id: "category-other",
      profile_id: "profile-demo",
    }),
    name: "a category parented by another profile's category",
    parents: [insertStep("categories", otherCategoryRow)],
  },
  {
    child: insertStep("subscriptions", {
      ...subscriptionRow,
      payee_id: "payee-other",
    }),
    name: "a subscription pointing at another profile's payee",
    parents: [insertStep("payees", otherPayeeRow)],
  },
  {
    child: insertStep("subscriptions", {
      ...subscriptionRow,
      category_id: "category-other",
    }),
    name: "a subscription pointing at another profile's category",
    parents: [insertStep("categories", otherCategoryRow)],
  },
  {
    child: insertStep("invoice_documents", {
      ...invoiceDocumentRow,
      transaction_id: "transaction-other",
    }),
    name: "an invoice document pointing at another profile's transaction",
    parents: [
      insertStep("provider_accounts", otherAccountRow),
      insertStep("transactions", otherTransactionRow),
    ],
  },
  {
    child: insertStep("invoice_documents", {
      ...invoiceDocumentRow,
      archive_file_id: "demo-file-cross",
      archive_state: "reserved",
      archive_target_id: "archive-target-other",
    }),
    name: "an invoice document pointing at another profile's archive target",
    parents: [insertStep("archive_targets", otherArchiveTargetRow)],
  },
  {
    child: insertStep("invoice_documents", {
      ...invoiceDocumentRow,
      vendor_payee_id: "payee-other",
    }),
    name: "an invoice document pointing at another profile's vendor",
    parents: [insertStep("payees", otherPayeeRow)],
  },
  {
    child: insertStep("invoice_sources", {
      ...invoiceSourceRow,
      vendor_payee_id: "payee-other",
    }),
    name: "an invoice source pointing at another profile's vendor",
    parents: [insertStep("payees", otherPayeeRow)],
  },
  {
    child: insertStep("invoice_exceptions", {
      ...invoiceExceptionRow,
      transaction_id: "transaction-other",
    }),
    name: "an invoice exception pointing at another profile's transaction",
    parents: [
      insertStep("provider_accounts", otherAccountRow),
      insertStep("transactions", otherTransactionRow),
    ],
  },
  {
    child: insertStep("tax_obligations", {
      ...taxObligationRow,
      tax_profile_id: "tax-profile-other",
    }),
    name: "a tax obligation pointing at another profile's tax profile",
    parents: [insertStep("tax_profiles", otherTaxProfileRow)],
  },
  {
    child: insertStep("tax_obligations", {
      ...taxObligationRow,
      settled_transaction_id: "transaction-other",
      status: "paid",
    }),
    name: "a tax obligation settling another profile's transaction",
    parents: [
      insertStep("provider_accounts", otherAccountRow),
      insertStep("transactions", otherTransactionRow),
    ],
  },
];

const profileColumns: readonly (readonly [string, Row])[] = [
  ["archive_targets", archiveTargetRow],
  ["categories", otherCategoryRow],
  ["holdings", holdingRow],
  ["invoice_documents", invoiceDocumentRow],
  ["invoice_exceptions", invoiceExceptionRow],
  ["invoice_sources", invoiceSourceRow],
  ["merchant_aliases", aliasRow],
  ["payees", checkPayeeRow],
  ["reports", reportRow],
  ["rules", ruleRow],
  ["subscriptions", otherSubscriptionRow],
  ["sync_runs", syncRunRow],
  ["tax_obligations", taxObligationRow],
  ["tax_profiles", otherTaxProfileRow],
  ["transactions", checkTransactionRow],
];

it.effect("migrations create every table the schema declares", () =>
  Effect.gen(function* applyMigrations() {
    const database = yield* openMigratedDatabase;

    const [tables] = database.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    );

    const created = new Set((tables?.values ?? []).map(([name]) => name));

    expect(schemaTables.length).toBeGreaterThan(1);

    for (const table of schemaTables) {
      expect(created).toContain(table);
    }
  })
);

it.effect("numbered migrations ship catalog rows and no demo data", () =>
  Effect.gen(function* checkEmptyBook() {
    const database = yield* openMigratedDatabase;

    for (const table of schemaTables) {
      if (catalogTables.has(table) || operationalTables.has(table)) {
        continue;
      }

      expect(rowCount(database, table)).toBe(0);
    }

    const providers = database.exec("SELECT id FROM providers ORDER BY id");

    expect(providers[0]?.values.map(([id]) => id)).toEqual([
      "csv",
      "freeagent",
      "manual",
      "trading212",
      "wise",
    ]);

    expect(rowCount(database, "investment_platforms")).toBe(3);
  })
);

it.effect.each(constraintCases)(
  "rejects $name",
  ({ constraint, legal, rejected }) =>
    Effect.gen(function* rejectIllegalRow() {
      const database = yield* migratedBook;

      for (const step of legal) {
        runStep(database, step);
      }

      const message = rejectedMessage(() => {
        for (const step of rejected) {
          runStep(database, step);
        }
      });

      expect(message).toContain(constraint);
    })
);

it.effect.each(integerCases)(
  "rejects non-integer values in $table integer columns",
  ({ columns, parents, row, table }) =>
    Effect.gen(function* rejectRealNumber() {
      const database = yield* migratedBook;

      for (const parent of parents ?? []) {
        runStep(database, parent);
      }

      for (const column of columns) {
        for (const value of integerValues) {
          const message = rejectedMessage(() => {
            runStep(database, insertStep(table, { ...row, [column]: value }));
          });

          expect(message, `${table}.${column} = ${String(value)}`).toContain(
            `${table}_${column}_integer_check`
          );
        }
      }
    })
);

it.effect.each(currencyCases)(
  "rejects malformed currency codes in $table",
  ({ columns, row, table }) =>
    Effect.gen(function* rejectBadCurrency() {
      const database = yield* migratedBook;

      for (const column of columns) {
        for (const value of currencyValues) {
          const message = rejectedMessage(() => {
            runStep(database, insertStep(table, { ...row, [column]: value }));
          });

          expect(
            message,
            `${table}.${column} = ${JSON.stringify(value)}`
          ).toContain(`${table}_${column}_code_check`);
        }
      }
    })
);

it.effect.each([
  { column: "quantity_micros", row: checkHoldingRow, table: "holdings" },
  {
    column: "source_minor",
    row: checkTransactionRow,
    table: "transactions",
  },
])(
  "rejects a decimal or text value stored in $table $column",
  ({ column, row, table }) =>
    Effect.gen(function* rejectStoredText() {
      const database = yield* migratedBook;

      for (const value of [10.5, "12.50", "nope"]) {
        const message = rejectedMessage(() => {
          runStep(database, insertStep(table, { ...row, [column]: value }));
        });

        expect(message, `${table}.${column} = ${String(value)}`).toContain(
          `${table}_${column}_integer_check`
        );
      }
    })
);

it.effect.each(
  profileColumns.map(([table, row]) => ({
    name: table.replaceAll("_", " "),
    row,
    table,
  }))
)("rejects a $name row whose profile does not exist", ({ row, table }) =>
  Effect.gen(function* rejectMissingProfile() {
    const database = yield* migratedBook;

    const message = rejectedMessage(() => {
      runStep(
        database,
        insertStep(table, { ...row, profile_id: "profile-missing" })
      );
    });

    expect(message).toContain(foreignKeyMessage);
  })
);

it.effect.each(crossProfileCases)("rejects $name", ({ child, parents }) =>
  Effect.gen(function* rejectCrossProfileLink() {
    const database = yield* migratedBook;

    for (const parent of parents) {
      runStep(database, parent);
    }

    const message = rejectedMessage(() => {
      runStep(database, child);
    });

    expect(message).toContain(foreignKeyMessage);
  })
);

it.effect("rejects a tax obligation whose tax profile does not exist", () =>
  Effect.gen(function* rejectMissingTaxProfile() {
    const database = yield* migratedBook;

    const message = rejectedMessage(() => {
      runStep(
        database,
        insertStep("tax_obligations", {
          ...taxObligationRow,
          tax_profile_id: "tax-profile-missing",
        })
      );
    });

    expect(message).toContain(foreignKeyMessage);
  })
);

it.effect("rejects a sync run whose provider account does not exist", () =>
  Effect.gen(function* rejectMissingAccount() {
    const database = yield* migratedBook;

    const message = rejectedMessage(() => {
      runStep(
        database,
        insertStep("sync_runs", {
          ...syncRunRow,
          provider_account_id: "account-missing",
        })
      );
    });

    expect(message).toContain(foreignKeyMessage);
  })
);

it.effect.each(booleanCases)(
  "rejects a flag outside 0 and 1 in $table",
  ({ columns, row, table }) =>
    Effect.gen(function* rejectNonBooleanFlag() {
      const database = yield* migratedBook;

      for (const column of columns) {
        for (const value of booleanValues) {
          const message = rejectedMessage(() => {
            runStep(database, insertStep(table, { ...row, [column]: value }));
          });

          expect(message, `${table}.${column} = ${String(value)}`).toContain(
            `${table}_${column}_boolean_check`
          );
        }
      }
    })
);

it.effect.each(nullPrimaryKeyCases)(
  "rejects a $table row with no primary key",
  ({ column, parents, row, table }) =>
    Effect.gen(function* rejectNullPrimaryKey() {
      const database = yield* migratedBook;

      for (const parent of parents ?? []) {
        runStep(database, parent);
      }

      const message = rejectedMessage(() => {
        runStep(database, insertStep(table, { ...row, [column]: null }));
      });

      expect(message).toContain(
        `NOT NULL constraint failed: ${table}.${column}`
      );
    })
);

it.effect("rejects an amount above the safe integer range", () =>
  Effect.gen(function* rejectUnsafeAmount() {
    const database = yield* migratedBook;

    const message = rejectedMessage(() => {
      runStep(
        database,
        insertStep("transactions", {
          ...transactionRow,
          external_id: "transaction-external-unsafe",
          id: "transaction-unsafe",
          source_minor: firstUnsafeInteger,
        })
      );
    });

    expect(message).toContain("transactions_source_minor_integer_check");
  })
);

it.effect("rejects a nullable amount above the safe integer range", () =>
  Effect.gen(function* rejectUnsafeFee() {
    const database = yield* migratedBook;

    const message = rejectedMessage(() => {
      runStep(
        database,
        insertStep("transactions", {
          ...checkTransactionRow,
          external_id: "transaction-external-unsafe-fee",
          fee_currency: "EUR",
          fee_minor: firstUnsafeInteger,
          id: "transaction-unsafe-fee",
        })
      );
    });

    expect(message).toContain("transactions_fee_minor_integer_check");
  })
);

it.effect.each(rejectedRates)(
  "rejects $label on a foreign-currency transaction",
  ({ rate }) =>
    Effect.gen(function* rejectUnusableRate() {
      const database = yield* migratedBook;

      const message = rejectedMessage(() => {
        runStep(
          database,
          insertStep("transactions", {
            ...transactionRow,
            external_id: "transaction-external-rate",
            id: "transaction-rate",
            rate,
            rate_as_of: "2026-01-01",
            source_currency: "USD",
          })
        );
      });

      expect(message).toContain("transactions_rate_check");
    })
);

it.effect.each(storedRateCases)(
  "rejects $label in the rate table",
  ({ rate }) =>
    Effect.gen(function* rejectUnusableStoredRate() {
      const database = yield* migratedBook;

      const message = rejectedMessage(() => {
        runStep(
          database,
          insertStep("exchange_rates", { ...exchangeRateRow, rate })
        );
      });

      expect(message).toContain("exchange_rates_rate_check");
    })
);

it.effect(
  "accepts a converted amount within one minor unit of source times rate",
  () =>
    Effect.gen(function* acceptRoundingTolerance() {
      const database = yield* migratedBook;

      for (const baseMinor of [5, 6]) {
        runStep(
          database,
          insertStep("transactions", {
            ...transactionRow,
            base_minor: baseMinor,
            external_id: `transaction-external-rounding-${baseMinor}`,
            id: `transaction-rounding-${baseMinor}`,
            rate: 1.15,
            rate_as_of: "2026-01-01",
            source_currency: "USD",
            source_minor: 5,
          })
        );
      }

      runStep(
        database,
        insertStep("transactions", {
          ...transactionRow,
          base_minor: 9_900_000_000_000,
          external_id: "transaction-external-rounding-large",
          id: "transaction-rounding-large",
          rate: 1.1,
          rate_as_of: "2026-01-01",
          source_currency: "USD",
          source_minor: 9_000_000_000_000,
        })
      );

      const message = rejectedMessage(() => {
        runStep(
          database,
          insertStep("transactions", {
            ...transactionRow,
            base_minor: 7,
            external_id: "transaction-external-rounding-far",
            id: "transaction-rounding-far",
            rate: 1.15,
            rate_as_of: "2026-01-01",
            source_currency: "USD",
            source_minor: 5,
          })
        );
      });

      expect(message).toContain("transactions_rate_amount_check");
    })
);

it.effect("rejects a confidence that is not a number", () =>
  Effect.gen(function* rejectUnnumberedConfidence() {
    const database = yield* migratedBook;

    const message = rejectedMessage(() => {
      runStep(
        database,
        insertStep("subscriptions", {
          ...subscriptionRow,
          confidence: Number.NaN,
        })
      );
    });

    expect(message).toContain(
      "NOT NULL constraint failed: subscriptions.confidence"
    );
  })
);

it.effect("rejects a base currency that differs from the profile's", () =>
  Effect.gen(function* rejectForeignBaseCurrency() {
    const database = yield* migratedBook;

    const message = rejectedMessage(() => {
      runStep(
        database,
        insertStep("transactions", {
          ...transactionRow,
          base_currency: "USD",
          base_minor: 12_000,
          external_id: "transaction-external-base-currency",
          id: "transaction-base-currency",
          source_currency: "USD",
        })
      );
    });

    expect(message).toContain(foreignKeyMessage);
  })
);

it.effect(
  "rejects a subscription base currency that differs from the profile's",
  () =>
    Effect.gen(function* rejectForeignSubscriptionBase() {
      const database = yield* migratedBook;

      const message = rejectedMessage(() => {
        runStep(
          database,
          insertStep("subscriptions", {
            ...subscriptionRow,
            base_currency: "USD",
          })
        );
      });

      expect(message).toContain(foreignKeyMessage);
    })
);

it.effect("rejects a member email that differs only by case", () =>
  Effect.gen(function* rejectCaseVariantEmail() {
    const database = yield* migratedBook;

    const message = rejectedMessage(() => {
      runStep(
        database,
        insertStep("members", {
          ...memberRow,
          email: "MEMBER@EXAMPLE.COM",
          id: "member-case",
        })
      );
    });

    expect(message).toContain(
      "UNIQUE constraint failed: members.profile_id, members.email"
    );
  })
);

it.effect("compares member emails without case", () =>
  Effect.gen(function* readCaseInsensitiveEmail() {
    const database = yield* migratedBook;

    const [members] = database.exec(
      `SELECT id FROM members WHERE email = 'MEMBER@EXAMPLE.COM'`
    );

    expect(members?.values.map(([id]) => id)).toEqual(["member-demo"]);
  })
);

it.effect("serves invoice source lookups that ignore case", () =>
  Effect.gen(function* readCaseInsensitivePattern() {
    const database = yield* migratedBook;

    const [plan] = database.exec(
      `EXPLAIN QUERY PLAN SELECT id FROM invoice_sources WHERE profile_id = 'profile-demo' AND pattern = 'demo design tool' COLLATE NOCASE`
    );

    const detail = (plan?.values ?? []).map((row) => row.join(" ")).join(" ");

    expect(detail).toContain("invoice_sources_pattern_idx");
  })
);

it.effect("rejects a profile that is not referenced by a member row", () =>
  Effect.gen(function* rejectOrphanMember() {
    const database = yield* migratedBook;

    const message = rejectedMessage(() => {
      runStep(
        database,
        insertStep("members", {
          ...memberRow,
          email: "orphan@example.com",
          id: "member-orphan",
          profile_id: "profile-missing",
        })
      );
    });

    expect(message).toContain(foreignKeyMessage);
  })
);
