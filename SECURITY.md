# Security

## Report a leak privately

If you find personal data, a credential, or a live deployment hostname in this repository, do not open a public issue. Use GitHub's private vulnerability reporting: the **Security** tab of [valentinyeo/pecunia-oss](https://github.com/valentinyeo/pecunia-oss), then **Report a vulnerability**. Name the file and the commit, and say what kind of value it is. Do not paste the value itself.

The same private channel covers an auth bypass, a profile-scope escape, a sandbox escape, and any capability that reaches data outside the caller's profile.

## What happens with a report

The maintainer reads it there, fixes the leak, and rewrites the history that carries it. A report stays private until that lands, so the value never gets a second audience. Reporters get credit in the advisory unless they ask for none.

## What is already in place

- `scripts/check-no-personal-data.ts` runs in `pnpm check` and in CI. It fails on an IBAN, a sort code beside an account number, a real email address, a Cloudflare account id in a config file, and a real `*.pages.dev` or `*.workers.dev` hostname.
- `.github/workflows/gitleaks.yml` scans every pushed range with a pinned gitleaks binary and a checked checksum.
- `scripts/check-commit-identity.ts` keeps real email addresses out of commit metadata, including `Co-authored-by:` trailers.
- The data model scopes every row to a profile, and no capability reads across profiles. [VISION.md](./VISION.md) states that promise, and `packages/*/test` holds the behaviour tests for it.

There is no email address on this page on purpose. GitHub's private reporting already reaches the maintainer, and a published address would only be scraped.
