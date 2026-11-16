# Pecunia feature map

One page per money feature. Each page answers three questions: what the feature promises, how to drive it, and what proof a pull request touching it must attach.

The map is the maintained verification source. A proof that drives one convenient entry point is incomplete when the map lists another.

## Status

| Feature | Status | User surface today | Demo-book drive |
| --- | --- | --- | --- |
| [Accounts and bank lines](accounts-and-bank-lines.md) | planned | none | `--feature accounts-and-bank-lines` |
| [Categories and rules](categories-and-rules.md) | planned | none | `--feature categories-and-rules` |
| [Dashboard sums](dashboard-sums.md) | planned | none | `--feature dashboard-sums` |
| [Subscriptions](subscriptions.md) | planned | none | `--feature subscriptions` |
| [Investments](investments.md) | planned | none | `--feature investments` |
| [FX conversion](fx-conversion.md) | planned | none | `--feature fx-conversion` |
| [Tax](tax.md) | planned | none | `--feature tax` |
| [Invoices](invoices.md) | planned | none | `--feature invoices` |

`planned` means the schema and demo fixtures exist but no capability, screen, CLI command, or MCP tool reaches a user yet. The page names the data-layer check that runs today and the surface the slice will add.

Change a row to `built` only when the page's "How to get to it" names a real route, tool, or command that a person can drive, and the drive produces that surface's own evidence.

## Cross-cutting checks

Every demo-book run also runs these, whichever feature you select:

- `money-is-integer-minor-units`
- `currency-is-an-iso-code`
- `every-row-belongs-to-a-profile`
- `demo-book-holds-made-up-identities`

## Keeping the map honest

- A page whose check ids no longer exist in `skills/verify-pecunia/scripts/prove-demo-book.sh` is drift. Fix the page or add the check before proving.
- A feature the app gains without a page is drift. Add the page and its check before the pull request merges.
- A behavior the app no longer does is either doc drift or a product regression. Fix the map for drift; report the regression and keep it out of the map fix.
- Run the pstack `maintain-verification-skill` pass when the app has moved a lot, or when a proof disagrees with the map.

## Proof shape

A proof is a directory under `skills/verify-pecunia/evidence/<yyyy-mm-dd>-<label>/` with `PROOF.md` and `proof.json`, committed with the change. Manual runs add the captured page or response. The standards are in `skills/verify-pecunia/SKILL.md`.
