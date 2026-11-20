# AI tools

Status: partly built. The six tool capabilities, their dispatcher, their refusal shape, and their audit log exist on `main` with tests. No MCP server, CLI command, RPC route, screen, or D1 adapter reaches them yet.

## What it promises

- An assistant calls six named tools and nothing else. There is no `run_sql`, no free-form query field, and no tool input that names a profile.
- Every call acts for one person in one profile. The profile comes from the caller context, never from the request.
- A viewer reads the profile and cannot write it. A stranger gets nothing.
- A suggestion never becomes a confirmed category. Only `confirm_category` writes a person-confirmed category on a line.
- Every failure is one shape: a reason and the field the caller got wrong, with a message that says what to do next.
- Every call appends exactly one audit entry with the tool, the profile, the caller's access, the outcome, and a timestamp. It records input and output sizes, never their contents.
- Amounts are integer minor units with a currency code. No float crosses the tool boundary.

## Capabilities

- `list_categories` (`packages/ai-tools/src/capabilities.ts`) lists the acting profile's categories, archived ones included, ordered by name then id, at most 200.
- `list_lines` (`packages/ai-tools/src/capabilities.ts`) lists the acting profile's bank lines newest first, with a day range, a category, a text match over merchant, description, reference and note, a limit of 1 to 200, and a keyset cursor.
- `get_line` (`packages/ai-tools/src/capabilities.ts`) reads one bank line of the acting profile by id, with its category and review state. A line in another profile is `notFound`.
- `suggest_category` (`packages/ai-tools/src/capabilities.ts`) stores a category suggestion on one of the acting profile's lines and refuses a line that already carries a confirmed category.
- `confirm_category` (`packages/ai-tools/src/capabilities.ts`) writes the person-confirmed category on one of the acting profile's lines through `BankLineService.edit`.
- `list_reports` (`packages/ai-tools/src/capabilities.ts`) lists the acting profile's saved report summaries newest first, at most 200, without their HTML.

Each one is bound with `implement` and opens its work with `readScopeOf` or `writeScopeOf` from `@pecunia/bank-lines`, which calls `authorize` from `@pecunia/access`. A viewer cannot build a write scope, so a viewer write is unrepresentable rather than a check to remember.

`packages/ai-tools/src/catalog.ts` builds the tool table from `toolOf`, so read or write comes from the contract's `readOnly` annotation and a tool cannot claim to be a read while it writes. `packages/ai-tools/src/dispatch.ts` is the boundary a transport will call: it refuses an unknown tool by name, refuses a stranger, refuses a viewer's write, and refuses an excess property, so an injected `profileId` is a refusal rather than a dropped field. It parses input, runs the handler, then encodes and parses output again so a wrong shape is a refusal, not a wrong answer.

## What is built

- The six contracts in `packages/ai-tools/src/contracts.ts`, each with a description, an input schema, an output schema, and `ToolFailureSchema`. `TOOL_NAMES` is the same list at runtime, so a name in the catalog and a name in a refusal cannot drift.
- The dispatch boundary above, the `ToolRefused` reasons in `packages/ai-tools/src/refusal.ts`, and the `AuditLog` port with its in-memory adapter in `packages/ai-tools/src/audit.ts`.
- The read ports with in-memory adapters: `CategoryStore`, `ReportStore`, and `SuggestionStore`, plus the `@pecunia/bank-lines` in-memory store behind lines and categories.
- `packages/ai-tools/test/tools.test.ts` proves the catalog holds exactly the six named tools and no query field, that a read is a read and a write is a write, that a limit outside 1..200, a missing field, an invented field, and a wrong type are each refused by field name, that a cursor made under another filter is refused, that a viewer reads and cannot write, that a stranger gets nothing on every tool, and that each call writes one audit entry with sizes and no contents.
- `packages/ai-tools/test/tool-layer.property.test.ts` runs seeded cases over generated tool names, inputs, roles, and profiles. Every case proves exactly one audit entry, that a read-only caller changes no state, that a refused call changes no state, that a successful call touches only the acting profile, and that a suggestion never changes a line's category.
- `packages/ai-tools/test/day.test.ts` runs seeded cases over ordinary days, leap days, month ends, the 1970 floor, and ranges that run backwards, against an independent calendar written in the test.

