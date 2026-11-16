CREATE TABLE `exchange_rates` (
	`as_of` text NOT NULL,
	`base_currency` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`quote_currency` text NOT NULL,
	`rate` real NOT NULL,
	CONSTRAINT `exchange_rates_pk` PRIMARY KEY(`base_currency`, `quote_currency`, `as_of`),
	CONSTRAINT "exchange_rates_base_currency_code_check" CHECK(typeof("base_currency") = 'text' AND length("base_currency") = 3 AND instr("base_currency", char(0)) = 0 AND "base_currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "exchange_rates_quote_currency_code_check" CHECK(typeof("quote_currency") = 'text' AND length("quote_currency") = 3 AND instr("quote_currency", char(0)) = 0 AND "quote_currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "exchange_rates_fetched_at_integer_check" CHECK(typeof("fetched_at") = 'integer' AND "fetched_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "exchange_rates_as_of_date_check" CHECK(typeof("as_of") = 'text' AND length("as_of") = 10 AND "as_of" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "exchange_rates_rate_check" CHECK(typeof("rate") = 'real' AND "rate" > 0 AND "rate" < 1e300)
);
--> statement-breakpoint
CREATE TABLE `holdings` (
	`asset_type` text NOT NULL,
	`cost_basis_currency` text,
	`cost_basis_minor` integer,
	`created_at` integer NOT NULL,
	`currency` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
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
	CONSTRAINT `fk_holdings_profile_id_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`),
	CONSTRAINT "holdings_currency_code_check" CHECK(typeof("currency") = 'text' AND length("currency") = 3 AND instr("currency", char(0)) = 0 AND "currency" GLOB '[A-Z][A-Z][A-Z]'),
	CONSTRAINT "holdings_cost_basis_currency_code_check" CHECK("cost_basis_currency" IS NULL OR (typeof("cost_basis_currency") = 'text' AND length("cost_basis_currency") = 3 AND instr("cost_basis_currency", char(0)) = 0 AND "cost_basis_currency" GLOB '[A-Z][A-Z][A-Z]')),
	CONSTRAINT "holdings_last_price_currency_code_check" CHECK("last_price_currency" IS NULL OR (typeof("last_price_currency") = 'text' AND length("last_price_currency") = 3 AND instr("last_price_currency", char(0)) = 0 AND "last_price_currency" GLOB '[A-Z][A-Z][A-Z]')),
	CONSTRAINT "holdings_cost_basis_minor_integer_check" CHECK("cost_basis_minor" IS NULL OR (typeof("cost_basis_minor") = 'integer' AND "cost_basis_minor" BETWEEN -9007199254740991 AND 9007199254740991)),
	CONSTRAINT "holdings_created_at_integer_check" CHECK(typeof("created_at") = 'integer' AND "created_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "holdings_last_price_minor_integer_check" CHECK("last_price_minor" IS NULL OR (typeof("last_price_minor") = 'integer' AND "last_price_minor" BETWEEN -9007199254740991 AND 9007199254740991)),
	CONSTRAINT "holdings_priced_at_integer_check" CHECK("priced_at" IS NULL OR (typeof("priced_at") = 'integer' AND "priced_at" BETWEEN -9007199254740991 AND 9007199254740991)),
	CONSTRAINT "holdings_quantity_micros_integer_check" CHECK(typeof("quantity_micros") = 'integer' AND "quantity_micros" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "holdings_updated_at_integer_check" CHECK(typeof("updated_at") = 'integer' AND "updated_at" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "holdings_opened_on_date_check" CHECK(typeof("opened_on") = 'text' AND length("opened_on") = 10 AND "opened_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
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
CREATE UNIQUE INDEX `holdings_profile_id_idx` ON `holdings` (`profile_id`,`id`);--> statement-breakpoint
CREATE INDEX `holdings_profile_state_idx` ON `holdings` (`profile_id`,`state`);