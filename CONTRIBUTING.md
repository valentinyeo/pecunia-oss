# Contributing

Pecunia is an open source, self-hosted personal finance app. The repository is public. Read [VISION.md](./VISION.md) for the intent and [AGENTS.md](./AGENTS.md) for the rules that bind every change, agents included.

## No personal data in the repository

Anything that names a person, a company, a merchant, an account, an amount, or a mailbox is user data. It lives in the database, scoped to a `Profile`, or it does not exist.

- Use made-up values in code, tests, fixtures, screenshots, and site content: `Example Ltd`, `Demo Bank`, `123 Example Street`, `demo@example.com`, `example.workers.dev`.
- Never paste a real statement, account number, sort code, IBAN, or email address into a commit, a PR, an issue, or `.brain/`. The value is public the second it lands.
- Migrations seed catalog rows only. Demo data ships outside numbered migrations.

`pnpm check` runs `scripts/check-no-personal-data.ts`, which fails on an IBAN in any written form, a sort code beside an account number, an email address outside the example domains, a Cloudflare account id in a config file or beside an account name, a high-entropy token written on the indented line below a `|-` or `>-` key, and a real `*.pages.dev`, `*.workers.dev` or `*.cloudflareaccess.com` hostname in any letter case. Spaces, tabs, non-breaking spaces, hyphens or dots between the characters of an IBAN do not hide it, at any position after the country code. A sort code pairs with an account number when they sit in the same record: one line, one CSV row, one YAML entry, or a blank-line block, up to 2000 characters apart, so a long payment reference between them changes nothing. A sort code or an account number counts only when it is the whole number in its field: no digit run touches it, a tab, comma, semicolon, pipe or newline ends the field, and a date, a timestamp or a phone number that merely contains digits never pairs. Only the three documented placeholder hosts (`example.workers.dev`, `example.pages.dev`, `example.cloudflareaccess.com`) are exempt, so a host that starts with `example.` but then names a real tenant still fails. Every other exception is one entry with a reason in `scripts/no-personal-data-allow.json`, plus the path it is excused in, so an entry never hides the same value in another file. CI runs the same guard plus [gitleaks](https://github.com/gitleaks/gitleaks) over the pushed range, and its exemptions are exact: a commit citation is excused only when every long token on that line is a citation, and the crash-test JWT only as that exact token, so a second secret beside either one still fails.

Known limits: the guard matches the characters it is given, and decodes ordinary transport encodings before it reads: RFC 2045 quoted-printable (any `=XX` hex escape, soft line breaks joined, trailing whitespace before a soft break dropped), MIME base64 wrapped at 76 characters, percent-encoded bytes, HTML entities and numeric character references, JSON string escapes (`\"`, `\\`, `\uXXXX`), form pluses, zero-width characters, fullwidth characters folded to ASCII, and an HTML or Markdown tag turned into a separator. Each decoder maps every decoded character back to the line it came from. The text as written is always a view too, so every rule reads the raw text as well, and a decoder can only add a reading, never replace one: a decode step that guesses wrong about an equals sign cannot hide a value the raw text already shows. The views are the raw text, the decoded text, the same text decoded without the quoted-printable step, the text with markup removed, the digit-and-letter squeezed form of each, and the container-stripped text: every line without its indentation, its quote character, or its `>`, `#`, `//`, `-`, `|` or `*` prefix, decoded once more, so a value wrapped by a YAML block scalar, a quoted reply, a heredoc, a list item, a comment block, a JSON string or a quoted CSV cell reads as the value a person wrote. They run to a fixed point of eight passes, and the table of decoders lives in `scripts/decoded-text.ts`. An IBAN needs a country code, the length that code fixes, a mod 97 check and more digits than letters, so a run of lower-case words stays quiet. The seeded property test in `scripts/check-no-personal-data.property.test.ts` plants bank pairs, IBANs, mailboxes and account ids into an env file, a MIME mail body, a YAML record, a CSV row, a URL query and a JSON document, encodes them with real spec encoders, and fails by name with its seed when a rule or a harmless twin is wrong. A halfwidth or fullwidth ideographic full stop (U+3002) written where a hostname has a dot still passes unread, because reading it as a dot would flag ordinary Japanese and Chinese text. Encoding beyond that set, such as base32, ROT13, a custom cipher, text hidden inside a binary file, or three nested layers a person had to build by hand, is not decoded: the guard reads encodings people paste and tools write, not anything that can carry a value. A person who pastes such text still has to read it before committing.

### What a bank pair is read through

A sort code and an account number pair when their labels survive the wrapper. These wrappers are read, and `scripts/check-no-personal-data.property.test.ts` seeds each one: any separator between the digits (nothing, a space, a tab, a non-breaking, figure, or narrow no-break space, a hyphen, a non-breaking hyphen, an en dash, a dot, a soft line break, or a line break inside the value); a label on the line above or below its value, with a colon or an equals sign between the label's noun and its word, as in `Account: number`; prose, a payment reference, or an empty table cell between the two numbers; a JSON object, a YAML entry, a CSV or TSV row, a Markdown table, an env file, and a URL query; markup that splits a label word or the digits, a tag with a `>` inside a quoted attribute, and a tag broken across two lines with a container prefix inside it; quoting, indentation, and container prefixes stacked deep; and every decoder in `scripts/decoded-text.ts`.

Two wrappers stay unread. `scripts/check-no-personal-data.test.ts` pins each one by name, so changing either is deliberate:

- A markup fragment with no closing `>` on its line, between the digits or inside a label: `102<93847`.
- A blank line between the two numbers, which is the record boundary.

The gap is pinned from both sides too: a labelled pair 1400 characters apart fails, the same pair 3200 characters apart passes.

## Set a no-reply commit address

Commits are public, so a real email address in one is a leak. Point Git at the address GitHub gives you, once per clone:

```sh
git config user.email "<id>+<login>@users.noreply.github.com"
```

`scripts/check-commit-identity.ts` fails on any author, committer, or `Co-authored-by:` trailer outside `@users.noreply.github.com`, `noreply@github.com`, and `noreply@anthropic.com`. It reads the trailer the way Git does, so a leading space, a folded line, text after the address, a quoted local part, an international address, or a stray control character in the body does not hide one. It reads the range you pass (`node scripts/check-commit-identity.ts origin/main..HEAD`) and defaults to every commit reachable from `HEAD`.

## Run the gate

```sh
pnpm install
pnpm sources:fetch
pnpm turbo run check test build
```

`pnpm check` covers types, Effect diagnostics, the personal-data guard, lint, and format. `pnpm test` builds and runs the suite. Lefthook runs both before a commit, and CI runs the full gate on a cold cache.

## Pull requests

- One topic per PR, and say what changed for the person using the app.
- Green CI is required. A red check is work, not a negotiation.
- Do not bypass hooks. `git commit --no-verify` is blocked for a reason.
- New dependencies carry an exact pin and a reason in the PR body.
