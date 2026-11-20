import { Option, Predicate, Schema } from "effect";

import { archivePathOf } from "./archive-path.js";
import type {
  ArchiveDocumentCursor,
  ArchivePlace,
  ArchivedDocument,
  ArchivedDocuments,
  InvoiceDocument,
  TimestampMillis,
} from "./model.js";
import { TimestampMillisSchema } from "./model.js";

const zero = Schema.decodeSync(TimestampMillisSchema)(0);

export const archivedOf = (
  documents: readonly InvoiceDocument[]
): readonly InvoiceDocument[] =>
  documents.filter((document) =>
    Predicate.isTagged(document.archive, "Archived")
  );

const placeOf = (
  places: readonly ArchivePlace[],
  document: InvoiceDocument
): Option.Option<string> => {
  const { archive, profileId } = document;

  if (!Predicate.isTagged(archive, "Archived")) {
    return Option.none();
  }

  const place = places.find(
    (candidate) =>
      candidate.profileId === profileId && candidate.id === archive.placeId
  );

  return Option.map(Option.fromUndefinedOr(place), (found) =>
    archivePathOf(found, document)
  );
};

const archivedAtOf = (document: InvoiceDocument): TimestampMillis => {
  const { archive } = document;

  return Predicate.isTagged(archive, "Archived") ? archive.archivedAt : zero;
};

const rowOf = (
  document: InvoiceDocument,
  places: readonly ArchivePlace[]
): ArchivedDocument => ({
  archivedAt: archivedAtOf(document),
  document,
  path: placeOf(places, document),
});

const compareArchived = (
  left: ArchivedDocument,
  right: ArchivedDocument
): number => {
  if (!Predicate.isTagged(left.document.archive, "Archived")) {
    return 1;
  }

  if (!Predicate.isTagged(right.document.archive, "Archived")) {
    return -1;
  }

  if (left.archivedAt !== right.archivedAt) {
    return left.archivedAt < right.archivedAt ? 1 : -1;
  }

  if (left.document.id === right.document.id) {
    return 0;
  }

  return left.document.id < right.document.id ? -1 : 1;
};

const afterCursor = (
  cursor: ArchiveDocumentCursor,
  row: ArchivedDocument
): boolean =>
  row.archivedAt < cursor.archivedAt ||
  (row.archivedAt === cursor.archivedAt && row.document.id > cursor.documentId);

export const archivedPageOf = (options: {
  readonly cursor: Option.Option<ArchiveDocumentCursor>;
  readonly documents: readonly InvoiceDocument[];
  readonly limit: number;
  readonly places: readonly ArchivePlace[];
}): ArchivedDocuments => {
  const all = archivedOf(options.documents)
    .map((document) => rowOf(document, options.places))
    .toSorted(compareArchived);

  const rest = Option.match(options.cursor, {
    onNone: () => all,
    onSome: (cursor) => all.filter((row) => afterCursor(cursor, row)),
  });

  const rows = rest.slice(0, options.limit);

  const [last] = rows.slice(-1);

  const next =
    rest.length > rows.length && last !== undefined
      ? Option.some({
          archivedAt: last.archivedAt,
          documentId: last.document.id,
        })
      : Option.none();

  return { documents: rows, next, total: all.length };
};
