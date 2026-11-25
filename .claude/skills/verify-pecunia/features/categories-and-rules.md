# Categories and rules

Status: planned. The schema and the demo rules exist on `main`. No capability, screen, CLI command, or MCP tool yet.

## What it promises

- Categories are data, not code. A user adds, renames, archives, and nests them without a deploy.
- A rule is data too. It matches a field on a bank line, sets a category or a classification, and can target a client payee, a counterpart profile, or a tax obligation.
- The first matching rule by priority wins. The same line and the same rule set always produce the same result.
- Every rule target, alias, and line stays inside one profile.
- Client names become rules. A new client or merchant is a database row, never a branch in the code.

## Sub-features

- Category tree with a parent, colour token, and spending type (`business`, `personal`, `mixed`).
- Payees with a kind (`client`, `merchant`, `tax_authority`) and a normalized name.
- Merchant aliases that map raw bank text to a payee by `contains`, `exact`, or `prefix`.
- Rules with kind, match field (`merchant`, `description`, `reference`), match type, pattern, direction, amount band, priority, and enabled state.
- Rule kinds: `categorize`, `self_transfer`, `internal_transfer`, `refund`, `exclude`, `income_client`, `tax_payment`.
- Rule detail shows the target: category, client payee, counterpart profile, or obligation kind.

## How to get to it (user POV)

Today: nowhere. The demo book carries the categories, payees, aliases, and rules.

Planned: the categories and rules section of the app. The categories-rules slice adds the editors, and the same capabilities reach MCP and the CLI. That slice names the exact routes and tools.

## Driving it with the demo book

```sh
bash .claude/skills/verify-pecunia/scripts/prove-demo-book.sh --feature categories-and-rules
```

The demo book gives you 8 categories (`Software` with child `Cloud`), 5 payees (`Example Ltd`, `Demo Cloud Hosting`, `Demo Coffee`, `Demo Design Tool`, `Demo Tax Office`), 4 merchant aliases, and 7 rules.

Checks this drive runs, on top of the four cross-cutting money checks:

- `applied-rule-sets-category`: a line marked `applied` carries the same category as its applied rule, and that rule is a `categorize` rule.
- `classification-rule-sets-classification`: the rule kind maps to the line's classification. `exclude` maps to `excluded`, `income_client` maps to `income`, and the other kinds map to themselves.
- `rule-targets-stay-in-profile`: a rule's category and client payee belong to the rule's profile.
- `merchant-aliases-stay-in-profile`: an alias points at a payee in the same profile.
- `demo-rule-sweeps-its-line`: `transaction-demo-02` (`Demo Cloud Hosting`) was sorted by rule `0192f0c1-0015-...` at priority 10 into `Cloud`.

The demo rule set is the fixture for ordering: the `Demo Cloud Hosting` contains-rule sets `Cloud`, `Example Ltd` sets income with a client payee, `TAX` sets a tax payment, `Moved` is an internal transfer, `Transfer to Demo Person` is a self transfer with a counterpart profile, `Refund` is a refund, and `0000` on digits only excludes a line.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its evidence committed.
2. A property test over generated payees, aliases, and rule orders: the sort is deterministic and the first match by priority wins. The categories-rules slice owns this test; a change to the engine reruns it.
3. The before and after of one real line: the raw merchant text, the matching rule, the category or classification written, and the row read back.
4. If the change adds a rule kind or a match type, the mapping to a classification or category is in the type and the schema check, not in prose only.
5. No schema edit to an applied migration.

## Gotchas

- Rule priority is ascending. A lower number wins. Two rules with the same priority need a stable tiebreak, or the result depends on insert order.
- A classification rule writes `classification`, not `category`. `categorize` writes `category` and sets `categorization` to `applied`.
- The mapping is not identity: rule kind `exclude` writes classification `excluded`, and `income_client` writes `income`. A naive equality check fails on the demo book.
- A disabled rule is not applied even if it matches. The demo check only counts enabled rules.
- A payee, alias, or rule from another profile is a tenant leak, even when the ids resolve.
