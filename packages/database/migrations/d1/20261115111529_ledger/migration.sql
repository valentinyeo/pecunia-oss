CREATE TABLE `categories` (
	`archived_at` integer,
	`color` text NOT NULL,
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`parent_id` text,
	`profile_id` text NOT NULL,
	`spending_type` text NOT NULL,
	CONSTRAINT `fk_categories_parent_id_categories_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`),
	CONSTRAINT "categories_spending_type_check" CHECK("spending_type" IN ('personal', 'business', 'mixed')),
	CONSTRAINT "categories_parent_check" CHECK("parent_id" IS NULL OR "parent_id" <> "id")
);
--> statement-breakpoint
CREATE TABLE `merchant_aliases` (
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`match_type` text NOT NULL,
	`pattern` text NOT NULL,
	`payee_id` text NOT NULL,
	`profile_id` text NOT NULL,
	CONSTRAINT `fk_merchant_aliases_payee_id_payees_id_fk` FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`),
	CONSTRAINT "merchant_aliases_match_type_check" CHECK("match_type" IN ('exact', 'prefix', 'contains'))
);
--> statement-breakpoint
CREATE TABLE `payees` (
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`default_category_id` text,
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`profile_id` text NOT NULL,
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
	`id` text PRIMARY KEY,
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
	CONSTRAINT `fk_rules_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`),
	CONSTRAINT `fk_rules_client_payee_id_payees_id_fk` FOREIGN KEY (`client_payee_id`) REFERENCES `payees`(`id`),
	CONSTRAINT `fk_rules_counterpart_profile_id_profiles_id_fk` FOREIGN KEY (`counterpart_profile_id`) REFERENCES `profiles`(`id`),
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
	`id` text PRIMARY KEY,
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
	CONSTRAINT `fk_transactions_applied_rule_id_rules_id_fk` FOREIGN KEY (`applied_rule_id`) REFERENCES `rules`(`id`),
	CONSTRAINT `fk_transactions_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`),
	CONSTRAINT `fk_transactions_classification_rule_id_rules_id_fk` FOREIGN KEY (`classification_rule_id`) REFERENCES `rules`(`id`),
	CONSTRAINT `fk_transactions_client_payee_id_payees_id_fk` FOREIGN KEY (`client_payee_id`) REFERENCES `payees`(`id`),
	CONSTRAINT `fk_transactions_counterpart_profile_id_profiles_id_fk` FOREIGN KEY (`counterpart_profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_transactions_import_run_id_sync_runs_id_fk` FOREIGN KEY (`import_run_id`) REFERENCES `sync_runs`(`id`),
	CONSTRAINT `fk_transactions_payee_id_payees_id_fk` FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`),
	CONSTRAINT "transactions_status_check" CHECK("status" IN ('posted', 'pending', 'reversed')),
	CONSTRAINT "transactions_direction_check" CHECK("direction" IN ('in', 'out', 'neutral')),
	CONSTRAINT "transactions_categorization_check" CHECK("categorization" IN ('none', 'suggested', 'applied', 'confirmed')),
	CONSTRAINT "transactions_classification_check" CHECK("classification" IN ('none', 'income', 'refund', 'self_transfer', 'internal_transfer', 'excluded', 'tax_payment')),
	CONSTRAINT "transactions_categorization_category_check" CHECK(("category_id" IS NULL) = ("categorization" = 'none')),
	CONSTRAINT "transactions_suggested_check" CHECK("categorization" <> 'suggested' OR ("suggestion_model" IS NOT NULL AND "suggested_at" IS NOT NULL)),
	CONSTRAINT "transactions_applied_rule_check" CHECK("categorization" <> 'applied' OR "applied_rule_id" IS NOT NULL),
	CONSTRAINT "transactions_income_payee_check" CHECK("classification" <> 'income' OR "client_payee_id" IS NOT NULL),
	CONSTRAINT "transactions_rate_check" CHECK(("source_currency" = "base_currency" AND "rate" IS NULL AND "rate_as_of" IS NULL) OR ("source_currency" <> "base_currency" AND "rate" > 0 AND "rate_as_of" IS NOT NULL)),
	CONSTRAINT "transactions_fee_currency_check" CHECK("fee_currency" IS NULL OR "fee_currency" = "source_currency"),
	CONSTRAINT "transactions_fee_pair_check" CHECK(("fee_minor" IS NULL) = ("fee_currency" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_profile_name_idx` ON `categories` (`profile_id`,`name`);--> statement-breakpoint
CREATE INDEX `categories_profile_parent_idx` ON `categories` (`profile_id`,`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_aliases_match_idx` ON `merchant_aliases` (`profile_id`,`match_type`,`pattern`);--> statement-breakpoint
CREATE INDEX `merchant_aliases_pattern_idx` ON `merchant_aliases` (`profile_id`,`pattern`);--> statement-breakpoint
CREATE UNIQUE INDEX `payees_profile_name_idx` ON `payees` (`profile_id`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `payees_profile_kind_idx` ON `payees` (`profile_id`,`kind`);--> statement-breakpoint
CREATE INDEX `rules_profile_priority_idx` ON `rules` (`profile_id`,`enabled`,"priority" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `rules_match_idx` ON `rules` (`profile_id`,`kind`,`match_field`,`match_type`,`pattern`,`direction`,`min_amount_minor`,`max_amount_minor`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_account_external_idx` ON `transactions` (`provider_account_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `transactions_profile_recent_idx` ON `transactions` (`profile_id`,"occurred_at" DESC,`id`);--> statement-breakpoint
CREATE INDEX `transactions_profile_direction_idx` ON `transactions` (`profile_id`,`direction`,"occurred_at" DESC);--> statement-breakpoint
CREATE INDEX `transactions_profile_payee_idx` ON `transactions` (`profile_id`,`payee_id`,"occurred_at" DESC);--> statement-breakpoint
CREATE INDEX `transactions_profile_category_idx` ON `transactions` (`profile_id`,`category_id`,"occurred_at" DESC);--> statement-breakpoint
CREATE INDEX `transactions_profile_classification_idx` ON `transactions` (`profile_id`,`classification`,"occurred_at" DESC);--> statement-breakpoint
CREATE INDEX `transactions_profile_merchant_idx` ON `transactions` (`profile_id`,`raw_merchant`);