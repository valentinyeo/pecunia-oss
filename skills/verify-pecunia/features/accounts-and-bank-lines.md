# Accounts and bank lines

Status: partly built. The import capability exists on `main` with its checks. No screen, RPC route, MCP tool, or CLI command reaches it yet.

## What it promises

- A bank line is stored once per account. The same provider line imported twice is one row, keyed by the account and the provider's external id.
- A bank line belongs to exactly one profile, and so does its account. No query returns another profile's line.
- Each line keeps its source amount and currency next to its base amount and currency. The base amount is exact integer minor units, never a float.
- A sync run is a named state with counters. A failed run says what failed and quarantines the lines it rejected. A half-import is a state you can see, not a silent gap.
- Accounts are read-only from the provider. Pecunia never moves money.

## Capabilities

- `listImportTargets` (`packages/bank-import/src/capabilities.ts`) lists the bank and CSV accounts a profile can import a file into, with each account's base currency.
- `importBankFile` (`packages/bank-import/src/capabilities.ts`) imports a bank CSV into one account and keeps every distinct line once by its fingerprint.
- `listBankLines` (`packages/bank-lines/src/capabilities.ts`) lists one profile's bank lines with a filter, a search, and a cursor.
- `editBankLine` (`packages/bank-lines/src/capabilities.ts`) edits one line's category and note inside the profile it belongs to.
- `reviewBankLine` (`packages/bank-lines/src/capabilities.ts`) marks one line reviewed inside the profile it belongs to.

All are implemented and tested at the package level. The RPC, MCP, and CLI projections do not carry them yet; the slice that adds the projection updates this page with the exact route, tool, and command.

## Sub-features

- Account list, with label, kind (`bank` or `investment`), provider, last sync time, and archived state.
- Bank line list, filter and search by text, account, date, direction, status, category, and classification.
- Edit a line's category and note.
- Mark a line reviewed. The `transactions` table has no reviewed column yet; the slice that adds this owns its numbered migration.
- Sync runs with imported, skipped, rejected counters, and the quarantined lines behind a rejection.
- Line detail: source amount, fee, base amount, rate and rate date, raw merchant, reference, description, and the run that imported it.
- Import a bank CSV into an account: list the targets, import the file, replay it with no new rows, name each rejected line, and refuse an account the profile does not hold.

## How to get to it (user POV)

Today: the import capabilities through their package handlers, and the demo book through SQLite. No screen or transport.

Planned: the accounts section of the app, then an account, then its lines. The bank-lines slice adds the list, filter, search, edit, and review surfaces, and the same capability reaches MCP and the CLI. This page gets the exact route and tool name from that slice, not before.

## Driving it with the demo book

```sh
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature accounts-and-bank-lines
```

The demo book gives you `Demo Bank` (kind `bank`, provider `Wise`, base currency EUR) and `Demo Broker` (kind `investment`, provider `Trading 212`) for `Example Ltd`, 12 bank lines, one succeeded sync run, and one failed run with two quarantined lines.

Checks this drive runs, on top of the five cross-cutting checks:

- `bank-lines-stay-in-their-account`: every line's account profile equals the line's profile.
- `bank-lines-never-repeat`: no two lines in one account share an external id.
- `demo-accounts`: the two demo accounts exist with the promised kinds.
- `demo-sync-runs`: one run succeeded and one failed.
- `sync-import-count-matches-lines`: the succeeded run's `imported` counter equals the rows it wrote.
- `sync-failure-names-itself`: the failed run has a failure tag.
- `sync-rejections-match-count`: the failed run's `rejected` counter equals its quarantine rows.
- `import-targets-listed`: `Demo Bank` is the import target for `Example Ltd`, kind `bank`, base currency EUR, provider `Wise`.
- `import-writes-every-line`: the demo CSV imports five lines with nothing rejected.
- `import-stores-every-line`: reading the ledger back through `ImportLedger.storedLines` finds every field of the same five rows the demo CSV names: date, amount, currency, description, reference, fingerprint.
- `import-replay-adds-nothing`: importing the same file again imports zero rows and reports five already imported.
- `import-replay-stores-nothing`: after the replay the ledger still reads back the same five full rows.
- `import-names-a-rejected-line`: a file with one good line and one bad date imports one row, rejects one, and names `bad-date`.
- `import-refuses-unknown-account`: an account the profile does not hold fails with `ImportAccountNotFound`.

The three bank-line capabilities have their own steps, so a run that skips one is a failed proof by name:

