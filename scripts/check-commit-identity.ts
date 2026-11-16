// @effect-diagnostics nodeBuiltinImport:off -- This guard reads commit identity and trailers through Git.
import { execFileSync } from "node:child_process";

import { Option, Schema } from "effect";

const NO_REPLY_SENDERS = new Set([
  "noreply@anthropic.com",
  "noreply@github.com",
]);

const NO_REPLY_DOMAIN = "users.noreply.github.com";

const IDENTITY_FORMAT = "--format=%H%x09%ae%x09%ce";

const BODY_FORMAT = "--format=%x1e%H%x09%B";

const TRAILER = /^\s*(?<token>[^:\s][^:]*?)\s*:\s*(?<value>.*)$/u;

const ADDRESS = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu;

const CO_AUTHOR_KEY = "coauthoredby";

const CONTINUATION = /^\s+\S/u;

const trailerKey = (token: string) =>
  token.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");

export type IdentityField = "author" | "co-author" | "committer";

export interface CommitIdentity {
  readonly authorEmail: string;
  readonly coAuthorEmails: readonly string[];
  readonly commit: string;
  readonly committerEmail: string;
}

export interface CommitBody {
  readonly body: string;
  readonly commit: string;
}

export interface IdentityOffender {
  readonly commit: string;
  readonly domain: string;
  readonly field: IdentityField;
}

const SchemaLine = Schema.Struct({
  authorEmail: Schema.NonEmptyString,
  commit: Schema.NonEmptyString,
  committerEmail: Schema.NonEmptyString,
});

const decodeLine = Schema.decodeUnknownOption(SchemaLine);

export const domainOf = (address: string) => {
  const at = address.lastIndexOf("@");

  return at === -1 || at === address.length - 1
    ? "unknown"
    : address.slice(at + 1).toLowerCase();
};

export const isAllowedIdentityEmail = (address: string) => {
  const email = address.trim().toLowerCase();

  return NO_REPLY_SENDERS.has(email) || domainOf(email) === NO_REPLY_DOMAIN;
};

export const coAuthorEmailsIn = (body: string): readonly string[] => {
  const values: string[] = [];

  let open: string | undefined;

  const close = () => {
    if (open !== undefined) {
      values.push(open);
    }

    open = undefined;
  };

  for (const line of body.split("\n")) {
    if (open !== undefined && CONTINUATION.test(line)) {
      open = `${open} ${line.trim()}`;

      continue;
    }

    close();

    const groups = TRAILER.exec(line)?.groups;

    if (
      groups === undefined ||
      trailerKey(groups.token ?? "") !== CO_AUTHOR_KEY
    ) {
      continue;
    }

    open = groups.value ?? "";
  }

  close();

  return values.flatMap((value) =>
    [...value.matchAll(ADDRESS)].map((match) => match[0])
  );
};

export const parseIdentityLog = (log: string): readonly CommitIdentity[] =>
  log
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [commit, authorEmail, committerEmail] = line.split("\t");

      const decoded = decodeLine({
        authorEmail: authorEmail ?? "",
        commit: commit ?? "",
        committerEmail: committerEmail ?? "",
      });

      if (Option.isNone(decoded)) {
        throw new Error(
          "Git printed a commit identity this guard cannot read. The log format and the parser disagree. Fix: run `git log --format=%H%x09%ae%x09%ce` in the checkout and correct `scripts/check-commit-identity.ts`."
        );
      }

      return { coAuthorEmails: [], ...decoded.value };
    });

export const parseBodyLog = (log: string): readonly CommitBody[] =>
  log
    .split("\u001E")
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const separator = record.indexOf("\t");

      return separator === -1
        ? { body: "", commit: record.trim() }
        : {
            body: record.slice(separator + 1),
            commit: record.slice(0, separator).trim(),
          };
    });

export const withCoAuthors = (
  commits: readonly CommitIdentity[],
  bodies: readonly CommitBody[]
): readonly CommitIdentity[] => {
  const bodiesByCommit = new Map(
    bodies.map((entry) => [entry.commit, entry.body])
  );

  return commits.map((commit) => ({
    ...commit,
    coAuthorEmails: coAuthorEmailsIn(bodiesByCommit.get(commit.commit) ?? ""),
  }));
};

export const identityOffenders = (
  commits: readonly CommitIdentity[]
): readonly IdentityOffender[] =>
  commits.flatMap((commit) =>
    [
      { email: commit.authorEmail, field: "author" as const },
      { email: commit.committerEmail, field: "committer" as const },
      ...commit.coAuthorEmails.map((email) => ({
        email,
        field: "co-author" as const,
      })),
    ].flatMap((candidate) =>
      isAllowedIdentityEmail(candidate.email)
        ? []
        : [
            {
              commit: commit.commit,
              domain: domainOf(candidate.email),
              field: candidate.field,
            },
          ]
    )
  );

export const offenderMessage = (offender: IdentityOffender) =>
  offender.field === "co-author"
    ? `commit ${offender.commit.slice(0, 12)} (co-author): a Co-authored-by trailer uses a real email address on ${offender.domain}. Commit trailers are public, so a real address names a person. Fix: drop the trailer with \`git interpret-trailers --in-place --trim-empty --trailer "Co-authored-by:" <message-file>\` and recommit.`
    : `commit ${offender.commit.slice(0, 12)} (${offender.field}): commit author or committer uses a real email address on ${offender.domain}. Commits are public, so a real address names a person. Fix: set \`git config user.email <id>+<login>@users.noreply.github.com\` and recommit.`;

const log = (range: string, format: string) =>
  execFileSync("git", ["log", format, range], { encoding: "utf-8" });

const run = () => {
  const range = process.argv[2] ?? "HEAD";

  const commits = withCoAuthors(
    parseIdentityLog(log(range, IDENTITY_FORMAT)),
    parseBodyLog(log(range, BODY_FORMAT))
  );

  const offenders = identityOffenders(commits);

  if (offenders.length === 0) {
    process.stdout.write(
      `check-commit-identity: scanned ${commits.length} commits in ${range}; every author, committer, and co-author uses a no-reply address.\n`
    );

    return;
  }

  process.stderr.write(
    `${offenders.map(offenderMessage).join("\n")}\n\n${offenders.length} commit identities carry a real email address. Only the domain is printed, never the address.\n`
  );

  process.exitCode = 1;
};

if (import.meta.main) {
  run();
}
