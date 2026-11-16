CREATE TABLE `investment_platforms` (
	`connector` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	CONSTRAINT "investment_platforms_enabled_integer_check" CHECK(typeof("enabled") = 'integer' AND "enabled" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "investment_platforms_enabled_boolean_check" CHECK("enabled" IN (0, 1)),
	CONSTRAINT "investment_platforms_connector_check" CHECK("connector" IN ('trading212', 'manual'))
);
--> statement-breakpoint
CREATE TABLE `provider_accounts` (
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`credential_key` text,
	`external_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`last_synced_at` integer,
	`profile_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`sync_start_date` text,
	CONSTRAINT `fk_provider_accounts_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_provider_accounts_provider_id_providers_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`),
	CONSTRAINT "provider_accounts_archived_at_integer_check" CHECK("archived_at" IS NULL OR (typeof("archived_at") = 'integer' AND "archived_at" BETWEEN -9007199254740991 AND 9007199254740991)),
	CONSTRAINT "provider_accounts_created_at_integer_check" CHECK(typeof("created_at") = 'integer' AND "created_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "provider_accounts_last_synced_at_integer_check" CHECK("last_synced_at" IS NULL OR (typeof("last_synced_at") = 'integer' AND "last_synced_at" BETWEEN -9007199254740991 AND 9007199254740991)),
	CONSTRAINT "provider_accounts_sync_start_date_date_check" CHECK("sync_start_date" IS NULL OR (typeof("sync_start_date") = 'text' AND length("sync_start_date") = 10 AND "sync_start_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
	CONSTRAINT "provider_accounts_kind_check" CHECK("kind" IN ('bank', 'investment', 'books', 'csv', 'manual'))
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`enabled` integer DEFAULT 1 NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	CONSTRAINT "providers_enabled_integer_check" CHECK(typeof("enabled") = 'integer' AND "enabled" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "providers_enabled_boolean_check" CHECK("enabled" IN (0, 1)),
	CONSTRAINT "providers_kind_check" CHECK("kind" IN ('bank', 'investment', 'books', 'csv', 'manual'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_accounts_account_idx` ON `provider_accounts` (`profile_id`,`provider_id`,`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `provider_accounts_profile_id_idx` ON `provider_accounts` (`profile_id`,`id`);--> statement-breakpoint
CREATE INDEX `provider_accounts_profile_idx` ON `provider_accounts` (`profile_id`);
--> statement-breakpoint
INSERT INTO `providers` (`id`, `kind`, `label`, `enabled`) VALUES
	('wise', 'bank', 'Wise', 1),
	('trading212', 'investment', 'Trading 212', 1),
	('freeagent', 'books', 'FreeAgent', 1),
	('csv', 'csv', 'CSV import', 1),
	('manual', 'manual', 'Manual entry', 1);
--> statement-breakpoint
INSERT INTO `investment_platforms` (`id`, `label`, `connector`, `enabled`) VALUES
	('generic-broker', 'Generic Broker', 'manual', 1),
	('generic-crypto-exchange', 'Generic Crypto Exchange', 'manual', 1),
	('manual', 'Manual', 'manual', 1);
