CREATE TABLE `categories` (
	`archived_at` integer,
	`color` text NOT NULL,
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`profile_id` text NOT NULL,
	`spending_type` text NOT NULL,
	CONSTRAINT `fk_categories_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_categories_profile_id_parent_id_categories_profile_id_id_fk` FOREIGN KEY (`profile_id`,`parent_id`) REFERENCES `categories`(`profile_id`,`id`),
	CONSTRAINT "categories_archived_at_integer_check" CHECK("archived_at" IS NULL OR (typeof("archived_at") = 'integer' AND "archived_at" BETWEEN -9007199254740991 AND 9007199254740991)),
	CONSTRAINT "categories_created_at_integer_check" CHECK(typeof("created_at") = 'integer' AND "created_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "categories_spending_type_check" CHECK("spending_type" IN ('personal', 'business', 'mixed')),
	CONSTRAINT "categories_parent_check" CHECK("parent_id" IS NULL OR "parent_id" <> "id")
);
--> statement-breakpoint
CREATE TABLE `merchant_aliases` (
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`match_type` text NOT NULL,
	`pattern` text NOT NULL,
	`payee_id` text NOT NULL,
	`profile_id` text NOT NULL,
	CONSTRAINT `fk_merchant_aliases_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_merchant_aliases_profile_id_payee_id_payees_profile_id_id_fk` FOREIGN KEY (`profile_id`,`payee_id`) REFERENCES `payees`(`profile_id`,`id`),
	CONSTRAINT "merchant_aliases_created_at_integer_check" CHECK(typeof("created_at") = 'integer' AND "created_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "merchant_aliases_pattern_check" CHECK(typeof("pattern") = 'text' AND length(trim("pattern", ' ' || char(9) || char(10) || char(13))) > 0),
	CONSTRAINT "merchant_aliases_match_type_check" CHECK("match_type" IN ('exact', 'prefix', 'contains'))
);
--> statement-breakpoint
CREATE TABLE `payees` (
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`default_category_id` text,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`profile_id` text NOT NULL,
	CONSTRAINT `fk_payees_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_payees_profile_id_default_category_id_categories_profile_id_id_fk` FOREIGN KEY (`profile_id`,`default_category_id`) REFERENCES `categories`(`profile_id`,`id`),
	CONSTRAINT "payees_archived_at_integer_check" CHECK("archived_at" IS NULL OR (typeof("archived_at") = 'integer' AND "archived_at" BETWEEN -9007199254740991 AND 9007199254740991)),
	CONSTRAINT "payees_created_at_integer_check" CHECK(typeof("created_at") = 'integer' AND "created_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "payees_kind_check" CHECK("kind" IN ('merchant', 'client', 'employer', 'tax_authority'))
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`category_id` text,
	`client_payee_id` text,
	`counterpart_profile_id` text,
	`created_at` integer NOT NULL,
	`direction` text DEFAULT 'any' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`match_field` text NOT NULL,
	`match_type` text NOT NULL,
	`max_amount_minor` integer,
	`min_amount_minor` integer,
	`obligation_kind` text,
	`pattern` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`profile_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_rules_counterpart_profile_id_profiles_id_fk` FOREIGN KEY (`counterpart_profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_rules_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_rules_profile_id_category_id_categories_profile_id_id_fk` FOREIGN KEY (`profile_id`,`category_id`) REFERENCES `categories`(`profile_id`,`id`),
	CONSTRAINT `fk_rules_profile_id_client_payee_id_payees_profile_id_id_fk` FOREIGN KEY (`profile_id`,`client_payee_id`) REFERENCES `payees`(`profile_id`,`id`),
	CONSTRAINT "rules_created_at_integer_check" CHECK(typeof("created_at") = 'integer' AND "created_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "rules_enabled_integer_check" CHECK(typeof("enabled") = 'integer' AND "enabled" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "rules_max_amount_minor_integer_check" CHECK("max_amount_minor" IS NULL OR (typeof("max_amount_minor") = 'integer' AND "max_amount_minor" BETWEEN -9007199254740991 AND 9007199254740991)),
	CONSTRAINT "rules_min_amount_minor_integer_check" CHECK("min_amount_minor" IS NULL OR (typeof("min_amount_minor") = 'integer' AND "min_amount_minor" BETWEEN -9007199254740991 AND 9007199254740991)),
	CONSTRAINT "rules_priority_integer_check" CHECK(typeof("priority") = 'integer' AND "priority" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "rules_updated_at_integer_check" CHECK(typeof("updated_at") = 'integer' AND "updated_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "rules_enabled_boolean_check" CHECK("enabled" IN (0, 1)),
	CONSTRAINT "rules_pattern_check" CHECK(typeof("pattern") = 'text' AND length(trim("pattern", ' ' || char(9) || char(10) || char(13))) > 0),
	CONSTRAINT "rules_kind_check" CHECK("kind" IN ('categorize', 'self_transfer', 'refund', 'internal_transfer', 'exclude', 'income_client', 'tax_payment')),
	CONSTRAINT "rules_match_field_check" CHECK("match_field" IN ('merchant', 'reference', 'description')),
	CONSTRAINT "rules_match_type_check" CHECK("match_type" IN ('exact', 'contains', 'prefix', 'digits_only')),
	CONSTRAINT "rules_direction_check" CHECK("direction" IN ('any', 'in', 'out')),
	CONSTRAINT "rules_amount_bounds_check" CHECK(("min_amount_minor" IS NULL OR "min_amount_minor" >= 0) AND ("max_amount_minor" IS NULL OR "max_amount_minor" >= 0) AND ("min_amount_minor" IS NULL OR "max_amount_minor" IS NULL OR "min_amount_minor" <= "max_amount_minor")),
	CONSTRAINT "rules_target_check" CHECK(("kind" = 'categorize' AND "category_id" IS NOT NULL AND "client_payee_id" IS NULL AND "counterpart_profile_id" IS NULL AND "obligation_kind" IS NULL) OR ("kind" = 'income_client' AND "client_payee_id" IS NOT NULL AND "category_id" IS NULL AND "counterpart_profile_id" IS NULL AND "obligation_kind" IS NULL) OR ("kind" = 'tax_payment' AND "obligation_kind" IS NOT NULL AND "category_id" IS NULL AND "client_payee_id" IS NULL AND "counterpart_profile_id" IS NULL) OR ("kind" = 'self_transfer' AND "category_id" IS NULL AND "client_payee_id" IS NULL AND "obligation_kind" IS NULL) OR ("kind" IN ('refund', 'internal_transfer', 'exclude') AND "category_id" IS NULL AND "client_payee_id" IS NULL AND "counterpart_profile_id" IS NULL AND "obligation_kind" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`applied_rule_id` text,
	`base_currency` text NOT NULL,
	`base_minor` integer NOT NULL,
	`categorization` text DEFAULT 'none' NOT NULL,
	`category_id` text,
	`classification` text DEFAULT 'none' NOT NULL,
	`classification_rule_id` text,
	`client_payee_id` text,
	`counterpart_profile_id` text,
	`created_at` integer NOT NULL,
	`direction` text NOT NULL,
	`external_id` text NOT NULL,
	`fee_currency` text,
	`fee_minor` integer,
	`id` text PRIMARY KEY NOT NULL,
	`import_run_id` text,
	`note` text DEFAULT '' NOT NULL,
	`occurred_at` integer NOT NULL,
	`payee_id` text,
	`profile_id` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`rate` real,
	`rate_as_of` text,
	`raw_description` text DEFAULT '' NOT NULL,
	`raw_merchant` text DEFAULT '' NOT NULL,
	`raw_reference` text DEFAULT '' NOT NULL,
	`source_currency` text NOT NULL,
	`source_minor` integer NOT NULL,
	`status` text NOT NULL,
	`suggested_at` integer,
	`suggestion_model` text,
	`updated_at` integer NOT NULL,
	`value_date` text NOT NULL,
	CONSTRAINT `fk_transactions_counterpart_profile_id_profiles_id_fk` FOREIGN KEY (`counterpart_profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_transactions_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_transactions_profile_id_category_id_categories_profile_id_id_fk` FOREIGN KEY (`profile_id`,`category_id`) REFERENCES `categories`(`profile_id`,`id`),
	CONSTRAINT `fk_transactions_profile_id_payee_id_payees_profile_id_id_fk` FOREIGN KEY (`profile_id`,`payee_id`) REFERENCES `payees`(`profile_id`,`id`),
	CONSTRAINT `fk_transactions_profile_id_client_payee_id_payees_profile_id_id_fk` FOREIGN KEY (`profile_id`,`client_payee_id`) REFERENCES `payees`(`profile_id`,`id`),
	CONSTRAINT `fk_transactions_profile_id_applied_rule_id_rules_profile_id_id_fk` FOREIGN KEY (`profile_id`,`applied_rule_id`) REFERENCES `rules`(`profile_id`,`id`),
	CONSTRAINT `fk_transactions_profile_id_classification_rule_id_rules_profile_id_id_fk` FOREIGN KEY (`profile_id`,`classification_rule_id`) REFERENCES `rules`(`profile_id`,`id`),
	CONSTRAINT `fk_transactions_profile_id_import_run_id_sync_runs_profile_id_id_fk` FOREIGN KEY (`profile_id`,`import_run_id`) REFERENCES `sync_runs`(`profile_id`,`id`),
	CONSTRAINT `fk_transactions_profile_id_provider_account_id_provider_accounts_profile_id_id_fk` FOREIGN KEY (`profile_id`,`provider_account_id`) REFERENCES `provider_accounts`(`profile_id`,`id`),
	CONSTRAINT `fk_transactions_profile_id_base_currency_profiles_id_base_currency_fk` FOREIGN KEY (`profile_id`,`base_currency`) REFERENCES `profiles`(`id`,`base_currency`),
	CONSTRAINT "transactions_source_currency_code_check" CHECK(typeof("source_currency") = 'text' AND length("source_currency") = 3 AND instr("source_currency", char(0)) = 0 AND "source_currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "transactions_base_currency_code_check" CHECK(typeof("base_currency") = 'text' AND length("base_currency") = 3 AND instr("base_currency", char(0)) = 0 AND "base_currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "transactions_fee_currency_code_check" CHECK("fee_currency" IS NULL OR (typeof("fee_currency") = 'text' AND length("fee_currency") = 3 AND instr("fee_currency", char(0)) = 0 AND "fee_currency" GLOB '[A-Z][A-Z][A-Z]')),
	CONSTRAINT "transactions_base_minor_integer_check" CHECK(typeof("base_minor") = 'integer' AND "base_minor" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "transactions_created_at_integer_check" CHECK(typeof("created_at") = 'integer' AND "created_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "transactions_fee_minor_integer_check" CHECK("fee_minor" IS NULL OR (typeof("fee_minor") = 'integer' AND "fee_minor" BETWEEN -9007199254740991 AND 9007199254740991)),
	CONSTRAINT "transactions_occurred_at_integer_check" CHECK(typeof("occurred_at") = 'integer' AND "occurred_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "transactions_source_minor_integer_check" CHECK(typeof("source_minor") = 'integer' AND "source_minor" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "transactions_suggested_at_integer_check" CHECK("suggested_at" IS NULL OR (typeof("suggested_at") = 'integer' AND "suggested_at" BETWEEN -9007199254740991 AND 9007199254740991)),
	CONSTRAINT "transactions_updated_at_integer_check" CHECK(typeof("updated_at") = 'integer' AND "updated_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "transactions_rate_as_of_date_check" CHECK("rate_as_of" IS NULL OR (typeof("rate_as_of") = 'text' AND length("rate_as_of") = 10 AND "rate_as_of" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
	CONSTRAINT "transactions_value_date_date_check" CHECK(typeof("value_date") = 'text' AND length("value_date") = 10 AND "value_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "transactions_status_check" CHECK("status" IN ('posted', 'pending', 'reversed')),
	CONSTRAINT "transactions_direction_check" CHECK("direction" IN ('in', 'out', 'neutral')),
	CONSTRAINT "transactions_categorization_check" CHECK("categorization" IN ('none', 'suggested', 'applied', 'confirmed')),
	CONSTRAINT "transactions_classification_check" CHECK("classification" IN ('none', 'income', 'refund', 'self_transfer', 'internal_transfer', 'excluded', 'tax_payment')),
	CONSTRAINT "transactions_categorization_category_check" CHECK(("category_id" IS NULL) = ("categorization" = 'none')),
	CONSTRAINT "transactions_suggested_check" CHECK(("categorization" = 'suggested' AND "suggestion_model" IS NOT NULL AND "suggested_at" IS NOT NULL) OR ("categorization" <> 'suggested' AND "suggestion_model" IS NULL AND "suggested_at" IS NULL)),
	CONSTRAINT "transactions_applied_rule_check" CHECK(("categorization" = 'applied') = ("applied_rule_id" IS NOT NULL)),
	CONSTRAINT "transactions_income_payee_check" CHECK(("classification" = 'income') = ("client_payee_id" IS NOT NULL)),
	CONSTRAINT "transactions_classification_rule_check" CHECK(("classification" = 'none') = ("classification_rule_id" IS NULL)),
	CONSTRAINT "transactions_counterpart_profile_check" CHECK("counterpart_profile_id" IS NULL OR "classification" = 'self_transfer'),
	CONSTRAINT "transactions_base_amount_check" CHECK("source_currency" <> "base_currency" OR "source_minor" = "base_minor"),
	CONSTRAINT "transactions_rate_check" CHECK(("source_currency" = "base_currency" AND "rate" IS NULL AND "rate_as_of" IS NULL) OR ("source_currency" <> "base_currency" AND typeof("rate") = 'real' AND "rate" > 0 AND "rate" < 1e300 AND "rate_as_of" IS NOT NULL)),
	CONSTRAINT "transactions_rate_amount_check" CHECK("source_currency" = "base_currency" OR abs("base_minor" - (CASE (CASE "base_currency" WHEN 'BHD' THEN 3 WHEN 'BIF' THEN 0 WHEN 'CLF' THEN 4 WHEN 'CLP' THEN 0 WHEN 'DJF' THEN 0 WHEN 'GNF' THEN 0 WHEN 'IQD' THEN 3 WHEN 'ISK' THEN 0 WHEN 'JOD' THEN 3 WHEN 'JPY' THEN 0 WHEN 'KMF' THEN 0 WHEN 'KRW' THEN 0 WHEN 'KWD' THEN 3 WHEN 'LYD' THEN 3 WHEN 'OMR' THEN 3 WHEN 'PYG' THEN 0 WHEN 'RWF' THEN 0 WHEN 'TND' THEN 3 WHEN 'UGX' THEN 0 WHEN 'UYI' THEN 0 WHEN 'UYW' THEN 4 WHEN 'VND' THEN 0 WHEN 'VUV' THEN 0 WHEN 'XAF' THEN 0 WHEN 'XOF' THEN 0 WHEN 'XPF' THEN 0 ELSE 2 END) - (CASE "source_currency" WHEN 'BHD' THEN 3 WHEN 'BIF' THEN 0 WHEN 'CLF' THEN 4 WHEN 'CLP' THEN 0 WHEN 'DJF' THEN 0 WHEN 'GNF' THEN 0 WHEN 'IQD' THEN 3 WHEN 'ISK' THEN 0 WHEN 'JOD' THEN 3 WHEN 'JPY' THEN 0 WHEN 'KMF' THEN 0 WHEN 'KRW' THEN 0 WHEN 'KWD' THEN 3 WHEN 'LYD' THEN 3 WHEN 'OMR' THEN 3 WHEN 'PYG' THEN 0 WHEN 'RWF' THEN 0 WHEN 'TND' THEN 3 WHEN 'UGX' THEN 0 WHEN 'UYI' THEN 0 WHEN 'UYW' THEN 4 WHEN 'VND' THEN 0 WHEN 'VUV' THEN 0 WHEN 'XAF' THEN 0 WHEN 'XOF' THEN 0 WHEN 'XPF' THEN 0 ELSE 2 END) WHEN -4 THEN ("source_minor" * "rate") / 10000 WHEN -3 THEN ("source_minor" * "rate") / 1000 WHEN -2 THEN ("source_minor" * "rate") / 100 WHEN -1 THEN ("source_minor" * "rate") / 10 WHEN 0 THEN ("source_minor" * "rate") * 1 WHEN 1 THEN ("source_minor" * "rate") * 10 WHEN 2 THEN ("source_minor" * "rate") * 100 WHEN 3 THEN ("source_minor" * "rate") * 1000 WHEN 4 THEN ("source_minor" * "rate") * 10000 ELSE "source_minor" * "rate" END)) <= 1 + (abs((CASE (CASE "base_currency" WHEN 'BHD' THEN 3 WHEN 'BIF' THEN 0 WHEN 'CLF' THEN 4 WHEN 'CLP' THEN 0 WHEN 'DJF' THEN 0 WHEN 'GNF' THEN 0 WHEN 'IQD' THEN 3 WHEN 'ISK' THEN 0 WHEN 'JOD' THEN 3 WHEN 'JPY' THEN 0 WHEN 'KMF' THEN 0 WHEN 'KRW' THEN 0 WHEN 'KWD' THEN 3 WHEN 'LYD' THEN 3 WHEN 'OMR' THEN 3 WHEN 'PYG' THEN 0 WHEN 'RWF' THEN 0 WHEN 'TND' THEN 3 WHEN 'UGX' THEN 0 WHEN 'UYI' THEN 0 WHEN 'UYW' THEN 4 WHEN 'VND' THEN 0 WHEN 'VUV' THEN 0 WHEN 'XAF' THEN 0 WHEN 'XOF' THEN 0 WHEN 'XPF' THEN 0 ELSE 2 END) - (CASE "source_currency" WHEN 'BHD' THEN 3 WHEN 'BIF' THEN 0 WHEN 'CLF' THEN 4 WHEN 'CLP' THEN 0 WHEN 'DJF' THEN 0 WHEN 'GNF' THEN 0 WHEN 'IQD' THEN 3 WHEN 'ISK' THEN 0 WHEN 'JOD' THEN 3 WHEN 'JPY' THEN 0 WHEN 'KMF' THEN 0 WHEN 'KRW' THEN 0 WHEN 'KWD' THEN 3 WHEN 'LYD' THEN 3 WHEN 'OMR' THEN 3 WHEN 'PYG' THEN 0 WHEN 'RWF' THEN 0 WHEN 'TND' THEN 3 WHEN 'UGX' THEN 0 WHEN 'UYI' THEN 0 WHEN 'UYW' THEN 4 WHEN 'VND' THEN 0 WHEN 'VUV' THEN 0 WHEN 'XAF' THEN 0 WHEN 'XOF' THEN 0 WHEN 'XPF' THEN 0 ELSE 2 END) WHEN -4 THEN ("source_minor" * "rate") / 10000 WHEN -3 THEN ("source_minor" * "rate") / 1000 WHEN -2 THEN ("source_minor" * "rate") / 100 WHEN -1 THEN ("source_minor" * "rate") / 10 WHEN 0 THEN ("source_minor" * "rate") * 1 WHEN 1 THEN ("source_minor" * "rate") * 10 WHEN 2 THEN ("source_minor" * "rate") * 100 WHEN 3 THEN ("source_minor" * "rate") * 1000 WHEN 4 THEN ("source_minor" * "rate") * 10000 ELSE "source_minor" * "rate" END)) >= 4503599627370496)),
	CONSTRAINT "transactions_fee_currency_check" CHECK("fee_currency" IS NULL OR "fee_currency" = "source_currency"),
	CONSTRAINT "transactions_fee_pair_check" CHECK(("fee_minor" IS NULL) = ("fee_currency" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_profile_name_idx` ON `categories` (`profile_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_profile_id_idx` ON `categories` (`profile_id`,`id`);--> statement-breakpoint
CREATE INDEX `categories_profile_parent_idx` ON `categories` (`profile_id`,`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_aliases_match_idx` ON `merchant_aliases` (`profile_id`,`match_type`,`pattern`);--> statement-breakpoint
CREATE INDEX `merchant_aliases_pattern_idx` ON `merchant_aliases` (`profile_id`,`pattern`);--> statement-breakpoint
CREATE UNIQUE INDEX `payees_profile_name_idx` ON `payees` (`profile_id`,`normalized_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `payees_profile_id_idx` ON `payees` (`profile_id`,`id`);--> statement-breakpoint
CREATE INDEX `payees_profile_kind_idx` ON `payees` (`profile_id`,`kind`);--> statement-breakpoint
CREATE INDEX `rules_profile_priority_idx` ON `rules` (`profile_id`,`enabled`,"priority" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `rules_profile_id_idx` ON `rules` (`profile_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rules_match_idx` ON `rules` (`profile_id`,`kind`,`match_field`,`match_type`,`pattern`,`direction`,coalesce("min_amount_minor", -1),coalesce("max_amount_minor", -1));--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_account_external_idx` ON `transactions` (`provider_account_id`,`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_profile_id_idx` ON `transactions` (`profile_id`,`id`);--> statement-breakpoint
CREATE INDEX `transactions_profile_recent_idx` ON `transactions` (`profile_id`,"occurred_at" DESC,`id`);--> statement-breakpoint
CREATE INDEX `transactions_profile_direction_idx` ON `transactions` (`profile_id`,`direction`,"occurred_at" DESC);--> statement-breakpoint
CREATE INDEX `transactions_profile_payee_idx` ON `transactions` (`profile_id`,`payee_id`,"occurred_at" DESC);--> statement-breakpoint
CREATE INDEX `transactions_profile_category_idx` ON `transactions` (`profile_id`,`category_id`,"occurred_at" DESC);--> statement-breakpoint
CREATE INDEX `transactions_profile_classification_idx` ON `transactions` (`profile_id`,`classification`,"occurred_at" DESC);--> statement-breakpoint
CREATE INDEX `transactions_profile_merchant_idx` ON `transactions` (`profile_id`,`raw_merchant`);