- `bank-line-list-returns-the-demo-book`: the listing returns all 12 demo lines, 2 of them awaiting review.
- `bank-line-list-orders-newest-first`: the listing orders by occurred time, newest first.
- `bank-line-list-filters-by-direction`: an `out` filter returns the 8 out lines and nothing else.
- `bank-line-list-pages-without-repeats`: two pages of 5 lines share no line.
- `bank-line-edit-sets-category-and-note`: an edit writes the category and the note.
- `bank-line-edit-stores-category-and-note`: `listBankLines` reads back every field of all 12 lines, and the edited line carries the new category and note.
- `bank-line-edit-keeps-the-line-in-its-profile`: the edit returns the same line in the same profile.
- `bank-line-edit-refuses-an-unknown-line`: an edit of a missing line fails with `UnknownBankLine`.
- `bank-line-edit-refuses-a-foreign-category`: an edit to a category outside the profile fails with `UnknownCategory`.
- `bank-line-review-marks-the-line`: a review returns the line with a recorded review time.
- `bank-line-review-shows-in-the-list`: `listBankLines` reads back every field of all 12 lines, and the reviewed line carries the review mark at the drive's fixed clock.
- `bank-line-review-refuses-a-viewer`: a read-only member cannot review a line and gets `Forbidden`.

Read a failure with `jq '.checks[] | select(.passed | not)' skills/verify-pecunia/evidence/<date>-<label>/proof.json`.

## Driving the capability handlers by hand

```sh
pnpm turbo run build --filter=@pecunia/bank-import...
pnpm turbo run build --filter=@pecunia/bank-lines...
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature accounts-and-bank-lines
node skills/verify-pecunia/scripts/drive-bank-import.mjs --database /tmp/pecunia-verify/demo.sqlite
node skills/verify-pecunia/scripts/drive-bank-lines.mjs --capability list
node skills/verify-pecunia/scripts/drive-bank-lines.mjs --capability edit
node skills/verify-pecunia/scripts/drive-bank-lines.mjs --capability review
```

`drive-bank-import.mjs` reads the seeded demo book for its import targets, then drives `listImportTargets` and `importBankFile` through the package handlers with the memory ledger and the demo CSV fixture. It prints its named observations as one JSON object: the listed target, the first import summary, the ledger read back through `ImportLedger.storedLines`, the replay summary, the ledger read back again after the replay, the rejected line, and the unknown-account refusal. The helper writes the same object to `bank-import-drive.json` next to `proof.json`.

`drive-bank-lines.mjs` drives one bank-line capability per run against the demo seed with the memory store. `list` observes the total and awaiting count, the ordering, the out filter with its `allOut` flag, and the two pages. `edit` observes the returned category and note, the same values read back from the listing, the line's profile, and the two refusals. `review` observes the review tag and time, the list read-back, and the viewer refusal. Every step that writes ends with a readback through a read path the write did not use. The helper writes each object to `bank-line-<capability>-drive.json` next to `proof.json`. No drive compares a value with an expected one; `scripts/verdict.mjs` does that from `scripts/step-table.json`.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its `PROOF.md`, `proof.json`, `bank-import-drive.json`, `bank-line-list-drive.json`, `bank-line-edit-drive.json`, and `bank-line-review-drive.json` committed.
2. For an import change: the drive output showing five imported, zero on replay, the rejected line named, and the unknown account refused; plus the focused test at the capability seam. If the change adds persistence or a transport, the stored rows read back and the route, tool, or command response.
3. For a listing, edit, or review change: the drive output for that capability, plus its check ids in `PROOF.md`. A capability removed from the step table fails the run by name.
4. The user path, once the screen or transport lands: the list or detail HTML from the running app, the RPC request and response for an edit, and the row read back from the database after the edit.
5. A focused test at the new seam. A property test over generated filters if the slice adds filtering: a filtered list is always a subset of the unfiltered list, and paging never repeats or drops a line.
6. If the change adds the reviewed state, the numbered migration and the run again on the migrated demo book.
7. No schema edit to an applied migration.

## Gotchas

- The idempotency key is `(provider_account_id, external_id)` for synced lines and the line fingerprint for imported lines. A change that alters either key imports duplicates.
- The import drive uses the package memory ledger. It proves the parse, fingerprint, and dedupe rules, not that a persistent store keeps them.
- A failed sync keeps its quarantine rows. Deleting them hides the evidence a user needs to retry.
- The demo's failed run rejected two lines: one unknown account and one missing currency. Both are deliberate demo rejections.
- `neutral` direction lines are transfers, not spend. Do not count them in a balance of spending.
- The demo book has a personal profile with one category and no bank lines. A query that ignores `profile_id` will look fine on the business book and leak on a real account.
