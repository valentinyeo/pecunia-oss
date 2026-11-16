---
name: verify-pecunia
description: Drive Pecunia the way a user does and save proof for a money change. Seeds the demo book, launches the app or calls the money capability, captures evidence, and gates a pull request on it. Use for /verify-pecunia, any change to money, accounts, bank lines, categories, rules, dashboard sums, subscriptions, investments, FX conversion, tax, or invoices, and any claim that a money feature works.
plain: "Seed the demo book, drive the real path, save the evidence, and refuse a money claim without proof."
diagram: |-
  seed demo book
    │
  doctor
    │
  drive the user path
    │
  PROOF.md + proof.json
    │
  clean up, keep the evidence
---

# Verify Pecunia

Read `AGENTS.md` first. It is the law. This skill is the proof step for money work: it drives the real app like a user and leaves evidence a reviewer can read.

Pecunia's money promises are exact integer minor units, one profile per row, one bank port, jobs as machines, and one contract on every surface. A proof has to show those promises in the running product, not just in a test double.

## Launch

Pecunia has two launch modes. Use the mode named by the feature page you are proving.

**The demo book, today.** Every money feature has demo data on `main`. This is the only money path that exists until a screen or capability lands.

```sh
mkdir -p /tmp/pecunia-verify
pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify/demo.sqlite
```

Use Node `24.18.0` and pnpm `11.3.0`. The repository's `.nvmrc` and `packageManager` pin both.

Ready means the command exits 0 and logs `<table>: <n> rows` for every product table, including `transactions: 12 rows` and `profiles: 2 rows`. The seed refuses a file that already exists, a path outside the repository or the system temp directory, and a file without the `.sqlite` extension. That refusal is the guard against seeding over a real book.

Teardown: delete the scratch directory you created. The proof script does its own.

**The web app, once a money screen exists.** Build once, because the dev server reads built workspace packages:

```sh
pnpm turbo run build --filter=@pecunia/web...
```

Then pick one launcher:

- `pnpm dev` uses portless at `http://rat-stack.localhost:1355`. It needs the portless proxy. On a headless server with no TTY, `pnpm dev` fails with `Proxy is not running and no TTY is available for sudo`. Start the proxy once in a real terminal with `portless proxy start --port 1355 --https`, then run `pnpm dev`.
- Run Vite directly when there is no TTY: `cd apps/web && pnpm exec vite dev --host 127.0.0.1 --port 4321`.

Ready means `curl -fsS -o /dev/null http://127.0.0.1:4321/` exits 0. The first response can take 40 seconds while Vite optimizes dependencies. Teardown: kill the exact pid you started. Never kill by process name.

**A capability surface, once the slice lands it.** A money capability is one contract projected to web RPC (`/rpc`), MCP, and the CLI. The feature page names the exact route, tool, or command that slice added. Drive that surface. Do not add a back door for the proof.

## Doctor

Run this before the first drive, after a failed drive, and whenever the app answers but looks stale.

```sh
node --version
node -e "require('node:sqlite')"
command -v sqlite3 jq pnpm
git status --short
git rev-parse --abbrev-ref HEAD
```

What it answers:

- Node is `24.18.0` or newer and has `node:sqlite`.
- `sqlite3` and `jq` are the two tools the demo-proof helper needs.
- The worktree is on the branch you mean to prove and holds no surprise edits.
- The seed works: run the Launch command into a fresh `/tmp` path. If it refuses or fails, fix that before driving.

For the web app, add `curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4321/` and `ss -ltnp | grep 4321`. The port must belong to the process you started. A healthy process with a wedged page is not healthy: relaunch instead of hoping.

## Drive

Open the feature page in `skills/verify-pecunia/features/` for the thing you changed. It names the user path, the exact drive, and the proof a pull request must attach.

For every money feature on `main`, the drive is the demo-book helper:

```sh
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature dashboard-sums
```

The helper seeds a fresh demo book, runs the cross-cutting money checks plus that feature's checks, writes evidence, and deletes its scratch directory. It prints one line per check and exits 1 when any check fails. Run `--feature all` before a release or a broad money change.

When the feature page names a screen, drive the screen and its real transport:

- Read the server-rendered state with `curl -fsS http://127.0.0.1:4321/<route>`. Keep the HTML as evidence.
- A user action that writes goes through the app's RPC. `curl -fsS -X POST http://127.0.0.1:4321/rpc -H 'content-type: application/json' --data @action.json`. The body must match the capability's input schema. Keep the response as evidence.
- The same capability is the MCP tool and the CLI command. Drive the one the pull request claims to change, and drive it with the same input a person would type.

If a feature page says `planned`, no user surface exists. A pull request that claims the feature works is ahead of the app. Report that, do not fake the drive through a test-only endpoint.

## Evidence

