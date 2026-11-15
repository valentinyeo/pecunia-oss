CREATE TABLE `reports` (
	`created_at` integer NOT NULL,
	`html` text NOT NULL,
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`profile_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "reports_kind_check" CHECK("kind" IN ('report', 'exploration'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_profile_slug_idx` ON `reports` (`profile_id`,`slug`);