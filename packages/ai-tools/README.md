# `@pecunia/ai-tools`

The tool layer an AI agent calls to read and change one profile's money: six named tools, one dispatcher, one audit log. No transport lives here yet.

## What it owns

- `contracts.ts`: the six contracts, each with a one-line description, an input schema, an output schema and a failure schema. `TOOL_NAMES` is the same list at runtime, so a name in the catalog and a name in the error message cannot drift.
- `catalog.ts`: the fixed table. `list_categories`, `list_lines`, `get_line`, `suggest_category`, `confirm_category` and `list_reports`. Read or write comes from the contract's `readOnly` annotation, so a tool cannot claim to be a read while it writes. There is no `run_sql`, no free-form query field, and no tool whose input names a profile.
- `dispatch.ts`: the boundary. It takes a tool name and a raw `Schema.Json` value from an untrusted caller, refuses an unknown tool by name, checks who is acting, refuses a write for a viewer of the profile, and only then parses input. Input is parsed with `onExcessProperty: "error"`, so an injected `profileId` or `profile_id` is a refusal, not a silently ignored field. Output is encoded and parsed again before it leaves, so a handler that returns the wrong shape is a refusal rather than a wrong answer.
- `refusal.ts`: `ToolRefused` with a `reason` (`unknownTool`, `unknownField`, `missingField`, `invalidField`, `invalidOutput`, `notFound`, `notPermitted`, `alreadyConfirmed`, `handlerFailed`) and the `field` the caller got wrong. The message says what to do next. Every other failure the handlers raise is folded into one of these, so a caller sees one error shape on every surface.
- `audit.ts`: the `AuditLog` port and an in-memory adapter. Every call appends exactly one entry: tool, acting profile, the caller's access, the outcome with its reason, and a timestamp from the injected `Clock`. It records the input and output sizes, never their contents, so a log line can never carry an amount, a payee or a note.
- `caller.ts`: `ToolCaller`, the context that says which person is acting and for which profile. The profile a call touches comes from here and nowhere else.
- `capabilities.ts`: the six handlers, each behind `implement`, each opening its work with `readScopeOf` or `writeScopeOf` from `@pecunia/bank-lines`, which calls `authorize` from `@pecunia/access`. A handler cannot build a write scope for a viewer, so a viewer write is unrepresentable rather than a check to remember.
- `model.ts`, `day.ts`, `order.ts`: the wire schemas, the day-range arithmetic, and the ordering. A `from` later than `to` is a refusal naming `from`; a day that is not on the calendar is a refusal naming the field.
- `category-store.ts`, `report-store.ts`, `suggestion-store.ts`, `memory.ts`: the `CategoryStore`, `ReportStore` and `SuggestionStore` ports with in-memory adapters, and the seed that builds a whole in-memory world.

`suggest_category` writes a `CategorySuggestion` and nothing else. Only `confirm_category` writes a person-confirmed category on a line. That is the trust boundary this package exists to keep.

## What it does not own yet

No MCP or HTTP transport. `dispatchTool` is the function a transport will call once one lands, and it takes plain JSON in and returns plain JSON out.

Lines and categories are read through ports backed by `@pecunia/bank-lines`'s in-memory store today. The D1-backed adapters and the real category, report and suggestion tables land with those slices; this package only knows the ports.

## Proof

`test/tools.test.ts` proves the catalog holds exactly the six named tools and no SQL or free-form query field, that a read is read and a write is write, that a limit outside `1..200`, a missing field, an invented field and a wrong type are each refused by field name, that a cursor made under another filter is refused, that a viewer reads and cannot write, that a stranger gets nothing, and that each call writes exactly one audit entry with sizes but no contents.

`test/tool-layer.property.test.ts` runs 700 seeded cases over generated tool names, inputs (valid, extra fields, wrong types, injected profile ids, limits out of range), roles and profiles. Every case proves: exactly one audit entry, a read-only caller changes no state and never runs a write tool, a refused call changes no state, a successful call reads only the acting profile, no case writes another profile, and a suggestion never changes a line's category.

`test/day.test.ts` runs 650 seeded cases over ordinary days, leap days, month ends, the 1970 floor and ranges that run backwards, against an independent calendar written in the test.

```sh
pnpm exec vitest run packages/ai-tools/test
pnpm --filter @pecunia/ai-tools check
```
