CREATE TABLE `app_setting` (
	`id` integer PRIMARY KEY,
	`locale` text NOT NULL,
	`primary_profile_id` text NOT NULL,
	`timezone` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_app_setting_primary_profile_id_profiles_id_fk` FOREIGN KEY (`primary_profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT "app_setting_updated_at_integer_check" CHECK(typeof("updated_at") = 'integer' AND "updated_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "app_setting_singleton_check" CHECK("id" = 1)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`created_at` integer NOT NULL,
	`email` text COLLATE NOCASE NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`role` text NOT NULL,
	CONSTRAINT `fk_members_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT "members_created_at_integer_check" CHECK(typeof("created_at") = 'integer' AND "created_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "members_email_check" CHECK(typeof("email") = 'text' AND length(trim("email", ' ' || char(9) || char(10) || char(13))) > 0),
	CONSTRAINT "members_role_check" CHECK("role" IN ('owner', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`archived_at` integer,
	`base_currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	CONSTRAINT "profiles_archived_at_integer_check" CHECK("archived_at" IS NULL OR (typeof("archived_at") = 'integer' AND "archived_at" BETWEEN -9007199254740991 AND 9007199254740991)),
	CONSTRAINT "profiles_created_at_integer_check" CHECK(typeof("created_at") = 'integer' AND "created_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "profiles_base_currency_code_check" CHECK(typeof("base_currency") = 'text' AND length("base_currency") = 3 AND instr("base_currency", char(0)) = 0 AND "base_currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "profiles_kind_check" CHECK("kind" IN ('personal', 'business'))
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_run_logs` (
	`capability` text NOT NULL,
	`failure_tag` text,
	`id` text PRIMARY KEY NOT NULL,
	`outcome` text NOT NULL,
	`person_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	CONSTRAINT "run_logs_recorded_at_integer_check" CHECK(typeof("recorded_at") = 'integer' AND "recorded_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "run_logs_outcome_check" CHECK("outcome" IN ('Succeeded', 'Failed')),
	CONSTRAINT "run_logs_failure_tag_check" CHECK(("outcome" = 'Succeeded' AND "failure_tag" IS NULL) OR ("outcome" = 'Failed' AND "failure_tag" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_run_logs`(`id`, `person_id`, `capability`, `recorded_at`, `outcome`, `failure_tag`) SELECT `id`, `person_id`, `capability`, `recorded_at`, `outcome`, `failure_tag` FROM `run_logs`;--> statement-breakpoint
DROP TABLE `run_logs`;--> statement-breakpoint
ALTER TABLE `__new_run_logs` RENAME TO `run_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `run_logs_person_recent_idx` ON `run_logs` (`person_id`,`recorded_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_profile_email_idx` ON `members` (`profile_id`,`email`);--> statement-breakpoint
CREATE INDEX `members_email_idx` ON `members` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_name_idx` ON `profiles` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_id_base_currency_idx` ON `profiles` (`id`,`base_currency`);