Evidence lives under `skills/verify-pecunia/evidence/<yyyy-mm-dd>-<label>/` and is committed with the change.

- `PROOF.md`: the run label, what ran, the commands, the checks, the verdict, and what the run does not prove.
- `proof.json`: the same checks as data. `jq '.checks[] | select(.passed | not)' proof.json` lists every failure.
- `bank-import-drive.json`: the import capability drive, when the run covers accounts and bank lines.
- Manual runs add the captured action and result: `page.html`, `rpc-response.json`, and a screenshot when a browser is available. Name them in `PROOF.md`.

The recorded command must replay: the run label is printed in `PROOF.md` and in the command, and `node skills/verify-pecunia/scripts/replay-proof.mjs` replays every committed proof under a fresh label and compares the result with the saved evidence.

The proof standards:

1. Exercise the real user path. No internal setters and no test-only endpoints.
2. Capture the action and the resulting state. A final screen alone can hide a wrong step.
3. Verify the side effect as well as the screen: the database row, the file, the response body, the sync run counter.
4. Mock only where production already isolates the external system, such as a demo bank credential.
5. Assert exact minor units. `328955` is EUR 3,289.55. Never divide to a float in a proof.
6. Never overwrite an existing proof. Pick a new `--label`.
7. Keep the evidence after cleanup. A cleanup that eats the proof fails the run.

## Cleanup

- The demo-book helper removes its own `/tmp/pecunia-verify-*` directory on exit, including a failed run. Evidence is outside that directory and stays.
- Kill only the process you started. `pnpm dev` starts Vite and may start a portless proxy; record the pids before you walk away.
- Delete any scratch book you seeded by hand. Never delete a real database, a real `.env.local`, or the evidence folder.

## Feature map

`features/README.md` is the index, the status table, and the not-money capability table. Every money feature has one page beside it. Each page says what the feature promises, how a user reaches it, how to drive it, and the proof a pull request touching it must attach.

The status line on a page is one of `planned`, `partly built`, or `built`. `planned` means the user surface is not built and the page names the data-layer check that runs today. `partly built` means a capability exists but no screen or transport reaches it. `built` means the page names a route, tool, or command a person can drive.

The map is checked, not maintained by hand:

```sh
node skills/verify-pecunia/scripts/check-feature-map.mjs
```

It reads every capability implemented in the packages and apps and fails by name when a capability is on no feature page and not in the not-money table, when a page marks a feature planned while a capability for it exists, or when a page, the status table, and the repository disagree. Every demo-book run includes that check as `feature-map-matches-capabilities`.

## Helpers

`skills/verify-pecunia/scripts/prove-demo-book.sh` is the shipped helper and is executable.

```sh
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature all
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature invoices --label invoices-after-vendor-fix
bash skills/verify-pecunia/scripts/prove-demo-book.sh --help
```

It needs Node `24.18.0`, pnpm, `sqlite3`, and `jq`, all present on the project server. Its fence messages name the missing tool and the fix. `--evidence-root <dir>` writes the proof somewhere other than the committed evidence folder; the replay check uses it so a replay never overwrites a proof.

The other scripts are the three checks the helper runs or a reviewer runs by hand:

```sh
node skills/verify-pecunia/scripts/check-feature-map.mjs
node skills/verify-pecunia/scripts/drive-bank-import.mjs --database /tmp/pecunia-verify/demo.sqlite
node skills/verify-pecunia/scripts/replay-proof.mjs
```

`check-feature-map.mjs` fails by name when the map and the repository disagree. `drive-bank-import.mjs` drives `listImportTargets` and `importBankFile` against a seeded demo book and prints one JSON object. `replay-proof.mjs` reads every committed `PROOF.md`, replays its command under a fresh label in a temporary evidence root, and compares the replayed `proof.json` with the saved one by check id, expected value, observed value, and demo book hash. It fails by name when a saved check is missing or a saved observation changed.

## Gotchas

- `pnpm dev` needs the portless proxy, which needs a TTY or sudo. Vite on `127.0.0.1:4321` is the headless path.
- The first `pnpm dev` after a fresh clone fails in `predev` because `@pecunia/core/dist` is missing. Run the build command in Launch first.
- `pnpm install` also runs `lefthook install`. On a machine whose global `core.hooksPath` is set, that step fails after dependencies install. The dependencies are fine; do not reset the global hooks path.
- The demo book is dated 2025 and uses `en-GB`, `Europe/London`, and a UK tax year starting 6 April. Monthly exchange rates are dated the first of the month.
- The demo book has two profiles: `Example Ltd` (business) and `Demo Person` (personal). Every money check must stay inside one profile.
- The demo holdings are fixture values with large gains. Assert the exact demo values; do not read them as realistic returns.
- A `pending` bank line is not posted spend, a `cancelled` subscription is not active cost, and a `pending` holding has no price. Treating null or pending as zero is a money bug.
