CREATE TABLE `subscriptions` (
	`amount_cv` real DEFAULT 0 NOT NULL,
	`base_currency` text NOT NULL,
	`category_id` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`frequency` text NOT NULL,
	`id` text PRIMARY KEY,
	`last_charged_on` text NOT NULL,
	`next_expected_on` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`occurrence_count` integer DEFAULT 0 NOT NULL,
	`payee_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`status` text NOT NULL,
	`status_changed_at` integer NOT NULL,
	`typical_base_minor` integer NOT NULL,
	`typical_currency` text NOT NULL,
	`typical_minor` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_subscriptions_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`),
	CONSTRAINT "subscriptions_frequency_check" CHECK("frequency" IN ('weekly', 'monthly', 'quarterly', 'annual')),
	CONSTRAINT "subscriptions_status_check" CHECK("status" IN ('detected', 'confirmed', 'dismissed', 'not_recurring', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_payee_idx` ON `subscriptions` (`profile_id`,`payee_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_profile_status_idx` ON `subscriptions` (`profile_id`,`status`);