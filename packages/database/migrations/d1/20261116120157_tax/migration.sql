CREATE TABLE `tax_obligations` (
	`amount_currency` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`books_status` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`due_on` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`period_ends_on` text NOT NULL,
	`profile_id` text NOT NULL,
	`settled_transaction_id` text,
	`status` text NOT NULL,
	`synced_at` integer NOT NULL,
	`tax_profile_id` text NOT NULL,
	`write_off_reason` text,
	CONSTRAINT `fk_tax_obligations_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_tax_obligations_profile_id_tax_profile_id_tax_profiles_profile_id_id_fk` FOREIGN KEY (`profile_id`,`tax_profile_id`) REFERENCES `tax_profiles`(`profile_id`,`id`),
	CONSTRAINT `fk_tax_obligations_profile_id_settled_transaction_id_transactions_profile_id_id_fk` FOREIGN KEY (`profile_id`,`settled_transaction_id`) REFERENCES `transactions`(`profile_id`,`id`),
	CONSTRAINT "tax_obligations_amount_currency_code_check" CHECK(typeof("amount_currency") = 'text' AND length("amount_currency") = 3 AND instr("amount_currency", char(0)) = 0 AND "amount_currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "tax_obligations_amount_minor_integer_check" CHECK(typeof("amount_minor") = 'integer' AND "amount_minor" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "tax_obligations_created_at_integer_check" CHECK(typeof("created_at") = 'integer' AND "created_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "tax_obligations_synced_at_integer_check" CHECK(typeof("synced_at") = 'integer' AND "synced_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "tax_obligations_due_on_date_check" CHECK(typeof("due_on") = 'text' AND length("due_on") = 10 AND "due_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "tax_obligations_period_ends_on_date_check" CHECK(typeof("period_ends_on") = 'text' AND length("period_ends_on") = 10 AND "period_ends_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "tax_obligations_status_check" CHECK("status" IN ('estimated', 'paid', 'written_off')),
	CONSTRAINT "tax_obligations_paid_settled_check" CHECK("status" <> 'paid' OR "settled_transaction_id" IS NOT NULL),
	CONSTRAINT "tax_obligations_estimated_check" CHECK("status" <> 'estimated' OR "settled_transaction_id" IS NULL),
	CONSTRAINT "tax_obligations_write_off_check" CHECK(("status" = 'written_off' AND "write_off_reason" IS NOT NULL AND typeof("write_off_reason") = 'text' AND length(trim("write_off_reason", ' ' || char(9) || char(10) || char(13))) > 0 AND "settled_transaction_id" IS NULL) OR ("status" <> 'written_off' AND "write_off_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `tax_profiles` (
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`jurisdiction` text NOT NULL,
	`primary` integer DEFAULT 0 NOT NULL,
	`profile_id` text NOT NULL,
	`year_start_day` integer NOT NULL,
	`year_start_month` integer NOT NULL,
	CONSTRAINT `fk_tax_profiles_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT "tax_profiles_created_at_integer_check" CHECK(typeof("created_at") = 'integer' AND "created_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "tax_profiles_primary_integer_check" CHECK(typeof("primary") = 'integer' AND "primary" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "tax_profiles_year_start_day_integer_check" CHECK(typeof("year_start_day") = 'integer' AND "year_start_day" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "tax_profiles_year_start_month_integer_check" CHECK(typeof("year_start_month") = 'integer' AND "year_start_month" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "tax_profiles_primary_boolean_check" CHECK("primary" IN (0, 1)),
	CONSTRAINT "tax_profiles_year_start_month_check" CHECK("year_start_month" BETWEEN 1 AND 12),
	CONSTRAINT "tax_profiles_year_start_day_check" CHECK("year_start_day" BETWEEN 1 AND 28)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_obligations_period_idx` ON `tax_obligations` (`tax_profile_id`,`kind`,`period_ends_on`,`due_on`,`label`);--> statement-breakpoint
CREATE INDEX `tax_obligations_profile_due_idx` ON `tax_obligations` (`profile_id`,`due_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `tax_obligations_settled_idx` ON `tax_obligations` (`settled_transaction_id`) WHERE "tax_obligations"."settled_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tax_profiles_primary_idx` ON `tax_profiles` (`profile_id`) WHERE "tax_profiles"."primary" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `tax_profiles_profile_id_idx` ON `tax_profiles` (`profile_id`,`id`);