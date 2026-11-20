import { Option } from "effect";

import type { ArchivePlace, InvoiceDocument } from "./model.js";

const SEPARATORS = /[\\/]+/gu;

const CONTROL = /\p{Cc}/gu;

const SPACES = /\s+/gu;

const LEADING_DOTS = /^\.+/u;

const TRAILING_DOTS = /\.+$/u;

export const FILENAME_MAX_LENGTH = 120;

const SHA_PREFIX_LENGTH = 12;

export const segmentsOf = (reference: string): readonly string[] =>
  reference
    .split(/[\\/]/u)
    .map((segment) => segment.trim())
    .filter(
      (segment) => segment.length > 0 && segment !== "." && segment !== ".."
    );

const cleanedName = (document: InvoiceDocument): string => {
  const cleaned = document.originalFilename
    .replaceAll(SEPARATORS, "-")
    .replaceAll(CONTROL, "-")
    .replaceAll(SPACES, " ")
    .trim()
    .replace(LEADING_DOTS, "")
    .replace(TRAILING_DOTS, "")
    .trim()
    .slice(0, FILENAME_MAX_LENGTH)
    .trim();

  return cleaned.length > 0 ? cleaned : "invoice.pdf";
};

export const archiveFilenameOf = (document: InvoiceDocument): string =>
  `${document.sha256.slice(0, SHA_PREFIX_LENGTH)}-${cleanedName(document)}`;

export const archivePathOf = (
  place: ArchivePlace,
  document: InvoiceDocument
): string =>
  [
    ...segmentsOf(place.rootRef),
    document.documentDate.slice(0, 4),
    document.documentDate.slice(5, 7),
    archiveFilenameOf(document),
  ].join("/");

const matchesEntry = (entry: string, segments: readonly string[]): boolean => {
  const pattern = entry.trim().toLowerCase();
  const filename = (segments.at(-1) ?? "").toLowerCase();

  if (pattern.length === 0) {
    return false;
  }

  if (pattern.startsWith("*.")) {
    return filename.endsWith(pattern.slice(1));
  }

  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);

    return segments.some((segment) => segment.toLowerCase().startsWith(prefix));
  }

  return segments.some((segment) => segment.toLowerCase() === pattern);
};

export const pathBlockedBy = (
  path: string,
  blocklist: readonly string[]
): Option.Option<string> =>
  Option.fromUndefinedOr(
    blocklist.find((entry) => matchesEntry(entry, segmentsOf(path)))
  );
