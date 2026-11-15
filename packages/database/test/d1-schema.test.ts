import { expect, it } from "@effect/vitest";
import { getTableName } from "drizzle-orm";
import { Effect } from "effect";

import { RunLogs } from "../src/schema/d1.js";
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

const profileRow: Row = {
  base_currency: "EUR",
  created_at: 1_767_225_600_000,
  id: "profile-demo",
  kind: "business",
  name: "Example Ltd",
};

const accountRow: Row = {
  created_at: 1_767_225_600_000,
  external_id: "account-external-demo",
  id: "account-demo",
  kind: "bank",
  label: "Demo Bank",
  profile_id: "profile-demo",
  provider_id: "wise",
};

const categoryRow: Row = {
  color: "accent",
  created_at: 1_767_225_600_000,
  id: "category-demo",
  name: "Software",
  profile_id: "profile-demo",
  spending_type: "business",
};

const payeeRow: Row = {
  created_at: 1_767_225_600_000,
  id: "payee-demo",
  kind: "client",
  name: "Example Ltd",
  normalized_name: "example-ltd",
  profile_id: "profile-demo",
};

const transactionRow: Row = {
  base_currency: "EUR",
  base_minor: 12_000,
  created_at: 1_767_225_600_000,
  direction: "out",
  external_id: "transaction-external-demo",
  id: "transaction-demo",
  occurred_at: 1_767_225_600_000,
  profile_id: "profile-demo",
  provider_account_id: "account-demo",
  source_currency: "EUR",
  source_minor: 12_000,
  status: "posted",
  updated_at: 1_767_225_600_000,
  value_date: "2026-01-01",
};

const setupSteps = [
  insertStep("profiles", profileRow),
  insertStep("provider_accounts", accountRow),
  insertStep("categories", categoryRow),
  insertStep("payees", payeeRow),
  insertStep("transactions", transactionRow),
];

const ruleRow: Row = {
  created_at: 1_767_225_600_000,
  id: "rule-demo",
  kind: "categorize",
  match_field: "merchant",
  match_type: "contains",
  pattern: "Example",
  profile_id: "profile-demo",
  updated_at: 1_767_225_600_000,
};

const syncRunRow: Row = {
  id: "run-demo",
  kind: "bank_sync",
  lease_expires_at: 1_767_225_900_000,
  lease_owner: "worker-demo",
  profile_id: "profile-demo",
  started_at: 1_767_225_600_000,
  state: "running",
  updated_at: 1_767_225_600_000,
};

const taxObligationRow: Row = {
  amount_currency: "EUR",
  amount_minor: 250_000,
  created_at: 1_767_225_600_000,
  due_on: "2026-01-31",
  id: "obligation-demo",
  kind: "vat",
  period_ends_on: "2025-12-31",
  profile_id: "profile-demo",
  status: "estimated",
  synced_at: 1_767_225_600_000,
  tax_profile_id: "tax-profile-demo",
};

const invoiceDocumentRow: Row = {
  content_type: "application/pdf",
  created_at: 1_767_225_600_000,
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

const holdingRow: Row = {
  asset_type: "etf",
  created_at: 1_767_225_600_000,
  currency: "EUR",
  id: "holding-demo",
  name: "Demo World ETF",
  opened_on: "2026-01-02",
  platform_id: "generic-broker",
  profile_id: "profile-demo",
  quantity_micros: 100_000_000,
  state: "pending",
  symbol: "DEMO",
  updated_at: 1_767_225_600_000,
};

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
    constraint: "rules_amount_bounds_check",
    legal: [
      insertStep("rules", {
        ...ruleRow,
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
];

const rejectedMessage = (run: () => void): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  return "";
};

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
      const database = yield* openMigratedDatabase;

      for (const step of setupSteps) {
        runStep(database, step);
      }

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
