CREATE TABLE `exchange_rates` (
	`as_of` text NOT NULL,
	`base_currency` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`quote_currency` text NOT NULL,
	`rate` real NOT NULL,
	CONSTRAINT `exchange_rates_pk` PRIMARY KEY(`base_currency`, `quote_currency`, `as_of`),
	CONSTRAINT "exchange_rates_rate_check" CHECK("rate" > 0)
);
--> statement-breakpoint
CREATE TABLE `holdings` (
	`asset_type` text NOT NULL,
	`cost_basis_currency` text,
	`cost_basis_minor` integer,
	`created_at` integer NOT NULL,
	`currency` text NOT NULL,
	`id` text PRIMARY KEY,
	`last_price_currency` text,
	`last_price_minor` integer,
	`name` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`opened_on` text NOT NULL,
	`platform_id` text NOT NULL,
	`priced_at` integer,
	`profile_id` text NOT NULL,
	`quantity_micros` integer NOT NULL,
	`state` text NOT NULL,
	`symbol` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_holdings_platform_id_investment_platforms_id_fk` FOREIGN KEY (`platform_id`) REFERENCES `investment_platforms`(`id`),
	CONSTRAINT "holdings_asset_type_check" CHECK("asset_type" IN ('stock', 'etf', 'fund', 'crypto', 'cash')),
	CONSTRAINT "holdings_state_check" CHECK("state" IN ('active', 'pending', 'closed')),
	CONSTRAINT "holdings_quantity_check" CHECK("quantity_micros" >= 0),
	CONSTRAINT "holdings_cost_basis_pair_check" CHECK(("cost_basis_minor" IS NULL) = ("cost_basis_currency" IS NULL)),
	CONSTRAINT "holdings_last_price_pair_check" CHECK(("last_price_minor" IS NULL) = ("last_price_currency" IS NULL)),
	CONSTRAINT "holdings_pending_price_check" CHECK("state" <> 'pending' OR "last_price_minor" IS NULL)
);
--> statement-breakpoint
CREATE INDEX `exchange_rates_quote_as_of_idx` ON `exchange_rates` (`quote_currency`,"as_of" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX `holdings_symbol_idx` ON `holdings` (`profile_id`,`platform_id`,`symbol`);--> statement-breakpoint
CREATE INDEX `holdings_profile_state_idx` ON `holdings` (`profile_id`,`state`);