```sh
pnpm exec vitest run packages/ai-tools/test
pnpm --filter @pecunia/ai-tools check
```

## What is not built

- A transport. There is no MCP server, no HTTP or RPC route, and no `mcp` composition for these tools in `apps/cli`. `dispatchTool` takes plain JSON in and returns plain JSON out, and it is the function a transport will call.
- The bearer token door in front of the assistant. Dispatch decides who is acting and what that person may do; the door that decides whether a caller reaches dispatch at all does not exist here.
- D1-backed category, report, and suggestion stores, and their tables and numbered migrations. Lines and categories read through the in-memory store today.
- A screen. No route shows a suggestion, a report list, or the result of a confirmation.
- A D1-backed world for the drive. The drive below reads a small in-memory world, so it proves the tool layer and not a stored book.

## How to get to it (user POV)

Today: nowhere a person can click. The tools answer through `dispatchTool`, which is what the drive below and the package tests call.

Planned: an assistant door in front of `dispatchTool`, with its own token check, reachable over MCP and from the CLI. The slice that adds the door names the tool list and the route.

## Driving it with the demo book

```sh
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature ai-tools
```

The drive is `skills/verify-pecunia/scripts/drive-ai-tools.mjs`. It builds a made-up in-memory world of two categories, two lines, and two reports, then calls every tool through `dispatchTool` as an owner and a viewer. It writes its named observations to `ai-tools-drive.json` next to `proof.json`. No observation compares itself with an expected value; `scripts/verdict.mjs` does that from `scripts/step-table.json`.

Checks this drive runs, on top of the cross-cutting checks:

- `ai-tools-catalog`: the catalog holds the six tools, four reads and two writes, with no query tool.
- `ai-tools-lists-categories`: `list_categories` returns the profile's two categories by name.
- `ai-tools-lists-lines`: `list_lines` returns both lines with a total and no next cursor.
- `ai-tools-reads-one-line`: `get_line` returns one line with no category and an awaiting review.
- `ai-tools-suggests-without-confirming`: `suggest_category` stores a suggestion and leaves the line's category empty.
- `ai-tools-confirms-a-category`: `confirm_category` returns the line carrying the chosen category.
- `ai-tools-confirmed-line-reads-back`: `list_lines`, a read path the write did not use, returns the confirmed category on that line.
- `ai-tools-lists-reports`: `list_reports` returns both report summaries newest first, without their HTML.
- `ai-tools-refuses-a-viewer-write`: a viewer's `suggest_category` is refused with `notPermitted` and writes nothing.
- `ai-tools-refuses-an-unknown-tool`: a call to `run_sql` is refused with `unknownTool`.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its `PROOF.md`, `proof.json`, and `ai-tools-drive.json` committed.
2. The output of `pnpm exec vitest run packages/ai-tools/test` and `pnpm --filter @pecunia/ai-tools check`, both green.
3. For a new or changed tool: the contract, the catalog entry, the drive, and this page changed together. The tool count and the read or write annotation are in the test, not only in prose.
4. For a new refusal: the reason, the field, and the message a caller sees. A refusal that names neither the field nor the fix fails review.
5. For a new store: the port, the in-memory adapter, the property test that no case writes another profile, and, once one exists, the D1 adapter with its numbered migration.
6. Once a transport lands: one read and one write through that transport as a caller sees them, plus the audit entry each wrote. A proof that calls the handler directly does not prove the transport.

## Gotchas

- Excess properties are refused on purpose. Do not relax input parsing to drop an injected `profileId`: the refusal is the guard that keeps the profile out of a request.
- A cursor carries a fingerprint of the profile, the filter, and the search that made it. Reusing it under another filter is a refusal naming `cursor`.
- `suggest_category` writes a suggestion and nothing on the line. A test that reads a confirmed category after a suggestion has found a bug, not a feature.
- A viewer's write is refused twice: dispatch sees the caller's read grant before the handler runs, and `writeScopeOf` cannot build a write scope for a viewer. A handler that skips the scope call keeps only the first guard.
- The audit log holds sizes, not contents. Adding input or output contents would put amounts, payees, and notes into logs.
- A `from` later than `to` is a refusal naming `from`, and a day that is not on the calendar is a refusal naming that field. Both are checked before any store is read.
