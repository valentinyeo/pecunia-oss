# Pecunia parity: the old app against this one

One row per behaviour the old private app had. The question this page answers: is anything missing in this app, and if it is missing, where is the ticket that brings it?

The old app is private and read only. Nothing in this page quotes it: no code, no SQL, no identifiers, no people, no merchants, no banks, no amounts. Each row names a behaviour in plain words and the place a user found it, such as `route: subscriptions` or `tool: tax due`.

## Status

- `built` means this repository already does it, and the where column names the real thing: `capability:<name>`, `command:<name>`, or `file:<path>`. The check resolves every one of those against the repository.
- `planned` means the behaviour has no home yet, and the where column names either the ticket that will build it or `no ticket yet`.
- `dropped` means the new app will not carry it over, and the where column says why, in plain words.

Where the mechanism changed and the user outcome did not, the row is `built` and names the new mechanism. A viewer who can read but not change anything is the same promise in both apps; the code that keeps it is not.

## Check

```sh
node skills/verify-pecunia/scripts/check-parity.mjs
node skills/verify-pecunia/scripts/check-parity.mjs --gaps
```

The first command reads this page and the repository and fails by name when:

- a row holds the wrong number of cells, or no behaviour text;
- a row has no status, or a status that is not exactly `built`, `planned` or `dropped`;
- a row has no where;
- a `built` row points at a capability no package implements, a command `apps/cli` does not define, or a file that is not in the repository;
- a `planned` row names neither a ticket id nor `no ticket yet`;
- a `dropped` row gives no reason of at least six words, or points at a link instead of saying why;
- the same behaviour appears twice;
- a row names an old place the inventory below does not list;
- the inventory lists an old place that no row covers.

It counts every problem it prints and exits non-zero for each. `--gaps` prints one line per planned behaviour with no ticket, which is the list to hand to whoever writes tickets. It exits non-zero when the page has any problem, so it cannot be used to hide one.

The check runs in two places:

- `pnpm test` runs `scripts/check-parity.test.ts`, which runs the check on this page and on one broken page per failure.
- The demo-book proof runs it as the `parity-matches-old-behaviours` step, so a money run fails when the parity page and the repository disagree: `bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature accounts-and-bank-lines`.

## Old app inventory

Every place the old app put a behaviour. A place with no row is a behaviour nobody checked.

| Old place                       | Kind   |
| ------------------------------- | ------ |
| shell: every page               | shell  |
| route: dashboard                | page   |
| route: transactions             | page   |
| route: transaction detail       | page   |
| route: categories               | page   |
| route: category management      | page   |
| route: rules                    | page   |
| route: aliases                  | page   |
| route: merchant list            | page   |
| route: merchant list with rules | page   |
| route: merchant detail          | page   |
| route: spending                 | page   |
| route: spending category        | page   |
| route: income                   | page   |
| route: months                   | page   |
| route: review                   | page   |
| route: subscriptions            | page   |
| route: forecast                 | page   |
| route: investments              | page   |
| route: invoices                 | page   |
| route: invoice sources          | page   |
| route: reports                  | page   |
| route: report page              | page   |
| route: search                   | page   |
| route: update                   | page   |
| route: settings                 | page   |
| job: scheduled sync             | job    |
| job: sync health                | job    |
| sync: bank statements           | sync   |
| sync: bank activities           | sync   |
| sync: exchange rates            | sync   |
| sync: market prices             | sync   |
| sync: broker holdings           | sync   |
| sync: tax dues                  | sync   |
| import: bank csv                | import |
| import: invoice pdf             | import |
| import: legacy invoices         | import |
| import: archive to drive        | import |
| tool: every tool                | tool   |
| tool: raw query                 | tool   |
| tool: spending summary          | tool   |
| tool: changes list              | tool   |
| tool: sync status               | tool   |
| tool: tax due                   | tool   |
| tool: income summary            | tool   |
| tool: monthly totals            | tool   |
| tool: subscriptions             | tool   |
| tool: payment search            | tool   |
| tool: missing invoices          | tool   |
| tool: invoice attach            | tool   |
| tool: invoice linking           | tool   |
| tool: report save               | tool   |
| tool: report list               | tool   |
| tool: legacy invoices           | tool   |
| tool: invoice coverage          | tool   |
| tool: invoice exception         | tool   |
| tool: archive root              | tool   |
| tool: archive documents         | tool   |
| tool: document content          | tool   |
| tool: archive record            | tool   |

