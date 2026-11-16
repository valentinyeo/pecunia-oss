import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  check,
  customType,
  foreignKey,
  uniqueIndex,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const nocaseText = customType<{ data: string; driverData: string }>({
  dataType: () => "text COLLATE NOCASE",
});

const integerChecks = (
  table: string,
  columns: readonly AnySQLiteColumn[]
): readonly ReturnType<typeof check>[] =>
  columns.map((column) =>
    check(
      `${table}_${column.name}_integer_check`,
      column.notNull
        ? sql`typeof(${column}) = 'integer' AND ${column} BETWEEN -9007199254740991 AND 9007199254740991`
        : sql`${column} IS NULL OR (typeof(${column}) = 'integer' AND ${column} BETWEEN -9007199254740991 AND 9007199254740991)`
    )
  );

const booleanChecks = (
  table: string,
  columns: readonly AnySQLiteColumn[]
): readonly ReturnType<typeof check>[] =>
  columns.map((column) =>
    check(`${table}_${column.name}_boolean_check`, sql`${column} IN (0, 1)`)
  );

const currencyCodeCheck = (column: AnySQLiteColumn) =>
  sql`typeof(${column}) = 'text' AND length(${column}) = 3 AND instr(${column}, char(0)) = 0 AND ${column} GLOB '[A-Z][A-Z][A-Z]'`;

const currencyCodeChecks = (
  table: string,
  columns: readonly AnySQLiteColumn[]
): readonly ReturnType<typeof check>[] =>
  columns.map((column) =>
    check(
      `${table}_${column.name}_code_check`,
      column.notNull
        ? currencyCodeCheck(column)
        : sql`${column} IS NULL OR (${currencyCodeCheck(column)})`
    )
  );

const finiteRateCheck = (column: AnySQLiteColumn) =>
  sql`typeof(${column}) = 'real' AND ${column} > 0 AND ${column} < 1e300`;

const dateOnlyCheck = (column: AnySQLiteColumn) =>
  sql`typeof(${column}) = 'text' AND length(${column}) = 10 AND ${column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`;

const dateOnlyChecks = (
  table: string,
  columns: readonly AnySQLiteColumn[]
): readonly ReturnType<typeof check>[] =>
  columns.map((column) =>
    check(
      `${table}_${column.name}_date_check`,
      column.notNull
        ? dateOnlyCheck(column)
        : sql`${column} IS NULL OR (${dateOnlyCheck(column)})`
    )
  );

const blankWhitespace = sql`' ' || char(9) || char(10) || char(13)`;

const trimmedTextCheck = (column: AnySQLiteColumn) =>
  sql`typeof(${column}) = 'text' AND length(trim(${column}, ${blankWhitespace})) > 0`;

const notBlankChecks = (
  table: string,
  columns: readonly AnySQLiteColumn[]
): readonly ReturnType<typeof check>[] =>
  columns.map((column) =>
    check(`${table}_${column.name}_check`, trimmedTextCheck(column))
  );

export const RunLogs = sqliteTable(
  "run_logs",
  {
    capability: text("capability").notNull(),
    failureTag: text("failure_tag"),
    id: text("id").notNull(),
    outcome: text("outcome").notNull(),
    personId: text("person_id").notNull(),
    recordedAt: integer("recorded_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("run_logs_person_recent_idx").on(
      table.personId,
      table.recordedAt,
      table.id
    ),
    ...integerChecks("run_logs", [table.recordedAt]),
    check(
      "run_logs_outcome_check",
      sql`${table.outcome} IN ('Succeeded', 'Failed')`
    ),
    check(
      "run_logs_failure_tag_check",
      sql`(${table.outcome} = 'Succeeded' AND ${table.failureTag} IS NULL) OR (${table.outcome} = 'Failed' AND ${table.failureTag} IS NOT NULL)`
    ),
  ]
);

export const Profiles = sqliteTable(
  "profiles",
  {
    archivedAt: integer("archived_at"),
    baseCurrency: text("base_currency").notNull(),
    createdAt: integer("created_at").notNull(),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("profiles_name_idx").on(table.name),
    uniqueIndex("profiles_id_base_currency_idx").on(
      table.id,
      table.baseCurrency
    ),
    ...integerChecks("profiles", [table.archivedAt, table.createdAt]),
    ...currencyCodeChecks("profiles", [table.baseCurrency]),
    check(
      "profiles_kind_check",
      sql`${table.kind} IN ('personal', 'business')`
    ),
  ]
);

export const Members = sqliteTable(
  "members",
  {
    createdAt: integer("created_at").notNull(),
    email: nocaseText("email").notNull(),
    id: text("id").notNull(),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    role: text("role").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("members_profile_email_idx").on(table.profileId, table.email),
    index("members_email_idx").on(table.email),
    ...integerChecks("members", [table.createdAt]),
    ...notBlankChecks("members", [table.email]),
    check("members_role_check", sql`${table.role} IN ('owner', 'viewer')`),
  ]
);

export const AppSetting = sqliteTable(
  "app_setting",
  {
    id: integer("id").primaryKey().notNull(),
    locale: text("locale").notNull(),
    primaryProfileId: text("primary_profile_id")
      .notNull()
      .references(() => Profiles.id),
    timezone: text("timezone").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    ...integerChecks("app_setting", [table.updatedAt]),
    check("app_setting_singleton_check", sql`${table.id} = 1`),
  ]
);

