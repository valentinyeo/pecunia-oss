# Pecunia feature map

One page per money feature. Each page answers three questions: what the feature promises, how to drive it, and what proof a pull request touching it must attach.

The map is the maintained verification source. A proof that drives one convenient entry point is incomplete when the map lists another.

## Status

| Feature | Status | User surface today | Demo-book drive |
| --- | --- | --- | --- |
| [Accounts and bank lines](accounts-and-bank-lines.md) | partly built | import capabilities and a transactions screen on client demo data, no transport | `--feature accounts-and-bank-lines` |
| [Categories and rules](categories-and-rules.md) | partly built | category and rule screens on client demo data, no capability | `--feature categories-and-rules` |
| [Dashboard sums](dashboard-sums.md) | partly built | seven read capabilities and three tools, a dashboard screen on client demo data, no transport | `--feature dashboard-sums` |
| [Subscriptions](subscriptions.md) | partly built | capabilities and a loaded screen on client demo data, no transport | `--feature subscriptions` |
| [Investments](investments.md) | partly built | capabilities, demo screen, no transport | `--feature investments` |
| [FX conversion](fx-conversion.md) | planned | none | `--feature fx-conversion` |
| [Tax](tax.md) | partly built | `listTaxDues` and `syncTaxDues` capabilities, no transport | `--feature tax` |
| [Invoices](invoices.md) | partly built | seventeen package capabilities, no transport | `--feature invoices` |
| [AI tools](ai-tools.md) | partly built | the six tool capabilities and their dispatcher, no transport | `--feature ai-tools` |
| [App screens](web-screens.md) | partly built | twelve screens at `/app` on client demo data, Budgets a placeholder | `--feature web-screens` |

`planned` means the schema and demo fixtures exist but no capability, screen, CLI command, or MCP tool reaches a user yet. `partly built` means a capability exists at the package level while a screen or transport is still missing. `built` means the page's "How to get to it" names a real route, tool, or command a person can drive.

## Cross-cutting checks

Every demo-book run also runs these, whichever feature you select:

- `money-is-integer-minor-units`
- `currency-is-an-iso-code`
- `every-row-belongs-to-a-profile`
- `demo-book-holds-made-up-identities`
- `feature-map-matches-capabilities`
- `parity-matches-old-behaviours`

## Keeping the map honest

`scripts/check-feature-map.mjs` reads every capability implemented in the packages and apps and fails by name when one is on no feature page and not in the table below, when a page marks a feature `planned` while a capability for it exists, or when a page, the status table, and the repository disagree.

`../parity/README.md` is the neighbouring map, one row per behaviour the old private app had, with `built`, `planned` or `dropped` and the ticket or reason behind it. `scripts/check-parity.mjs` reads it and fails by name when a row has no status or where, when a `built` row points at a capability, command or file that is not here, when a `planned` row names no ticket, when a `dropped` row gives no reason, or when a behaviour appears twice. `--gaps` prints the planned rows with no ticket.

The expectation ids in a page must match the declarations in `scripts/step-table.json` exactly: the verdict fails when a page lists an id the table does not declare, and when the table declares an id no page covers. A behavior the app no longer does is either doc drift or a product regression: fix the map for drift, report the regression and keep it out of the map fix.

## Not money capabilities

These capabilities exist on `main` and belong to the template, not to a money feature. The check reads this table, so a capability that arrives, leaves, or moves fails until a feature page or this table names it.

| Module | Capabilities |
| --- | --- |
| `apps/site/src/capabilities/lore.ts` | `backlinks`, `neighbors`, `mentions`, `path` |
| `apps/site/src/capabilities/read.ts` | `read` |
| `apps/site/src/capabilities/search.ts` | `search` |
| `apps/site/src/interest/handlers.ts` | `confirmInterest` |
| `packages/auth/src/devtools.ts` | `rat_test_person` |
| `packages/core/src/cafe-directory.ts` | `listCafeNews`, `listCafeProjects`, `listPeople`, `listChannels`, `readPerson`, `searchPeople`, `peopleFor` |
| `packages/core/src/flag-capabilities.ts` | `listFlags`, `getFlag` |
| `packages/core/src/flag-write-capabilities.ts` | `flip_feature_flag`, `record_flag_evidence`, `read_flag_ledger` |
| `packages/core/src/inspect-file.ts` | `inspectFile` |
| `packages/core/src/intake-applications.ts` | `intakeApplications` |
| `packages/core/src/intake-erase.ts` | `intakeErase` |
| `packages/core/src/intake-redeliver.ts` | `intakeRedeliver` |
| `packages/core/src/join-interest.ts` | `joinInterest` |
| `packages/core/src/prompts.ts` | `listPrompts`, `getPrompt` |
| `packages/core/src/workshop-directory.ts` | `workshopSchedule`, `workshopPrep`, `workshopLinks`, `listExercises`, `readExercise`, `currentExercise` |
| `packages/deploy/src/capabilities.ts` | `deployPlan`, `deployProd`, `stateCopy` |
| `packages/deploy/src/rollback.ts` | `deployRollback` |
| `packages/learn/src/capabilities.ts` | `learnDeck`, `learnCard`, `learnNext`, `learnRecord` |
| `packages/learn/src/feedback-capabilities.ts` | `learnFeedbackStart`, `learnFeedbackPoll`, `learnFeedback` |
| `packages/learn/src/local.ts` | `learnPreferences`, `learnSetPreferences` |
| `packages/settings/src/capabilities.ts` | `readSetup`, `saveSettings`, `createProfile` |

## Proof shape

A proof is a directory under `.claude/skills/verify-pecunia/evidence/<yyyy-mm-dd>-<label>/` with `PROOF.md` and `proof.json`, committed with the change. Manual runs add the captured page or response. The standards are in `.claude/skills/verify-pecunia/SKILL.md`.
