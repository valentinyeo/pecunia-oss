CREATE TABLE `investment_platforms` (
	`connector` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`id` text PRIMARY KEY,
	`label` text NOT NULL,
	CONSTRAINT "investment_platforms_connector_check" CHECK("connector" IN ('trading212', 'manual'))
);
--> statement-breakpoint
CREATE TABLE `provider_accounts` (
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`credential_key` text,
	`external_id` text NOT NULL,
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`last_synced_at` integer,
	`profile_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`sync_start_date` text,
	CONSTRAINT `fk_provider_accounts_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_provider_accounts_provider_id_providers_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`)
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`enabled` integer DEFAULT 1 NOT NULL,
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	CONSTRAINT "providers_kind_check" CHECK("kind" IN ('bank', 'investment', 'books', 'csv', 'manual'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_accounts_account_idx` ON `provider_accounts` (`profile_id`,`provider_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `provider_accounts_profile_idx` ON `provider_accounts` (`profile_id`);--> statement-breakpoint
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
