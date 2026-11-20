# Contributing

Pecunia is an open source, self-hosted personal finance app. The repository is public. Read [VISION.md](./VISION.md) for the intent and [AGENTS.md](./AGENTS.md) for the rules that bind every change, agents included.

## No personal data in the repository

Anything that names a person, a company, a merchant, an account, an amount, or a mailbox is user data. It lives in the database, scoped to a `Profile`, or it does not exist.

- Use made-up values in code, tests, fixtures, screenshots, and site content: `Example Ltd`, `Demo Bank`, `123 Example Street`, `demo@example.com`, `example.workers.dev`.
- Never paste a real statement, account number, sort code, IBAN, or email address into a commit, a PR, an issue, or `.brain/`. The value is public the second it lands.
- Migrations seed catalog rows only. Demo data ships outside numbered migrations.

`pnpm check` runs `scripts/check-no-personal-data.ts`, which reads the plain text of a file and fails on five things: an email address on a domain that is not reserved and not a no-reply sender, an IBAN with a country code, the length that code fixes, more digits than letters and a passing mod 97 check, a real `*.pages.dev`, `*.workers.dev` or `*.cloudflareaccess.com` hostname, a 32-character Cloudflare account id beside an account name or under `account` in a config file, and a sort code with an account number on one line or on two lines next to each other where the line names a sort code or an account. A value someone hides on purpose, by encoding it, splitting it over lines, or spelling it in an odd way, is not caught and needs a human to read it. Every exception is one entry with a reason in `scripts/no-personal-data-allow.json`. Secrets are covered by [gitleaks](https://github.com/gitleaks/gitleaks), which runs in CI over every pushed range.

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