## Behaviour

| Behaviour | Old place | Status | Where |
| --- | --- | --- | --- |
| A person signs in, and sees only the profiles they belong to | shell: every page | built | file:packages/auth/src/current-person.ts |
| Someone with read-only access opens every page and changes nothing | shell: every page | built | file:packages/access/src/authorize.ts |
| A switcher in the header chooses which book every page shows, and the browser remembers it | shell: every page | planned | no ticket yet |
| An outside login gate in front of the whole app decides who gets in | shell: every page | dropped | the new app signs people in itself with email and password, so the outside gate has no job left to do |
| Money in, money out and the net for a chosen period | route: dashboard | planned | no ticket yet |
| Total balance across every account and savings jar, converted to one currency | route: dashboard | planned | no ticket yet |
| Spend split by the currency it was paid in | route: dashboard | planned | no ticket yet |
| A daily spending chart for the chosen period | route: dashboard | planned | no ticket yet |
| The most recent payments on the front page | route: dashboard | planned | no ticket yet |
| Tax payments still owed, read from the accounting provider | route: dashboard | planned | no ticket yet |
| One period picker shared by the money pages: day, week, month, quarter, year, all, or a named month | route: dashboard | planned | no ticket yet |
| A page of payments, filtered by direction, category, date and text | route: transactions | built | capability:listBankLines |
| New payments only: what arrived since the last import | route: transactions | planned | no ticket yet |
| Set one category on many selected payments at once | route: transactions | planned | no ticket yet |
| Mark many selected payments confirmed at once | route: transactions | planned | no ticket yet |
| One payment in full: amount, fee, rate, merchant, reference, description, source and status | route: transaction detail | planned | no ticket yet |
| Change the category of one payment | route: transaction detail | built | capability:editBankLine |
| Write a note on one payment | route: transaction detail | built | capability:editBankLine |
| Mark one payment confirmed | route: transaction detail | built | capability:reviewBankLine |
| Rename the merchant on one payment | route: transaction detail | planned | no ticket yet |
| Spend per category for a period, with each category's share of the total | route: categories | planned | no ticket yet |
| A parent category takes its children's spend in every total | route: categories | planned | no ticket yet |
| A count of the categories a book holds | route: categories | planned | no ticket yet |
| Create a category with a name, a colour and a parent | route: category management | planned | no ticket yet |
| Edit a category | route: category management | planned | no ticket yet |
| Delete a category | route: category management | planned | no ticket yet |
| Rules listed by merchant, with the text pattern each one matches | route: rules | planned | no ticket yet |
| Create a rule from a text pattern, a category and a direction | route: rules | planned | no ticket yet |
| A rule can also require an amount threshold | route: rules | planned | no ticket yet |
| Turn a rule on or off, move it to another category, or delete it | route: rules | planned | no ticket yet |
| Re-apply every rule to the payments already stored | route: rules | planned | no ticket yet |
| Alias list: the merchant names that mean one real merchant | route: aliases | planned | no ticket yet |
| Create, edit and delete an alias | route: aliases | planned | no ticket yet |
| Combine two merchants into one and re-apply the aliases | route: aliases | planned | no ticket yet |
| Search merchants by name while adding an alias | route: aliases | planned | no ticket yet |
| Merchants with their payment count, total and most recent payment, plus the top fifteen | route: merchant list | planned | no ticket yet |
| Narrow the merchant list to one category, or to the uncategorised ones | route: merchant list | planned | no ticket yet |
| Set a category on a merchant from the list, for every payment it made | route: merchant list with rules | planned | no ticket yet |
| Show which rule already covers a merchant | route: merchant list with rules | planned | no ticket yet |
| One merchant: spend by category, monthly spend, and its payments with paging | route: merchant detail | planned | no ticket yet |
| Mark every payment from one merchant confirmed | route: merchant detail | planned | no ticket yet |
| Rename a merchant everywhere it appears | route: merchant detail | planned | no ticket yet |
| Mark a merchant as a repeat payment, or stop treating it as one | route: merchant detail | planned | ticket:SOFT-2395 |
| Personal against business spend for a period | route: spending | planned | no ticket yet |
| A doughnut by category and a stacked monthly trend | route: spending | planned | no ticket yet |
| One category's payments, and tagging a payment as reviewed from there | route: spending category | planned | no ticket yet |
| Income by client, read from the transfer reference rather than the merchant | route: income | planned | no ticket yet |
| Income narrowed to one client, with a monthly chart | route: income | planned | no ticket yet |
| Money in that is a refund is kept apart from income | route: income | planned | no ticket yet |
| One month's statement: spend by category, daily spend, top merchants, repeat payments and every payment | route: months | planned | no ticket yet |
| A list of the months the book already holds | route: months | planned | no ticket yet |
| Merchants with no category, listed so one can be picked | route: review | planned | no ticket yet |
| Ask a language model to suggest categories for what is left | route: review | planned | no ticket yet |
| Accept every suggestion waiting for review in one go | route: review | planned | no ticket yet |
| Repeat payments with their monthly and annual cost and the next charge date | route: subscriptions | planned | ticket:SOFT-2395 |
| Confirm or dismiss a repeat payment the app found | route: subscriptions | planned | ticket:SOFT-2395 |
| Mark a payment as recurring, or as not recurring | route: subscriptions | planned | ticket:SOFT-2395 |
| Cancel a repeat payment for one profile only, with an undo | route: subscriptions | planned | ticket:SOFT-2395 |
| Set a repeat payment's category and push it onto its past payments | route: subscriptions | planned | ticket:SOFT-2395 |
| Turn tracking of a repeat payment on and off | route: subscriptions | planned | ticket:SOFT-2395 |
| Find repeat payments from the payment history | route: subscriptions | planned | ticket:SOFT-2395 |
| A six month spend projection from the repeat payments | route: forecast | dropped | the app never served this page, because the router never mounted it, so no user could open it and there is no user behaviour to carry over |
| Holdings grouped by platform with price, value and gain | route: investments | planned | ticket:SOFT-2396 |
| Add a holding by hand | route: investments | planned | ticket:SOFT-2396 |
| Edit a holding | route: investments | planned | ticket:SOFT-2396 |
| Delete a holding | route: investments | planned | ticket:SOFT-2396 |
| Value a holding in the profile's currency | route: investments | planned | ticket:SOFT-2396 |
| A holding with no price yet shows as unknown rather than zero | route: investments | planned | ticket:SOFT-2396 |
| The investments page is open to one hard-coded profile | route: investments | dropped | the old page refused everyone but one profile identifier, and the new app scopes every profile the same way, so there is nothing to carry over |
| Payments that need an invoice, with a status on each one | route: invoices | planned | ticket:SOFT-2493 |
| Payments with no invoice counted for a month | route: invoices | planned | ticket:SOFT-2493 |
| Download the stored invoice for a payment, or remove it | route: invoices | planned | ticket:SOFT-2493 |
| A JSON feed of invoice status for other tools | route: invoices | planned | ticket:SOFT-2493 |
| Map a merchant on the statement to a vendor and to where its invoices come from | route: invoice sources | planned | ticket:SOFT-2493 |
| Add and delete an invoice source | route: invoice sources | planned | ticket:SOFT-2493 |
| Saved reports and explorations, newest first | route: reports | planned | ticket:SOFT-2399 |
| A report is stored once per address and updated in place | route: reports | planned | ticket:SOFT-2399 |
| Open one saved report, for the owner only | route: report page | planned | ticket:SOFT-2399 |
| One box searches payments, merchants, categories and holdings | route: search | planned | no ticket yet |
| Suggestions appear while typing in the search box | route: search | planned | no ticket yet |
| Sync one profile on demand, and read the imported, skipped and failed counts | route: update | planned | no ticket yet |
| Full re-sync of one profile from a chosen date | route: update | planned | no ticket yet |
| See whether a sync is running now, and for which profile | route: update | planned | no ticket yet |
| Detect the bank profiles from the provider and store them | route: settings | planned | no ticket yet |
| Upload a statement export file from the settings page | route: settings | built | capability:importBankFile |
| A profile is created with a name, a kind and its own base currency | route: settings | built | capability:createProfile |
| Report which keys the app holds | route: settings | dropped | the new app refuses to start when a required key is missing, so a page that reported key status has nothing left to show |
| A one-off repair button for split amounts | route: settings | dropped | it repaired a past data bug in one old table, and the new importer rejects a line that does not add up instead of repairing it later |
| Show the bank signing public key | route: settings | dropped | it only served the bank's signing handshake, and the new bank adapter owns that step with no page of its own |
| Two debug endpoints that sign a test request to the bank | route: settings | dropped | they existed to debug the signing handshake, which now belongs to the bank adapter and is proven by its own tests |
| Every profile's bank account synced on a schedule, with one run record per attempt | job: scheduled sync | planned | no ticket yet |
| A sync works in chunks and skips a profile that is already syncing | job: scheduled sync | planned | no ticket yet |
| A run left running for more than three minutes is marked failed | job: scheduled sync | planned | no ticket yet |
| Categorisation runs after a nightly sync | job: scheduled sync | planned | no ticket yet |
| The broker holdings sync is started through the app on the same schedule | job: scheduled sync | planned | ticket:SOFT-2396 |
| Tax dues are synced on the same schedule | job: scheduled sync | planned | no ticket yet |
| A profile that has not synced for twelve hours, or that failed in the last day, is reported as a problem | job: sync health | planned | no ticket yet |
| Business accounts: the statement is downloaded with a signed request | sync: bank statements | planned | no ticket yet |
| A missing signing key stops the sync before any request goes out | sync: bank statements | planned | no ticket yet |
| A statement that returns nothing falls back to the activities feed | sync: bank statements | planned | no ticket yet |
| Personal accounts: the activities feed is read without a signed request | sync: bank activities | planned | no ticket yet |
| Daily exchange rates from a public rates service, cached for the day | sync: exchange rates | planned | no ticket yet |
| Share prices from one market source, with a second source for crypto | sync: market prices | planned | ticket:SOFT-2396 |
| Holdings and their quantities come from the broker's own API | sync: broker holdings | planned | ticket:SOFT-2396 |
| Self Assessment payments due come from the accounting provider, and a payment that disappears upstream is removed | sync: tax dues | built | capability:syncTaxDues |
| A statement export file is imported into one account | import: bank csv | built | capability:importBankFile |
| Importing the same file again adds no second copy of a line | import: bank csv | built | capability:importBankFile |
| A line the importer cannot read is named by its line number and the reason | import: bank csv | built | capability:importBankFile |
| The import asks which account the file belongs to | import: bank csv | built | capability:listImportTargets |
| An import into an account the profile does not hold is refused by name | import: bank csv | built | capability:importBankFile |
| A PDF is stored against one payment | import: invoice pdf | planned | ticket:SOFT-2493 |
| Existing invoice files are registered with a fingerprint so none is stored twice | import: legacy invoices | planned | ticket:SOFT-2493 |
| Each invoice document is archived to one folder tree with one reserved file id | import: archive to drive | planned | ticket:SOFT-2493 |
| Every capability is also a tool an assistant can call over MCP | tool: every tool | built | command:mcp |
| A shared bearer token guards the assistant door | tool: every tool | planned | ticket:SOFT-2401 |
| An assistant call can read across every profile at once | tool: every tool | dropped | the new app scopes every call to one profile, so there is no all-profiles mode, and an assistant names the profile it means |
| An assistant runs read-only SQL against the book | tool: raw query | dropped | the new app answers only through typed capabilities, so an assistant never reaches the database directly |
| An assistant asks for spend by category over a date range | tool: spending summary | planned | no ticket yet |
| An assistant asks what changed since a point in time | tool: changes list | planned | no ticket yet |
| An assistant asks whether a sync is running | tool: sync status | planned | no ticket yet |
| An assistant asks for the Self Assessment payments due | tool: tax due | planned | ticket:SOFT-2398 |
| An assistant asks for income by client | tool: income summary | planned | no ticket yet |
| An assistant asks for month by month money in, money out and net | tool: monthly totals | planned | no ticket yet |
| An assistant asks for the active repeat payments | tool: subscriptions | planned | ticket:SOFT-2395 |
| An assistant searches payments by merchant, reference or description | tool: payment search | planned | no ticket yet |
| An assistant asks which payments in a month still need an invoice | tool: missing invoices | planned | ticket:SOFT-2493 |
| An assistant saves one invoice file against a payment | tool: invoice attach | planned | ticket:SOFT-2493 |
| An assistant links unlinked invoices to payments from the same company within five days | tool: invoice linking | planned | ticket:SOFT-2493 |
| An assistant saves a report page | tool: report save | planned | ticket:SOFT-2399 |
| An assistant lists the saved reports | tool: report list | planned | ticket:SOFT-2399 |
| An assistant registers invoice files that predate the archive | tool: legacy invoices | planned | ticket:SOFT-2493 |
| An assistant counts how many outgoing payments have an invoice, month by month | tool: invoice coverage | planned | ticket:SOFT-2493 |
| An assistant records a written reason for a payment with no invoice | tool: invoice exception | planned | ticket:SOFT-2493 |
| An assistant sets a business's archive folder root | tool: archive root | planned | ticket:SOFT-2493 |
| An assistant pages through the archived invoice documents | tool: archive documents | planned | ticket:SOFT-2493 |
| An assistant reads one stored invoice file | tool: document content | planned | ticket:SOFT-2493 |
| An assistant reserves one archive file id per document, then confirms it | tool: archive record | planned | ticket:SOFT-2493 |