export const Providers = sqliteTable(
  "providers",
  {
    enabled: integer("enabled").notNull().default(1),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    ...integerChecks("providers", [table.enabled]),
    ...booleanChecks("providers", [table.enabled]),
    check(
      "providers_kind_check",
      sql`${table.kind} IN ('bank', 'investment', 'books', 'csv', 'manual')`
    ),
  ]
);

export const ProviderAccounts = sqliteTable(
  "provider_accounts",
  {
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    credentialKey: text("credential_key"),
    externalId: text("external_id").notNull(),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    lastSyncedAt: integer("last_synced_at"),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    providerId: text("provider_id")
      .notNull()
      .references(() => Providers.id),
    syncStartDate: text("sync_start_date"),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("provider_accounts_account_idx").on(
      table.profileId,
      table.providerId,
      table.externalId
    ),
    uniqueIndex("provider_accounts_profile_id_idx").on(
      table.profileId,
      table.id
    ),
    index("provider_accounts_profile_idx").on(table.profileId),
    ...integerChecks("provider_accounts", [
      table.archivedAt,
      table.createdAt,
      table.lastSyncedAt,
    ]),
    ...dateOnlyChecks("provider_accounts", [table.syncStartDate]),
    check(
      "provider_accounts_kind_check",
      sql`${table.kind} IN ('bank', 'investment', 'books', 'csv', 'manual')`
    ),
  ]
);

export const InvestmentPlatforms = sqliteTable(
  "investment_platforms",
  {
    connector: text("connector").notNull(),
    enabled: integer("enabled").notNull().default(1),
    id: text("id").notNull(),
    label: text("label").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    ...integerChecks("investment_platforms", [table.enabled]),
    ...booleanChecks("investment_platforms", [table.enabled]),
    check(
      "investment_platforms_connector_check",
      sql`${table.connector} IN ('trading212', 'manual')`
    ),
  ]
);

