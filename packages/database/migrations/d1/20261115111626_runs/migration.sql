CREATE TABLE `sync_run_rejections` (
	`created_at` integer NOT NULL,
	`detail` text NOT NULL,
	`external_id` text,
	`id` text PRIMARY KEY,
	`reason` text NOT NULL,
	`run_id` text NOT NULL,
	CONSTRAINT `fk_sync_run_rejections_run_id_sync_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `sync_runs`(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`chunk_index` integer DEFAULT 0 NOT NULL,
	`failure_message` text,
	`failure_tag` text,
	`finished_at` integer,
	`id` text PRIMARY KEY,
	`imported` integer DEFAULT 0 NOT NULL,
	`kind` text NOT NULL,
	`lease_expires_at` integer NOT NULL,
	`lease_owner` text NOT NULL,
	`profile_id` text NOT NULL,
	`provider_account_id` text,
	`rejected` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL,
	`window_from` text,
	`window_to` text,
	CONSTRAINT "sync_runs_kind_check" CHECK("kind" IN ('bank_sync', 'categorization')),
	CONSTRAINT "sync_runs_state_check" CHECK("state" IN ('running', 'chunk_done', 'categorizing', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "sync_runs_finished_check" CHECK(("state" IN ('succeeded', 'failed', 'cancelled')) = ("finished_at" IS NOT NULL)),
	CONSTRAINT "sync_runs_failure_check" CHECK("state" <> 'failed' OR "failure_tag" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `sync_run_rejections_run_idx` ON `sync_run_rejections` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_runs_one_open_per_account` ON `sync_runs` (`provider_account_id`) WHERE "sync_runs"."state" IN ('running', 'chunk_done', 'categorizing');--> statement-breakpoint
CREATE INDEX `sync_runs_profile_started_idx` ON `sync_runs` (`profile_id`,"started_at" DESC);--> statement-breakpoint
CREATE INDEX `sync_runs_state_lease_idx` ON `sync_runs` (`state`,`lease_expires_at`);