## Side by side on the demo book

Planned, not run. The old app cannot be started, and this page does not claim a comparison it did not make. The rows below are the ones the demo book can already compare, field by field, once the old side is read by hand.

The new side is the demo-book proof, which seeds its own scratch book and drives the real capabilities:

```sh
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature accounts-and-bank-lines
```

| Built row | What to compare | How |
| --- | --- | --- |
| A page of payments, filtered by direction, category, date and text | The same twelve demo lines come back, newest first, and the filter narrows them the same way | Read the old list page for the nine columns it shows on a line. Compare each column with the same field in the `listBankLines` reply for the demo book. Compare totals, not pages: the demo book holds twelve lines and two awaiting review |
| Change the category of one payment | The category on one line, and nothing else on that line, changes | Pick one demo line, set a category through `editBankLine`, read the line back, and compare the stored category and note with what the old edit form wrote for that line |
| Write a note on one payment | The note is stored with the line and survives a second read | Same line, second read, note compared as text |
| Mark one payment confirmed | The line's review state moves once and stays moved | Compare the stored review state before and after with the old confirm action |
| A statement export file is imported into one account, and the same file again adds nothing | Imported once, then nothing new on the repeat | Compare the per-file counts: the demo import reports five new lines and then zero, with no second copy of any line |
| A line the importer cannot read is named by its line number and the reason | The rejected line number and the reason | Compare the rejected line and its reason against the old importer's message for the same broken field |

What the demo book cannot compare: everything marked `planned` above. There is nothing on this side to compare, and pretending otherwise would make the page lie.

## Limits

The inventory is a list a person wrote from the old app's routes, workers, tools and services. A whole behaviour deleted from the old app's inventory would leave no trace here, because nothing on this side can read the old app. Every place in the inventory must keep at least one row, which catches a row that quietly disappears; it cannot catch a place that was never listed.
