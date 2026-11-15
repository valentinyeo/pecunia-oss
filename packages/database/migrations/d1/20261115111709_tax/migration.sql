CREATE TABLE `tax_obligations` (
	`amount_currency` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`books_status` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`due_on` text NOT NULL,
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`period_ends_on` text NOT NULL,
	`profile_id` text NOT NULL,
	`settled_transaction_id` text,
	`status` text NOT NULL,
	`synced_at` integer NOT NULL,
	`tax_profile_id` text NOT NULL,
	CONSTRAINT `fk_tax_obligations_settled_transaction_id_transactions_id_fk` FOREIGN KEY (`settled_transaction_id`) REFERENCES `transactions`(`id`),
	CONSTRAINT "tax_obligations_status_check" CHECK("status" IN ('estimated', 'paid', 'written_off')),
	CONSTRAINT "tax_obligations_paid_settled_check" CHECK("status" <> 'paid' OR "settled_transaction_id" IS NOT NULL),
	CONSTRAINT "tax_obligations_estimated_check" CHECK("status" <> 'estimated' OR "settled_transaction_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `tax_profiles` (
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`jurisdiction` text NOT NULL,
	`primary` integer DEFAULT 0 NOT NULL,
	`profile_id` text NOT NULL,
	`year_start_day` integer NOT NULL,
	`year_start_month` integer NOT NULL,
	CONSTRAINT "tax_profiles_year_start_month_check" CHECK("year_start_month" BETWEEN 1 AND 12),
	CONSTRAINT "tax_profiles_year_start_day_check" CHECK("year_start_day" BETWEEN 1 AND 28)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_obligations_period_idx` ON `tax_obligations` (`tax_profile_id`,`kind`,`period_ends_on`,`due_on`,`label`);--> statement-breakpoint
CREATE INDEX `tax_obligations_profile_due_idx` ON `tax_obligations` (`profile_id`,`due_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `tax_profiles_primary_idx` ON `tax_profiles` (`profile_id`) WHERE "tax_profiles"."primary" = 1;