CREATE TABLE `app_setting` (
	`id` integer PRIMARY KEY,
	`locale` text NOT NULL,
	`primary_profile_id` text NOT NULL,
	`timezone` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_app_setting_primary_profile_id_profiles_id_fk` FOREIGN KEY (`primary_profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT "app_setting_singleton_check" CHECK("id" = 1)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`created_at` integer NOT NULL,
	`email` text NOT NULL COLLATE NOCASE,
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`role` text NOT NULL,
	CONSTRAINT `fk_members_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT "members_role_check" CHECK("role" IN ('owner', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`archived_at` integer,
	`base_currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	CONSTRAINT "profiles_kind_check" CHECK("kind" IN ('personal', 'business')),
	CONSTRAINT "profiles_base_currency_check" CHECK(length("base_currency") = 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_profile_email_idx` ON `members` (`profile_id`,`email`);--> statement-breakpoint
CREATE INDEX `members_email_idx` ON `members` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_name_idx` ON `profiles` (`name`);