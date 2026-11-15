import { describe, expect, it } from "vitest";

import {
  coAuthorEmailsIn,
  domainOf,
  identityOffenders,
  isAllowedIdentityEmail,
  offenderMessage,
  parseBodyLog,
  parseIdentityLog,
  withCoAuthors,
} from "./check-commit-identity.ts";
import type { CommitIdentity } from "./check-commit-identity.ts";

const commit = (
  authorEmail: string,
  committerEmail: string = authorEmail
): CommitIdentity => ({
  authorEmail,
  coAuthorEmails: [],
  commit: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c",
  committerEmail,
});

const allowed = [
  "3296316+valentinyeo@users.noreply.github.com",
  "1234+someone-else@users.noreply.github.com",
  "noreply@github.com",
  "noreply@anthropic.com",
  "Noreply@Anthropic.com",
];

const realLocalParts = [
  "jane",
  "jane.doe",
  "jane+finance",
  "j.doe",
  "info",
  "valentin",
  "owner",
  "accounts",
];

const realDomains = [
  "acme.test",
  "gmail.invalid",
  "acme.invalid",
  "bank.example",
  "users.noreply.github.com.acme.test",
  "mail.example.test",
  "users.noreply.github.com.evil.test",
  "ratstack.test",
];

describe("allowed identities", () => {
  it.each(allowed)("accepts %s", (address) => {
    expect(isAllowedIdentityEmail(address)).toBe(true);
  });
});

describe("real addresses are rejected", () => {
  it.each(realLocalParts)("rejects %s on every real domain", (localPart) => {
    for (const domain of realDomains) {
      expect(isAllowedIdentityEmail(`${localPart}@${domain}`)).toBe(false);
    }
  });

  it("rejects any address outside the allowed set", () => {
    const generated = realLocalParts.flatMap((localPart) =>
      realDomains.map((domain) => `${localPart}@${domain}`)
    );

    const rejected = generated.filter(
      (address) => !isAllowedIdentityEmail(address)
    );

    expect(rejected).toHaveLength(generated.length);
    expect(generated).toHaveLength(realLocalParts.length * realDomains.length);
  });

  it("rejects an address with no domain", () => {
    expect(isAllowedIdentityEmail("valentin")).toBe(false);
    expect(domainOf("valentin")).toBe("unknown");
  });

  it("names the author, the committer, or a co-author", () => {
    const offenders = identityOffenders([
      commit("jane@acme.test", "1234+someone@users.noreply.github.com"),
      {
        ...commit("1234+someone@users.noreply.github.com"),
        coAuthorEmails: ["noreply@github.com", "jane@acme.test"],
      },
    ]);

    expect(offenders.map((offender) => offender.field)).toEqual([
      "author",
      "co-author",
    ]);
  });

  it("keeps only the domain of the offending address", () => {
    const [offender] = identityOffenders([commit("jane.doe@acme.test")]);

    expect(offender?.domain).toBe("acme.test");
  });
});

describe("the failure message", () => {
  const message = offenderMessage({
    commit: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c",
    domain: "acme.test",
    field: "author",
  });

  it("names the commit", () => {
    expect(message).toContain("commit 0f1e2d3c4b5a");
  });

  it("says what went wrong", () => {
    expect(message).toContain(
      "commit author or committer uses a real email address"
    );
  });

  it("says how to fix it", () => {
    expect(message).toContain(
      "git config user.email <id>+<login>@users.noreply.github.com"
    );
    expect(message).toContain("recommit");
  });

  it("never prints the address", () => {
    expect(message).not.toContain("jane");
    expect(message).toContain("acme.test");
  });
});

describe("git output", () => {
  it("reads an identity line", () => {
    expect(
      parseIdentityLog(
        "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c\tjane@acme.test\tnoreply@github.com\n"
      )
    ).toEqual([
      {
        authorEmail: "jane@acme.test",
        coAuthorEmails: [],
        commit: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c",
        committerEmail: "noreply@github.com",
      },
    ]);
  });

  it("reads co-author trailers with and without a name", () => {
    expect(
      coAuthorEmailsIn(
        "Subject\n\nCo-authored-by: Ada <ada@acme.test>\nCo-authored-by: bob@acme.test\n"
      )
    ).toEqual(["ada@acme.test", "bob@acme.test"]);
  });

  it("leaves a body without trailers alone", () => {
    expect(coAuthorEmailsIn("Subject\n\nNo trailers here.\n")).toEqual([]);
  });

  it("joins bodies to the commits they belong to", () => {
    const commits = parseIdentityLog(
      "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c\tnoreply@github.com\tnoreply@github.com\n"
    );

    const bodies = parseBodyLog(
      "\u001E0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c\tSubject\n\nCo-authored-by: Ada <ada@acme.test>\n"
    );

    expect(withCoAuthors(commits, bodies)).toEqual([
      {
        authorEmail: "noreply@github.com",
        coAuthorEmails: ["ada@acme.test"],
        commit: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c",
        committerEmail: "noreply@github.com",
      },
    ]);
  });
});
