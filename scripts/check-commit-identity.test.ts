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
  "4821+maintainer-one@users.noreply.github.com",
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
  "personal.owner",
  "owner",
  "accounts",
];

const realDomains = [
  "acme.test",
  "freemail.invalid",
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
    expect(isAllowedIdentityEmail("personal.owner")).toBe(false);
    expect(domainOf("personal.owner")).toBe("unknown");
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

  describe("for a co-author", () => {
    const trailerMessage = offenderMessage({
      commit: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c",
      domain: "acme.test",
      field: "co-author",
    });

    it("names the trailer that leaks", () => {
      expect(trailerMessage).toContain("Co-authored-by");
      expect(trailerMessage).toContain("acme.test");
    });

    it("says how to remove the trailer", () => {
      expect(trailerMessage).toContain("git interpret-trailers");
      expect(trailerMessage).not.toContain("git config user.email");
    });

    it("never prints the address", () => {
      expect(trailerMessage).not.toContain("ada");
    });
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

  describe("a co-author trailer in any written form is read", () => {
    const address = "ada@acme.test";

    it.each([
      ["with a name", `Co-authored-by: Ada <${address}>`],
      ["with a leading space", `  Co-authored-by: Ada <${address}>`],
      [
        "with text after the address",
        `Co-authored-by: Ada <${address}> thanks`,
      ],
      ["in lower case", `co-authored-by: Ada <${address}>`],
      ["in upper case", `CO-AUTHORED-BY: Ada <${address}>`],
      ["with underscores", `Co_Authored_By: Ada <${address}>`],
      ["with a space in the key", `Co Authored By: Ada <${address}>`],
      ["with a space before the colon", `Co-authored-by : Ada <${address}>`],
      ["bare", `Co-authored-by: ${address}`],
      ["with trailing spaces", `Co-authored-by: Ada <${address}>   `],
      ["with a tab", `\tCo-authored-by: Ada <${address}>`],
    ])("reads a trailer %s", (_label, trailer) => {
      expect(coAuthorEmailsIn(`Subject\n\n${trailer}\n`)).toEqual([address]);
    });

    it("reads a trailer folded onto the line below it", () => {
      expect(
        coAuthorEmailsIn(`Subject\n\nCo-authored-by: Ada\n <${address}>\n`)
      ).toEqual([address]);
    });

    it("reads a trailer after another trailer", () => {
      expect(
        coAuthorEmailsIn(
          `Subject\n\nSigned-off-by: Ada <${address}>\nCo-authored-by: Bob <bob@acme.test>\n`
        )
      ).toEqual(["bob@acme.test"]);
    });

    it("leaves a prose line with an address alone", () => {
      expect(
        coAuthorEmailsIn(`Subject\n\nContact ${address} for details.\n`)
      ).toEqual([]);
    });
  });

  it("joins bodies to the commits they belong to", () => {
    const commits = parseIdentityLog(
      "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c\tnoreply@github.com\tnoreply@github.com\n"
    );

    const bodies = parseBodyLog(
      "\u00000f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c\tSubject\n\nCo-authored-by: Ada <ada@acme.test>\n"
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

  it.each([
    ["a leading space", `  Co-authored-by: Ada <ada@acme.test>`],
    ["text after the address", `Co-authored-by: Ada <ada@acme.test> thanks`],
    ["a folded line", `Co-authored-by: Ada\n <ada@acme.test>`],
    ["a quoted local part", `Co-authored-by: Jane Doe <"jane doe"@acme.test>`],
    [
      "an international address",
      `Co-authored-by: Bj\u00F6rn <bj\u00F6rn@b\u00FCcher.test>`,
    ],
  ])("fails a commit whose co-author trailer has %s", (_label, trailer) => {
    const sha = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c";

    const commits = parseIdentityLog(
      `${sha}\tnoreply@github.com\tnoreply@github.com\n`
    );

    const bodies = parseBodyLog(`${sha}\tSubject\n\n${trailer}\n\u0000`);

    expect(
      identityOffenders(withCoAuthors(commits, bodies)).map(
        (offender) => offender.field
      )
    ).toEqual(["co-author"]);
  });

  it("reads a body that carries a record separator before the trailer", () => {
    const sha = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c";

    expect(
      parseBodyLog(
        `${sha}\tSubject\n\nA body with a \u001E in it.\n\nCo-authored-by: Ada <ada@acme.test>\u0000`
      )
    ).toEqual([
      {
        body: "Subject\n\nA body with a \u001E in it.\n\nCo-authored-by: Ada <ada@acme.test>",
        commit: sha,
      },
    ]);
  });

  it("reads a trailer with a quoted local part", () => {
    expect(
      coAuthorEmailsIn(
        `Subject\n\nCo-authored-by: Jane Doe <"jane doe"@acme.test>\n`
      )
    ).toEqual(['"jane doe"@acme.test']);
  });

  it("reads a trailer with an international address", () => {
    expect(
      coAuthorEmailsIn(
        `Subject\n\nCo-authored-by: Bj\u00F6rn <bj\u00F6rn@b\u00FCcher.test>\n`
      )
    ).toEqual(["bj\u00F6rn@b\u00FCcher.test"]);
  });
});
