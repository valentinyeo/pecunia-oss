CREATE TABLE `archive_targets` (
	`blocklist` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`provider` text NOT NULL,
	`root_ref` text NOT NULL,
	CONSTRAINT `fk_archive_targets_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT "archive_targets_created_at_integer_check" CHECK(typeof("created_at") = 'integer'),
	CONSTRAINT "archive_targets_provider_check" CHECK("provider" IN ('drive', 'local', 'none'))
);
--> statement-breakpoint
CREATE TABLE `invoice_documents` (
	`amount_currency` text,
	`amount_minor` integer,
	`archive_file_id` text,
	`archive_state` text DEFAULT 'unarchived' NOT NULL,
	`archive_target_id` text,
	`archived_at` integer,
	`content_type` text NOT NULL,
	`created_at` integer NOT NULL,
	`document_date` text NOT NULL,
	`document_type` text NOT NULL,
	`id` text PRIMARY KEY,
	`original_filename` text NOT NULL,
	`profile_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`source` text NOT NULL,
	`source_ref` text,
	`transaction_id` text,
	`vendor_payee_id` text,
	CONSTRAINT `fk_invoice_documents_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_invoice_documents_profile_id_archive_target_id_archive_targets_profile_id_id_fk` FOREIGN KEY (`profile_id`,`archive_target_id`) REFERENCES `archive_targets`(`profile_id`,`id`),
	CONSTRAINT `fk_invoice_documents_profile_id_transaction_id_transactions_profile_id_id_fk` FOREIGN KEY (`profile_id`,`transaction_id`) REFERENCES `transactions`(`profile_id`,`id`),
	CONSTRAINT `fk_invoice_documents_profile_id_vendor_payee_id_payees_profile_id_id_fk` FOREIGN KEY (`profile_id`,`vendor_payee_id`) REFERENCES `payees`(`profile_id`,`id`),
	CONSTRAINT "invoice_documents_amount_currency_code_check" CHECK("amount_currency" IS NULL OR "amount_currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "invoice_documents_amount_minor_integer_check" CHECK("amount_minor" IS NULL OR typeof("amount_minor") = 'integer'),
	CONSTRAINT "invoice_documents_archived_at_integer_check" CHECK("archived_at" IS NULL OR typeof("archived_at") = 'integer'),
	CONSTRAINT "invoice_documents_created_at_integer_check" CHECK(typeof("created_at") = 'integer'),
	CONSTRAINT "invoice_documents_size_bytes_integer_check" CHECK(typeof("size_bytes") = 'integer'),
	CONSTRAINT "invoice_documents_type_check" CHECK("document_type" IN ('invoice', 'receipt', 'statement', 'credit_note', 'other')),
	CONSTRAINT "invoice_documents_source_check" CHECK("source" IN ('upload', 'agent', 'email', 'legacy_upload')),
	CONSTRAINT "invoice_documents_archive_state_check" CHECK("archive_state" IN ('unarchived', 'reserved', 'archived', 'failed')),
	CONSTRAINT "invoice_documents_amount_pair_check" CHECK(("amount_minor" IS NULL) = ("amount_currency" IS NULL)),
	CONSTRAINT "invoice_documents_reserved_check" CHECK("archive_state" <> 'reserved' OR "archive_file_id" IS NOT NULL),
	CONSTRAINT "invoice_documents_archived_check" CHECK("archive_state" <> 'archived' OR ("archive_file_id" IS NOT NULL AND "archive_target_id" IS NOT NULL AND "archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `invoice_exceptions` (
	`profile_id` text NOT NULL,
	`reason` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`transaction_id` text PRIMARY KEY,
	CONSTRAINT `fk_invoice_exceptions_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_invoice_exceptions_profile_id_transaction_id_transactions_profile_id_id_fk` FOREIGN KEY (`profile_id`,`transaction_id`) REFERENCES `transactions`(`profile_id`,`id`),
	CONSTRAINT "invoice_exceptions_recorded_at_integer_check" CHECK(typeof("recorded_at") = 'integer'),
	CONSTRAINT "invoice_exceptions_reason_check" CHECK(length(trim("reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE `invoice_sources` (
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`login_hint` text,
	`notes` text,
	`pattern` text NOT NULL,
	`portal_url` text,
	`profile_id` text NOT NULL,
	`retrieval_bookkeeper` integer DEFAULT 0 NOT NULL,
	`retrieval_email` integer DEFAULT 0 NOT NULL,
	`retrieval_portal` integer DEFAULT 0 NOT NULL,
	`retrieval_two_factor` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`vendor_payee_id` text,
	CONSTRAINT `fk_invoice_sources_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT `fk_invoice_sources_profile_id_vendor_payee_id_payees_profile_id_id_fk` FOREIGN KEY (`profile_id`,`vendor_payee_id`) REFERENCES `payees`(`profile_id`,`id`),
	CONSTRAINT "invoice_sources_created_at_integer_check" CHECK(typeof("created_at") = 'integer'),
	CONSTRAINT "invoice_sources_retrieval_bookkeeper_integer_check" CHECK(typeof("retrieval_bookkeeper") = 'integer'),
	CONSTRAINT "invoice_sources_retrieval_email_integer_check" CHECK(typeof("retrieval_email") = 'integer'),
	CONSTRAINT "invoice_sources_retrieval_portal_integer_check" CHECK(typeof("retrieval_portal") = 'integer'),
	CONSTRAINT "invoice_sources_retrieval_two_factor_integer_check" CHECK(typeof("retrieval_two_factor") = 'integer'),
	CONSTRAINT "invoice_sources_updated_at_integer_check" CHECK(typeof("updated_at") = 'integer')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archive_targets_profile_provider_idx` ON `archive_targets` (`profile_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `archive_targets_profile_id_idx` ON `archive_targets` (`profile_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_documents_sha256_idx` ON `invoice_documents` (`profile_id`,`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_documents_file_idx` ON `invoice_documents` (`archive_file_id`) WHERE "invoice_documents"."archive_file_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `invoice_documents_profile_date_idx` ON `invoice_documents` (`profile_id`,"document_date" DESC);--> statement-breakpoint
CREATE INDEX `invoice_documents_transaction_idx` ON `invoice_documents` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `invoice_exceptions_profile_idx` ON `invoice_exceptions` (`profile_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_sources_profile_pattern_idx` ON `invoice_sources` (`profile_id`,`pattern`);--> statement-breakpoint
CREATE INDEX `invoice_sources_pattern_idx` ON `invoice_sources` (`profile_id`,"pattern" COLLATE NOCASE);