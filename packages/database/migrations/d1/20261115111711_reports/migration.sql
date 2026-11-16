CREATE TABLE `reports` (
	`created_at` integer NOT NULL,
	`html` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`profile_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_reports_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT "reports_created_at_integer_check" CHECK(typeof("created_at") = 'integer' AND "created_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "reports_updated_at_integer_check" CHECK(typeof("updated_at") = 'integer' AND "updated_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "reports_kind_check" CHECK("kind" IN ('report', 'exploration'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_profile_slug_idx` ON `reports` (`profile_id`,`slug`);