export const Categories = sqliteTable(
  "categories",
  {
    archivedAt: integer("archived_at"),
    color: text("color").notNull(),
    createdAt: integer("created_at").notNull(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    spendingType: text("spending_type").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("categories_profile_name_idx").on(table.profileId, table.name),
    uniqueIndex("categories_profile_id_idx").on(table.profileId, table.id),
    index("categories_profile_parent_idx").on(table.profileId, table.parentId),
    foreignKey({
      columns: [table.profileId, table.parentId],
      foreignColumns: [table.profileId, table.id],
    }),
    ...integerChecks("categories", [table.archivedAt, table.createdAt]),
    check(
      "categories_spending_type_check",
      sql`${table.spendingType} IN ('personal', 'business', 'mixed')`
    ),
    check(
      "categories_parent_check",
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`
    ),
  ]
);

export const Payees = sqliteTable(
  "payees",
  {
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    defaultCategoryId: text("default_category_id"),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("payees_profile_name_idx").on(
      table.profileId,
      table.normalizedName
    ),
    uniqueIndex("payees_profile_id_idx").on(table.profileId, table.id),
    index("payees_profile_kind_idx").on(table.profileId, table.kind),
    foreignKey({
      columns: [table.profileId, table.defaultCategoryId],
      foreignColumns: [Categories.profileId, Categories.id],
    }),
    ...integerChecks("payees", [table.archivedAt, table.createdAt]),
    check(
      "payees_kind_check",
      sql`${table.kind} IN ('merchant', 'client', 'employer', 'tax_authority')`
    ),
  ]
);

export const Rules = sqliteTable(
  "rules",
  {
    categoryId: text("category_id"),
    clientPayeeId: text("client_payee_id"),
    counterpartProfileId: text("counterpart_profile_id").references(
      () => Profiles.id
    ),
    createdAt: integer("created_at").notNull(),
    direction: text("direction").notNull().default("any"),
    enabled: integer("enabled").notNull().default(1),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    matchField: text("match_field").notNull(),
    matchType: text("match_type").notNull(),
    maxAmountMinor: integer("max_amount_minor"),
    minAmountMinor: integer("min_amount_minor"),
    obligationKind: text("obligation_kind"),
    pattern: text("pattern").notNull(),
    priority: integer("priority").notNull().default(0),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("rules_profile_priority_idx").on(
      table.profileId,
      table.enabled,
      sql`${table.priority} DESC`
    ),
    uniqueIndex("rules_profile_id_idx").on(table.profileId, table.id),
    uniqueIndex("rules_match_idx").on(
      table.profileId,
      table.kind,
      table.matchField,
      table.matchType,
      table.pattern,
      table.direction,
      sql`coalesce(${table.minAmountMinor}, -1)`,
      sql`coalesce(${table.maxAmountMinor}, -1)`
    ),
    foreignKey({
      columns: [table.profileId, table.categoryId],
      foreignColumns: [Categories.profileId, Categories.id],
    }),
    foreignKey({
      columns: [table.profileId, table.clientPayeeId],
      foreignColumns: [Payees.profileId, Payees.id],
    }),
    ...integerChecks("rules", [
      table.createdAt,
      table.enabled,
      table.maxAmountMinor,
      table.minAmountMinor,
      table.priority,
      table.updatedAt,
    ]),
    ...booleanChecks("rules", [table.enabled]),
    ...notBlankChecks("rules", [table.pattern]),
    check(
      "rules_kind_check",
      sql`${table.kind} IN ('categorize', 'self_transfer', 'refund', 'internal_transfer', 'exclude', 'income_client', 'tax_payment')`
    ),
    check(
      "rules_match_field_check",
      sql`${table.matchField} IN ('merchant', 'reference', 'description')`
    ),
    check(
      "rules_match_type_check",
      sql`${table.matchType} IN ('exact', 'contains', 'prefix', 'digits_only')`
    ),
    check(
      "rules_direction_check",
      sql`${table.direction} IN ('any', 'in', 'out')`
    ),
    check(
      "rules_amount_bounds_check",
      sql`(${table.minAmountMinor} IS NULL OR ${table.minAmountMinor} >= 0) AND (${table.maxAmountMinor} IS NULL OR ${table.maxAmountMinor} >= 0) AND (${table.minAmountMinor} IS NULL OR ${table.maxAmountMinor} IS NULL OR ${table.minAmountMinor} <= ${table.maxAmountMinor})`
    ),
    check(
      "rules_target_check",
      sql`(${table.kind} = 'categorize' AND ${table.categoryId} IS NOT NULL AND ${table.clientPayeeId} IS NULL AND ${table.counterpartProfileId} IS NULL AND ${table.obligationKind} IS NULL) OR (${table.kind} = 'income_client' AND ${table.clientPayeeId} IS NOT NULL AND ${table.categoryId} IS NULL AND ${table.counterpartProfileId} IS NULL AND ${table.obligationKind} IS NULL) OR (${table.kind} = 'tax_payment' AND ${table.obligationKind} IS NOT NULL AND ${table.categoryId} IS NULL AND ${table.clientPayeeId} IS NULL AND ${table.counterpartProfileId} IS NULL) OR (${table.kind} = 'self_transfer' AND ${table.categoryId} IS NULL AND ${table.clientPayeeId} IS NULL AND ${table.obligationKind} IS NULL) OR (${table.kind} IN ('refund', 'internal_transfer', 'exclude') AND ${table.categoryId} IS NULL AND ${table.clientPayeeId} IS NULL AND ${table.counterpartProfileId} IS NULL AND ${table.obligationKind} IS NULL)`
    ),
  ]
);

export const MerchantAliases = sqliteTable(
  "merchant_aliases",
  {
    createdAt: integer("created_at").notNull(),
    id: text("id").notNull(),
    matchType: text("match_type").notNull(),
    pattern: text("pattern").notNull(),
    payeeId: text("payee_id").notNull(),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("merchant_aliases_match_idx").on(
      table.profileId,
      table.matchType,
      table.pattern
    ),
    index("merchant_aliases_pattern_idx").on(table.profileId, table.pattern),
    foreignKey({
      columns: [table.profileId, table.payeeId],
      foreignColumns: [Payees.profileId, Payees.id],
    }),
    ...integerChecks("merchant_aliases", [table.createdAt]),
    ...notBlankChecks("merchant_aliases", [table.pattern]),
    check(
      "merchant_aliases_match_type_check",
      sql`${table.matchType} IN ('exact', 'prefix', 'contains')`
    ),
  ]
);

export const SyncRuns = sqliteTable(
  "sync_runs",
  {
    chunkIndex: integer("chunk_index").notNull().default(0),
    failureMessage: text("failure_message"),
    failureTag: text("failure_tag"),
    finishedAt: integer("finished_at"),
    id: text("id").notNull(),
    imported: integer("imported").notNull().default(0),
    kind: text("kind").notNull(),
    leaseExpiresAt: integer("lease_expires_at").notNull(),
    leaseOwner: text("lease_owner").notNull(),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    providerAccountId: text("provider_account_id"),
    rejected: integer("rejected").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    startedAt: integer("started_at").notNull(),
    state: text("state").notNull(),
    updatedAt: integer("updated_at").notNull(),
    windowFrom: text("window_from"),
    windowTo: text("window_to"),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("sync_runs_one_open_per_account")
      .on(table.providerAccountId)
      .where(sql`${table.state} IN ('running', 'chunk_done', 'categorizing')`),
    uniqueIndex("sync_runs_one_open_without_account")
      .on(table.profileId, table.kind)
      .where(
        sql`${table.providerAccountId} IS NULL AND ${table.state} IN ('running', 'chunk_done', 'categorizing')`
      ),
    uniqueIndex("sync_runs_profile_id_idx").on(table.profileId, table.id),
    index("sync_runs_profile_started_idx").on(
      table.profileId,
      sql`${table.startedAt} DESC`
    ),
    index("sync_runs_state_lease_idx").on(table.state, table.leaseExpiresAt),
    foreignKey({
      columns: [table.profileId, table.providerAccountId],
      foreignColumns: [ProviderAccounts.profileId, ProviderAccounts.id],
    }),
    ...integerChecks("sync_runs", [
      table.chunkIndex,
      table.finishedAt,
      table.imported,
      table.leaseExpiresAt,
      table.rejected,
      table.skipped,
      table.startedAt,
      table.updatedAt,
    ]),
    ...dateOnlyChecks("sync_runs", [table.windowFrom, table.windowTo]),
    check(
      "sync_runs_kind_check",
      sql`${table.kind} IN ('bank_sync', 'categorization')`
    ),
    check(
      "sync_runs_state_check",
      sql`${table.state} IN ('running', 'chunk_done', 'categorizing', 'succeeded', 'failed', 'cancelled')`
    ),
    check(
      "sync_runs_finished_check",
      sql`(${table.state} IN ('succeeded', 'failed', 'cancelled')) = (${table.finishedAt} IS NOT NULL)`
    ),
    check(
      "sync_runs_failure_check",
      sql`${table.state} <> 'failed' OR ${table.failureTag} IS NOT NULL`
    ),
  ]
);

export const SyncRunRejections = sqliteTable(
  "sync_run_rejections",
  {
    createdAt: integer("created_at").notNull(),
    detail: text("detail").notNull(),
    externalId: text("external_id"),
    id: text("id").notNull(),
    reason: text("reason").notNull(),
    runId: text("run_id")
      .notNull()
      .references(() => SyncRuns.id),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("sync_run_rejections_run_idx").on(table.runId),
    ...integerChecks("sync_run_rejections", [table.createdAt]),
  ]
);

export const Transactions = sqliteTable(
  "transactions",
  {
    appliedRuleId: text("applied_rule_id"),
    baseCurrency: text("base_currency").notNull(),
    baseMinor: integer("base_minor").notNull(),
    categorization: text("categorization").notNull().default("none"),
    categoryId: text("category_id"),
    classification: text("classification").notNull().default("none"),
    classificationRuleId: text("classification_rule_id"),
    clientPayeeId: text("client_payee_id"),
    counterpartProfileId: text("counterpart_profile_id").references(
      () => Profiles.id
    ),
    createdAt: integer("created_at").notNull(),
    direction: text("direction").notNull(),
    externalId: text("external_id").notNull(),
    feeCurrency: text("fee_currency"),
    feeMinor: integer("fee_minor"),
    id: text("id").notNull(),
    importRunId: text("import_run_id"),
    note: text("note").notNull().default(""),
    occurredAt: integer("occurred_at").notNull(),
    payeeId: text("payee_id"),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    providerAccountId: text("provider_account_id").notNull(),
    rate: real("rate"),
    rateAsOf: text("rate_as_of"),
    rawDescription: text("raw_description").notNull().default(""),
    rawMerchant: text("raw_merchant").notNull().default(""),
    rawReference: text("raw_reference").notNull().default(""),
    sourceCurrency: text("source_currency").notNull(),
    sourceMinor: integer("source_minor").notNull(),
    status: text("status").notNull(),
    suggestedAt: integer("suggested_at"),
    suggestionModel: text("suggestion_model"),
    updatedAt: integer("updated_at").notNull(),
    valueDate: text("value_date").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("transactions_account_external_idx").on(
      table.providerAccountId,
      table.externalId
    ),
    uniqueIndex("transactions_profile_id_idx").on(table.profileId, table.id),
    index("transactions_profile_recent_idx").on(
      table.profileId,
      sql`${table.occurredAt} DESC`,
      table.id
    ),
    index("transactions_profile_direction_idx").on(
      table.profileId,
      table.direction,
      sql`${table.occurredAt} DESC`
    ),
    index("transactions_profile_payee_idx").on(
      table.profileId,
      table.payeeId,
      sql`${table.occurredAt} DESC`
    ),
    index("transactions_profile_category_idx").on(
      table.profileId,
      table.categoryId,
      sql`${table.occurredAt} DESC`
    ),
    index("transactions_profile_classification_idx").on(
      table.profileId,
      table.classification,
      sql`${table.occurredAt} DESC`
    ),
    index("transactions_profile_merchant_idx").on(
      table.profileId,
      table.rawMerchant
    ),
    foreignKey({
      columns: [table.profileId, table.categoryId],
      foreignColumns: [Categories.profileId, Categories.id],
    }),
    foreignKey({
      columns: [table.profileId, table.payeeId],
      foreignColumns: [Payees.profileId, Payees.id],
    }),
    foreignKey({
      columns: [table.profileId, table.clientPayeeId],
      foreignColumns: [Payees.profileId, Payees.id],
    }),
    foreignKey({
      columns: [table.profileId, table.appliedRuleId],
      foreignColumns: [Rules.profileId, Rules.id],
    }),
    foreignKey({
      columns: [table.profileId, table.classificationRuleId],
      foreignColumns: [Rules.profileId, Rules.id],
    }),
    foreignKey({
      columns: [table.profileId, table.importRunId],
      foreignColumns: [SyncRuns.profileId, SyncRuns.id],
    }),
    foreignKey({
      columns: [table.profileId, table.providerAccountId],
      foreignColumns: [ProviderAccounts.profileId, ProviderAccounts.id],
    }),
    foreignKey({
      columns: [table.profileId, table.baseCurrency],
      foreignColumns: [Profiles.id, Profiles.baseCurrency],
    }),
    ...currencyCodeChecks("transactions", [
      table.sourceCurrency,
      table.baseCurrency,
      table.feeCurrency,
    ]),
    ...integerChecks("transactions", [
      table.baseMinor,
      table.createdAt,
      table.feeMinor,
      table.occurredAt,
      table.sourceMinor,
      table.suggestedAt,
      table.updatedAt,
    ]),
    ...dateOnlyChecks("transactions", [table.rateAsOf, table.valueDate]),
    check(
      "transactions_status_check",
      sql`${table.status} IN ('posted', 'pending', 'reversed')`
    ),
    check(
      "transactions_direction_check",
      sql`${table.direction} IN ('in', 'out', 'neutral')`
    ),
    check(
      "transactions_categorization_check",
      sql`${table.categorization} IN ('none', 'suggested', 'applied', 'confirmed')`
    ),
    check(
      "transactions_classification_check",
      sql`${table.classification} IN ('none', 'income', 'refund', 'self_transfer', 'internal_transfer', 'excluded', 'tax_payment')`
    ),
    check(
      "transactions_categorization_category_check",
      sql`(${table.categoryId} IS NULL) = (${table.categorization} = 'none')`
    ),
    check(
      "transactions_suggested_check",
      sql`(${table.categorization} = 'suggested' AND ${table.suggestionModel} IS NOT NULL AND ${table.suggestedAt} IS NOT NULL) OR (${table.categorization} <> 'suggested' AND ${table.suggestionModel} IS NULL AND ${table.suggestedAt} IS NULL)`
    ),
    check(
      "transactions_applied_rule_check",
      sql`(${table.categorization} = 'applied') = (${table.appliedRuleId} IS NOT NULL)`
    ),
    check(
      "transactions_income_payee_check",
      sql`(${table.classification} = 'income') = (${table.clientPayeeId} IS NOT NULL)`
    ),
    check(
      "transactions_classification_rule_check",
      sql`(${table.classification} = 'none') = (${table.classificationRuleId} IS NULL)`
    ),
    check(
      "transactions_counterpart_profile_check",
      sql`${table.counterpartProfileId} IS NULL OR ${table.classification} = 'self_transfer'`
    ),
    check(
      "transactions_base_amount_check",
      sql`${table.sourceCurrency} <> ${table.baseCurrency} OR ${table.sourceMinor} = ${table.baseMinor}`
    ),
    check(
      "transactions_rate_check",
      sql`(${table.sourceCurrency} = ${table.baseCurrency} AND ${table.rate} IS NULL AND ${table.rateAsOf} IS NULL) OR (${table.sourceCurrency} <> ${table.baseCurrency} AND ${finiteRateCheck(table.rate)} AND ${table.rateAsOf} IS NOT NULL)`
    ),
    check(
      "transactions_rate_amount_check",
      sql`${table.sourceCurrency} = ${table.baseCurrency} OR abs(${table.baseMinor} - ${table.sourceMinor} * ${table.rate}) <= 1 + abs(${table.sourceMinor} * ${table.rate}) / 1000000000000`
    ),
    check(
      "transactions_fee_currency_check",
      sql`${table.feeCurrency} IS NULL OR ${table.feeCurrency} = ${table.sourceCurrency}`
    ),
    check(
      "transactions_fee_pair_check",
      sql`(${table.feeMinor} IS NULL) = (${table.feeCurrency} IS NULL)`
    ),
  ]
);

export const ExchangeRates = sqliteTable(
  "exchange_rates",
  {
    asOf: text("as_of").notNull(),
    baseCurrency: text("base_currency").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rate: real("rate").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.baseCurrency, table.quoteCurrency, table.asOf],
    }),
    index("exchange_rates_quote_as_of_idx").on(
      table.quoteCurrency,
      sql`${table.asOf} DESC`
    ),
    ...currencyCodeChecks("exchange_rates", [
      table.baseCurrency,
      table.quoteCurrency,
    ]),
    ...integerChecks("exchange_rates", [table.fetchedAt]),
    ...dateOnlyChecks("exchange_rates", [table.asOf]),
    check("exchange_rates_rate_check", finiteRateCheck(table.rate)),
  ]
);

export const Holdings = sqliteTable(
  "holdings",
  {
    assetType: text("asset_type").notNull(),
    costBasisCurrency: text("cost_basis_currency"),
    costBasisMinor: integer("cost_basis_minor"),
    createdAt: integer("created_at").notNull(),
    currency: text("currency").notNull(),
    id: text("id").notNull(),
    lastPriceCurrency: text("last_price_currency"),
    lastPriceMinor: integer("last_price_minor"),
    name: text("name").notNull(),
    notes: text("notes").notNull().default(""),
    openedOn: text("opened_on").notNull(),
    platformId: text("platform_id")
      .notNull()
      .references(() => InvestmentPlatforms.id),
    pricedAt: integer("priced_at"),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    quantityMicros: integer("quantity_micros").notNull(),
    state: text("state").notNull(),
    symbol: text("symbol").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("holdings_symbol_idx").on(
      table.profileId,
      table.platformId,
      table.symbol
    ),
    uniqueIndex("holdings_profile_id_idx").on(table.profileId, table.id),
    index("holdings_profile_state_idx").on(table.profileId, table.state),
    ...currencyCodeChecks("holdings", [
      table.currency,
      table.costBasisCurrency,
      table.lastPriceCurrency,
    ]),
    ...integerChecks("holdings", [
      table.costBasisMinor,
      table.createdAt,
      table.lastPriceMinor,
      table.pricedAt,
      table.quantityMicros,
      table.updatedAt,
    ]),
    ...dateOnlyChecks("holdings", [table.openedOn]),
    check(
      "holdings_asset_type_check",
      sql`${table.assetType} IN ('stock', 'etf', 'fund', 'crypto', 'cash')`
    ),
    check(
      "holdings_state_check",
      sql`${table.state} IN ('active', 'pending', 'closed')`
    ),
    check("holdings_quantity_check", sql`${table.quantityMicros} >= 0`),
    check(
      "holdings_cost_basis_pair_check",
      sql`(${table.costBasisMinor} IS NULL) = (${table.costBasisCurrency} IS NULL)`
    ),
    check(
      "holdings_last_price_pair_check",
      sql`(${table.lastPriceMinor} IS NULL) = (${table.lastPriceCurrency} IS NULL)`
    ),
    check(
      "holdings_pending_price_check",
      sql`${table.state} <> 'pending' OR ${table.lastPriceMinor} IS NULL`
    ),
  ]
);

export const Subscriptions = sqliteTable(
  "subscriptions",
  {
    amountCv: real("amount_cv").notNull().default(0),
    baseCurrency: text("base_currency").notNull(),
    categoryId: text("category_id"),
    confidence: real("confidence").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    frequency: text("frequency").notNull(),
    id: text("id").notNull(),
    lastChargedOn: text("last_charged_on").notNull(),
    nextExpectedOn: text("next_expected_on").notNull(),
    notes: text("notes").notNull().default(""),
    occurrenceCount: integer("occurrence_count").notNull().default(0),
    payeeId: text("payee_id").notNull(),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    status: text("status").notNull(),
    statusChangedAt: integer("status_changed_at").notNull(),
    typicalBaseMinor: integer("typical_base_minor").notNull(),
    typicalCurrency: text("typical_currency").notNull(),
    typicalMinor: integer("typical_minor").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("subscriptions_payee_idx").on(table.profileId, table.payeeId),
    index("subscriptions_profile_status_idx").on(table.profileId, table.status),
    foreignKey({
      columns: [table.profileId, table.payeeId],
      foreignColumns: [Payees.profileId, Payees.id],
    }),
    foreignKey({
      columns: [table.profileId, table.categoryId],
      foreignColumns: [Categories.profileId, Categories.id],
    }),
    foreignKey({
      columns: [table.profileId, table.baseCurrency],
      foreignColumns: [Profiles.id, Profiles.baseCurrency],
    }),
    ...currencyCodeChecks("subscriptions", [
      table.baseCurrency,
      table.typicalCurrency,
    ]),
    ...integerChecks("subscriptions", [
      table.createdAt,
      table.occurrenceCount,
      table.statusChangedAt,
      table.typicalBaseMinor,
      table.typicalMinor,
      table.updatedAt,
    ]),
    ...dateOnlyChecks("subscriptions", [
      table.lastChargedOn,
      table.nextExpectedOn,
    ]),
    check(
      "subscriptions_frequency_check",
      sql`${table.frequency} IN ('weekly', 'monthly', 'quarterly', 'annual')`
    ),
    check(
      "subscriptions_status_check",
      sql`${table.status} IN ('detected', 'confirmed', 'dismissed', 'not_recurring', 'cancelled')`
    ),
    check(
      "subscriptions_base_amount_check",
      sql`${table.typicalCurrency} <> ${table.baseCurrency} OR ${table.typicalMinor} = ${table.typicalBaseMinor}`
    ),
    check(
      "subscriptions_confidence_check",
      sql`typeof(${table.confidence}) = 'real' AND ${table.confidence} >= 0 AND ${table.confidence} <= 1`
    ),
    check(
      "subscriptions_amount_cv_check",
      sql`typeof(${table.amountCv}) = 'real' AND ${table.amountCv} >= 0 AND ${table.amountCv} < 1e300`
    ),
  ]
);

export const ArchiveTargets = sqliteTable(
  "archive_targets",
  {
    blocklist: text("blocklist").notNull().default("[]"),
    createdAt: integer("created_at").notNull(),
    id: text("id").notNull(),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    provider: text("provider").notNull(),
    rootRef: text("root_ref").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("archive_targets_profile_provider_idx").on(
      table.profileId,
      table.provider
    ),
    uniqueIndex("archive_targets_profile_id_idx").on(table.profileId, table.id),
    ...integerChecks("archive_targets", [table.createdAt]),
    check(
      "archive_targets_provider_check",
      sql`${table.provider} IN ('drive', 'local', 'none')`
    ),
  ]
);

export const InvoiceSources = sqliteTable(
  "invoice_sources",
  {
    createdAt: integer("created_at").notNull(),
    id: text("id").notNull(),
    loginHint: text("login_hint"),
    notes: text("notes"),
    pattern: text("pattern").notNull(),
    portalUrl: text("portal_url"),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    retrievalBookkeeper: integer("retrieval_bookkeeper").notNull().default(0),
    retrievalEmail: integer("retrieval_email").notNull().default(0),
    retrievalPortal: integer("retrieval_portal").notNull().default(0),
    retrievalTwoFactor: integer("retrieval_two_factor").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
    vendorPayeeId: text("vendor_payee_id"),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("invoice_sources_profile_pattern_idx").on(
      table.profileId,
      table.pattern
    ),
    index("invoice_sources_pattern_idx").on(
      table.profileId,
      sql`${table.pattern} COLLATE NOCASE`
    ),
    foreignKey({
      columns: [table.profileId, table.vendorPayeeId],
      foreignColumns: [Payees.profileId, Payees.id],
    }),
    ...integerChecks("invoice_sources", [
      table.createdAt,
      table.retrievalBookkeeper,
      table.retrievalEmail,
      table.retrievalPortal,
      table.retrievalTwoFactor,
      table.updatedAt,
    ]),
    ...booleanChecks("invoice_sources", [
      table.retrievalBookkeeper,
      table.retrievalEmail,
      table.retrievalPortal,
      table.retrievalTwoFactor,
    ]),
    ...notBlankChecks("invoice_sources", [table.pattern]),
  ]
);

export const InvoiceDocuments = sqliteTable(
  "invoice_documents",
  {
    amountCurrency: text("amount_currency"),
    amountMinor: integer("amount_minor"),
    archiveFailureReason: text("archive_failure_reason"),
    archiveFileId: text("archive_file_id"),
    archiveState: text("archive_state").notNull().default("unarchived"),
    archiveTargetId: text("archive_target_id"),
    archivedAt: integer("archived_at"),
    contentType: text("content_type").notNull(),
    createdAt: integer("created_at").notNull(),
    documentDate: text("document_date").notNull(),
    documentType: text("document_type").notNull(),
    id: text("id").notNull(),
    originalFilename: text("original_filename").notNull(),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    r2Key: text("r2_key").notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    transactionId: text("transaction_id"),
    vendorPayeeId: text("vendor_payee_id"),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("invoice_documents_sha256_idx").on(
      table.profileId,
      table.sha256
    ),
    uniqueIndex("invoice_documents_file_idx")
      .on(table.archiveFileId)
      .where(sql`${table.archiveFileId} IS NOT NULL`),
    index("invoice_documents_profile_date_idx").on(
      table.profileId,
      sql`${table.documentDate} DESC`
    ),
    index("invoice_documents_transaction_idx").on(table.transactionId),
    foreignKey({
      columns: [table.profileId, table.archiveTargetId],
      foreignColumns: [ArchiveTargets.profileId, ArchiveTargets.id],
    }),
    foreignKey({
      columns: [table.profileId, table.transactionId],
      foreignColumns: [Transactions.profileId, Transactions.id],
    }),
    foreignKey({
      columns: [table.profileId, table.vendorPayeeId],
      foreignColumns: [Payees.profileId, Payees.id],
    }),
    ...currencyCodeChecks("invoice_documents", [table.amountCurrency]),
    ...integerChecks("invoice_documents", [
      table.amountMinor,
      table.archivedAt,
      table.createdAt,
      table.sizeBytes,
    ]),
    ...dateOnlyChecks("invoice_documents", [table.documentDate]),
    check(
      "invoice_documents_type_check",
      sql`${table.documentType} IN ('invoice', 'receipt', 'statement', 'credit_note', 'other')`
    ),
    check(
      "invoice_documents_source_check",
      sql`${table.source} IN ('upload', 'agent', 'email', 'legacy_upload')`
    ),
    check(
      "invoice_documents_archive_state_check",
      sql`${table.archiveState} IN ('unarchived', 'reserved', 'archived', 'failed')`
    ),
    check(
      "invoice_documents_amount_pair_check",
      sql`(${table.amountMinor} IS NULL) = (${table.amountCurrency} IS NULL)`
    ),
    check(
      "invoice_documents_sha256_check",
      sql`typeof(${table.sha256}) = 'text' AND length(${table.sha256}) = 64 AND ${table.sha256} NOT GLOB '*[^0-9a-f]*'`
    ),
    check(
      "invoice_documents_unarchived_check",
      sql`${table.archiveState} <> 'unarchived' OR (${table.archiveFileId} IS NULL AND ${table.archiveTargetId} IS NULL AND ${table.archivedAt} IS NULL AND ${table.archiveFailureReason} IS NULL)`
    ),
    check(
      "invoice_documents_reserved_check",
      sql`${table.archiveState} <> 'reserved' OR (${table.archiveFileId} IS NOT NULL AND ${table.archiveTargetId} IS NOT NULL AND ${table.archivedAt} IS NULL AND ${table.archiveFailureReason} IS NULL)`
    ),
    check(
      "invoice_documents_archived_check",
      sql`${table.archiveState} <> 'archived' OR (${table.archiveFileId} IS NOT NULL AND ${table.archiveTargetId} IS NOT NULL AND ${table.archivedAt} IS NOT NULL AND ${table.archiveFailureReason} IS NULL)`
    ),
    check(
      "invoice_documents_failed_check",
      sql`${table.archiveState} <> 'failed' OR (${table.archiveFailureReason} IS NOT NULL AND ${trimmedTextCheck(table.archiveFailureReason)} AND ${table.archiveFileId} IS NULL AND ${table.archiveTargetId} IS NULL AND ${table.archivedAt} IS NULL)`
    ),
  ]
);

export const InvoiceExceptions = sqliteTable(
  "invoice_exceptions",
  {
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    reason: text("reason").notNull(),
    recordedAt: integer("recorded_at").notNull(),
    transactionId: text("transaction_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.transactionId] }),
    index("invoice_exceptions_profile_idx").on(table.profileId),
    foreignKey({
      columns: [table.profileId, table.transactionId],
      foreignColumns: [Transactions.profileId, Transactions.id],
    }),
    ...integerChecks("invoice_exceptions", [table.recordedAt]),
    check("invoice_exceptions_reason_check", trimmedTextCheck(table.reason)),
  ]
);

export const TaxProfiles = sqliteTable(
  "tax_profiles",
  {
    createdAt: integer("created_at").notNull(),
    id: text("id").notNull(),
    jurisdiction: text("jurisdiction").notNull(),
    primary: integer("primary").notNull().default(0),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    yearStartDay: integer("year_start_day").notNull(),
    yearStartMonth: integer("year_start_month").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("tax_profiles_primary_idx")
      .on(table.profileId)
      .where(sql`${table.primary} = 1`),
    uniqueIndex("tax_profiles_profile_id_idx").on(table.profileId, table.id),
    ...integerChecks("tax_profiles", [
      table.createdAt,
      table.primary,
      table.yearStartDay,
      table.yearStartMonth,
    ]),
    ...booleanChecks("tax_profiles", [table.primary]),
    check(
      "tax_profiles_year_start_month_check",
      sql`${table.yearStartMonth} BETWEEN 1 AND 12`
    ),
    check(
      "tax_profiles_year_start_day_check",
      sql`${table.yearStartDay} BETWEEN 1 AND 28`
    ),
  ]
);

export const TaxObligations = sqliteTable(
  "tax_obligations",
  {
    amountCurrency: text("amount_currency").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    booksStatus: text("books_status").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    dueOn: text("due_on").notNull(),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull().default(""),
    periodEndsOn: text("period_ends_on").notNull(),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    settledTransactionId: text("settled_transaction_id"),
    status: text("status").notNull(),
    syncedAt: integer("synced_at").notNull(),
    taxProfileId: text("tax_profile_id").notNull(),
    writeOffReason: text("write_off_reason"),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("tax_obligations_period_idx").on(
      table.taxProfileId,
      table.kind,
      table.periodEndsOn,
      table.dueOn,
      table.label
    ),
    index("tax_obligations_profile_due_idx").on(table.profileId, table.dueOn),
    uniqueIndex("tax_obligations_settled_idx")
      .on(table.settledTransactionId)
      .where(sql`${table.settledTransactionId} IS NOT NULL`),
    foreignKey({
      columns: [table.profileId, table.taxProfileId],
      foreignColumns: [TaxProfiles.profileId, TaxProfiles.id],
    }),
    foreignKey({
      columns: [table.profileId, table.settledTransactionId],
      foreignColumns: [Transactions.profileId, Transactions.id],
    }),
    ...currencyCodeChecks("tax_obligations", [table.amountCurrency]),
    ...integerChecks("tax_obligations", [
      table.amountMinor,
      table.createdAt,
      table.syncedAt,
    ]),
    ...dateOnlyChecks("tax_obligations", [table.dueOn, table.periodEndsOn]),
    check(
      "tax_obligations_status_check",
      sql`${table.status} IN ('estimated', 'paid', 'written_off')`
    ),
    check(
      "tax_obligations_paid_settled_check",
      sql`${table.status} <> 'paid' OR ${table.settledTransactionId} IS NOT NULL`
    ),
    check(
      "tax_obligations_estimated_check",
      sql`${table.status} <> 'estimated' OR ${table.settledTransactionId} IS NULL`
    ),
    check(
      "tax_obligations_write_off_check",
      sql`(${table.status} = 'written_off' AND ${table.writeOffReason} IS NOT NULL AND ${trimmedTextCheck(table.writeOffReason)} AND ${table.settledTransactionId} IS NULL) OR (${table.status} <> 'written_off' AND ${table.writeOffReason} IS NULL)`
    ),
  ]
);

export const Reports = sqliteTable(
  "reports",
  {
    createdAt: integer("created_at").notNull(),
    html: text("html").notNull(),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    profileId: text("profile_id")
      .notNull()
      .references(() => Profiles.id),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("reports_profile_slug_idx").on(table.profileId, table.slug),
    ...integerChecks("reports", [table.createdAt, table.updatedAt]),
    check(
      "reports_kind_check",
      sql`${table.kind} IN ('report', 'exploration')`
    ),
    check(
      "reports_slug_check",
      sql`length(${table.slug}) > 0 AND ${table.slug} NOT GLOB '*[^a-z0-9-]*' AND substr(${table.slug}, 1, 1) GLOB '[a-z0-9]' AND substr(${table.slug}, -1) GLOB '[a-z0-9]' AND instr(${table.slug}, '--') = 0`
    ),
  ]
);
