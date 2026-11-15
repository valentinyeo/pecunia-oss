import { expect, it } from "@effect/vitest";
import { getTableName } from "drizzle-orm";
import { Effect } from "effect";

import { RunLogs } from "../src/schema/d1.js";
import {
  aliasRow,
  archiveTargetRow,
  checkHoldingRow,
  checkPayeeRow,
  checkTransactionRow,
  currencyCases,
  holdingRow,
  integerCases,
  invoiceDocumentRow,
  invoiceExceptionRow,
  invoiceSourceRow,
  memberRow,
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
];

const integerValues = [1.5];

const currencyValues = ["", "eur", "EURO", "123"];

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
      client_payee_id: "payee-other",
      external_id: "transaction-external-cross",
      id: "transaction-cross",
    }),
    name: "a transaction pointing at another profile's client payee",
    parents: [insertStep("payees", otherPayeeRow)],
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
