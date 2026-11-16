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
- `import-replay-adds-nothing`: importing the same file again imports zero rows and reports five already imported.
- `import-names-a-rejected-line`: a file with one good line and one bad date imports one row, rejects one, and names `bad-date`.
- `import-refuses-unknown-account`: an account the profile does not hold fails with `ImportAccountNotFound`.

Read a failure with `jq '.checks[] | select(.passed | not)' skills/verify-pecunia/evidence/<date>-<label>/proof.json`.

## Driving the import capability by hand

```sh
pnpm turbo run build --filter=@pecunia/bank-import...
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature accounts-and-bank-lines
node skills/verify-pecunia/scripts/drive-bank-import.mjs --database /tmp/pecunia-verify/demo.sqlite
```

The last command reads the seeded demo book for its import targets, then drives `listImportTargets` and `importBankFile` through the package handlers with the memory ledger and the demo CSV fixture. It prints one JSON object: the listed targets, the first import summary, the replay summary, the rejected line, and the unknown-account refusal. The helper writes the same object to `bank-import-drive.json` next to `proof.json`.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its `PROOF.md`, `proof.json`, and `bank-import-drive.json` committed.
2. For an import change: the drive output showing five imported, zero on replay, the rejected line named, and the unknown account refused; plus the focused test at the capability seam. If the change adds persistence or a transport, the stored rows read back and the route, tool, or command response.
3. The user path, once the screen or transport lands: the list or detail HTML from the running app, the RPC request and response for an edit, and the row read back from the database after the edit.
4. A focused test at the new seam. A property test over generated filters if the slice adds filtering: a filtered list is always a subset of the unfiltered list, and paging never repeats or drops a line.
5. If the change adds the reviewed state, the numbered migration and the run again on the migrated demo book.
6. No schema edit to an applied migration.

## Gotchas

- The idempotency key is `(provider_account_id, external_id)` for synced lines and the line fingerprint for imported lines. A change that alters either key imports duplicates.
- The import drive uses the package memory ledger. It proves the parse, fingerprint, and dedupe rules, not that a persistent store keeps them.
- A failed sync keeps its quarantine rows. Deleting them hides the evidence a user needs to retry.
- The demo's failed run rejected two lines: one unknown account and one missing currency. Both are deliberate demo rejections.
- `neutral` direction lines are transfers, not spend. Do not count them in a balance of spending.
- The demo book has a personal profile with one category and no bank lines. A query that ignores `profile_id` will look fine on the business book and leak on a real account.
