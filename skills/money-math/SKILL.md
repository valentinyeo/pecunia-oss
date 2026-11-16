---
name: money-math
description: Verify Pecunia's money arithmetic against the database that enforces it. Use before or after changing a minor-unit column, a currency exponent, the conversion tolerance, the foreign-minor limit, or a money CHECK constraint, and when asked "is money still exact", "prove the conversion", or "did this migration change the money rules".
plain: "Money is integer minor units with a currency code. Prove the database still accepts every safe amount, code, exponent and conversion tolerance."
diagram: |-
  money rule changed?
  ├ amount   → integer range
  ├ currency → three letters
  ├ pair     → identity
  ├ exponent → powers of ten
  ├ convert  → one unit off
  └ foreign  → within limit
      │
  600 cases → real SQLite
---

# Money math

Money in this repo is an integer of minor units plus an ISO currency code. A float in a balance, a total or a conversion is a bug. The database is the last line of defence: the D1 `CHECK` constraints refuse a bad amount even when an agent writes the insert by hand.

This skill verifies the arithmetic those constraints enforce. It runs the real SQLite database built from the real migrations, not a model of it, and it checks each rule over its full range: safe-integer edges, every currency exponent class, the exact conversion tolerance, and both edges of the foreign-minor limit.

Harm if this breaks: a balance gains or loses a minor unit, a conversion is trusted when it is off by more than the stated tolerance, or a stored amount stops being an exact integer. Users see wrong money and cannot tell which row is wrong.

## Run it

From `packages/database`:

```sh
pnpm exec vitest run test/money-property.test.ts
```

That is the whole check. It takes about ten seconds, needs no network and no build, and prints the failing amount, currencies and rate when a rule breaks. Do not run the repo-wide suite for this.

## What it proves

The file is `packages/database/test/money-property.test.ts`. Each property runs at least 600 cases from a seeded generator (`makeRandom`, mulberry32) inside the file, so every failure reproduces exactly. Do not swap the generator for fast-check: the seed and the case count are the contract.

| Property | Rule | Enforced by |
| --- | --- | --- |
| money columns accept exactly the safe integers | `typeof = 'integer'` and `abs(amount) <= 9007199254740991` | `*_base_minor_integer_check`, `*_source_minor_integer_check` |
| currency columns accept exactly three uppercase letters | `length = 3` and `GLOB '[A-Z][A-Z][A-Z]'` and no NUL | `*_base_currency_code_check`, `*_source_currency_code_check` |
| a same-currency row stores one amount in both columns | `source = base` for an equal pair | `transactions_base_amount_check` |
| a source amount converts by ten to the exponent difference | `base = source * 10 ^ (exp(base) - exp(source))` at rate 1 | exponent `CASE` inside `transactions_rate_amount_check` |
| a conversion stays within one base minor unit | `abs(base - source * rate * 10 ^ difference) <= 1` | `transactions_rate_amount_check` |
| a conversion may sit one base minor unit from the product, never two | the accepted integers are exactly those within 1 of the product | `transactions_rate_amount_check` |
| the foreign bound refuses one minor unit past the limit | `abs(source) <= 1000000000000` and `abs(base) <= 1000000000000` on a foreign row | `transactions_rate_amount_bound_check`, `foreignMinorLimit` |
| the foreign bound checks the source and the base separately | either side crossing the limit refuses the row | `transactions_rate_amount_bound_check` |

The verified artifact is the migration SQL in `packages/database/migrations/d1/`, generated from `packages/database/src/schema/d1.ts`. Editing the Drizzle schema alone changes nothing that runs. A money rule changes only through a new numbered migration, and this check reads the migrations that are actually on disk.

The exponent table in the test is ISO 4217: 0 for JPY, ISK, XOF and the rest, 2 by default, 3 for BHD, KWD and the rest, 4 for CLF and UYW. The test proves the SQL uses the same table for the four exponent classes and for differences from -4 to 4.

## Coverage record

- Covered code: `packages/database/src/schema/limits.ts` (`foreignMinorLimit`), and in `packages/database/src/schema/d1.ts`: `integerChecks`, `currencyCodeCheck`, `minorUnitExponents`, `convertedBaseMinorSql`, `rateAmountCheck`, `rateAmountBoundCheck`.
- Verified through: `packages/database/migrations/d1/20261116120151_ledger/migration.sql` (the money constraints) and every later migration that rebuilds those tables.
- Sync commit: `cd6a11b7aab75790aa8f1f945bf3b21da2818633`.
- Move the sync commit forward only after you confirm the migrations still describe the rules above at the new commit. If a rule changed on purpose, update the table and the property in the same change, then move it.

## Pending, owned by the money model

The branded `Money` type and its arithmetic are not on `main` yet. They belong to `@pecunia/core-model` (PR 4). Do not add a second implementation here to fill the gap. When that package lands, this skill covers these rules:

- `Money` construction and parsing at the boundary, including the currency code and the minor-unit exponent.
- Addition and subtraction across equal currencies, and the refusal of mixed currencies.
- Rounding for display and for a conversion result, with an explicit rounding mode.
- Conversion in TypeScript, with the same one-minor-unit tolerance the SQL check states.

Until then, the database is the only executable statement of the money rules, and this skill is the proof over its full range.

## Read a failure

The assertion message names the amount, the source and base currency, the rate, the stored base amount, and the constraint the model expected.

- A real bug: the migration changed the arithmetic, the exponent table, the limit or the integer range, and the rule above still describes what Pecunia promises. Fix the product with a new numbered migration, then rerun. Do not weaken the property.
- A model error: the ISO exponent table in the test is wrong, or the expression order no longer matches the SQL. Fix the test, not the database. The model multiplies first and then divides or multiplies by a power of ten, in the same order and the same IEEE doubles as SQLite. Do not replace it with exact rational maths: the check compares a double, and the model must compare the same double.
- An intended rule change: update the property, the table above and the ticket together. A property that was never seen failing proves nothing, so plant the old rule as a scratch edit and watch it fail before you trust the new one.

## When you add a money column

Add it to the relevant property and to the coverage table. A new amount column needs the safe-integer property. A new currency column needs the three-letter property. A new conversion needs the tolerance and bound properties, including its currency's exponent class. Then rerun the command and update the sync commit.
