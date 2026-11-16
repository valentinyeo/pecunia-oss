# Accounts and bank lines

Status: planned. The schema, the demo fixtures, and the sync-run records exist on `main`. No capability, screen, CLI command, or MCP tool yet.

## What it promises

- A bank line is stored once per account. The same provider line imported twice is one row, keyed by the account and the provider's external id.
- A bank line belongs to exactly one profile, and so does its account. No query returns another profile's line.
- Each line keeps its source amount and currency next to its base amount and currency. The base amount is exact integer minor units, never a float.
- A sync run is a named state with counters. A failed run says what failed and quarantines the lines it rejected. A half-import is a state you can see, not a silent gap.
- Accounts are read-only from the provider. Pecunia never moves money.

## Sub-features

- Account list, with label, kind (`bank` or `investment`), provider, last sync time, and archived state.
- Bank line list, filter and search by text, account, date, direction, status, category, and classification.
- Edit a line's category and note.
- Mark a line reviewed. The `transactions` table has no reviewed column yet; the slice that adds this owns its numbered migration.
- Sync runs with imported, skipped, rejected counters, and the quarantined lines behind a rejection.
- Line detail: source amount, fee, base amount, rate and rate date, raw merchant, reference, description, and the run that imported it.

## How to get to it (user POV)

Today: nowhere. The data sits in the demo book and the template web app on `main` is still the docs reader.

Planned: the accounts section of the app, then an account, then its lines. The bank-lines slice adds the list, filter, search, edit, and review surfaces, and the same capability reaches MCP and the CLI. This page gets the exact route and tool name from that slice, not before.

## Driving it with the demo book

```sh
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature accounts-and-bank-lines
```

The demo book gives you `Demo Bank` (kind `bank`, provider `wise`) and `Demo Broker` (kind `investment`, provider `trading212`) for `Example Ltd`, 12 bank lines, one succeeded sync run, and one failed run with two quarantined lines.

Checks this drive runs, on top of the four cross-cutting money checks:

- `bank-lines-stay-in-their-account`: every line's account profile equals the line's profile.
- `bank-lines-never-repeat`: no two lines in one account share an external id.
- `demo-accounts`: the two demo accounts exist with the promised kinds.
- `demo-sync-runs`: one run succeeded and one failed.
- `sync-import-count-matches-lines`: the succeeded run's `imported` counter equals the rows it wrote.
- `sync-failure-names-itself`: the failed run has a failure tag.
- `sync-rejections-match-count`: the failed run's `rejected` counter equals its quarantine rows.

Read a failure with `jq '.checks[] | select(.passed | not)' skills/verify-pecunia/evidence/<date>-<label>/proof.json`.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its `PROOF.md` and `proof.json` committed.
2. The user path, once the slice lands: the list or detail HTML from the running app, the RPC request and response for an edit, and the row read back from the database after the edit.
3. A focused test at the new seam. A property test over generated filters if the slice adds filtering: a filtered list is always a subset of the unfiltered list, and paging never repeats or drops a line.
4. If the change adds the reviewed state, the numbered migration and the run again on the migrated demo book.
5. No schema edit to an applied migration.

## Gotchas

- The idempotency key is `(provider_account_id, external_id)`. A sync that changes the key imports duplicates.
- A failed sync keeps its quarantine rows. Deleting them hides the evidence a user needs to retry.
- The demo's failed run rejected two lines: one unknown account and one missing currency. Both are deliberate demo rejections.
- `neutral` direction lines are transfers, not spend. Do not count them in a balance of spending.
- The demo book has a personal profile with one category and no bank lines. A query that ignores `profile_id` will look fine on the business book and leak on a real account.
