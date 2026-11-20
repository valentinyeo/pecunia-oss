import { Match, Predicate, Result } from "effect";

import { ArchivePlaceUnavailable } from "./archive-place-unavailable.js";
import { ArchiveStateRefused } from "./archive-state-refused.js";
import { ArchiveStateSchema } from "./model.js";
import type {
  ArchiveOutcome,
  ArchivePlace,
  ArchiveStateTag,
  InvoiceDocument,
  TimestampMillis,
} from "./model.js";

const refuse = (
  document: InvoiceDocument,
  from: ArchiveStateTag,
  to: ArchiveStateTag
) =>
  Result.fail(
    new ArchiveStateRefused({
      documentId: document.id,
      from,
      message: `Invoice ${document.id} is ${from}, so it cannot move to ${to}.`,
      profileId: document.profileId,
      repair:
        "Reserve the archive file first with `reserveInvoiceArchive`, then record the outcome.",
      to,
    })
  );

const reserved = (
  document: InvoiceDocument,
  fileId: string,
  placeId: ArchivePlace["id"]
): InvoiceDocument => ({
  ...document,
  archive: ArchiveStateSchema.cases.Reserved.make({ fileId, placeId }),
});

const outcomeTag = (outcome: ArchiveOutcome): ArchiveStateTag =>
  Predicate.isTagged(outcome, "Archived") ? "Archived" : "Failed";

export const reserveArchive = (
  document: InvoiceDocument,
  place: ArchivePlace,
  fileId: string
): Result.Result<
  InvoiceDocument,
  ArchivePlaceUnavailable | ArchiveStateRefused
> => {
  if (place.provider === "none") {
    return Result.fail(
      new ArchivePlaceUnavailable({
        message: `Archive place ${place.id} has provider none, so it stores no file.`,
        placeId: place.id,
        profileId: document.profileId,
        provider: place.provider,
        repair:
          "Save an archive place with provider `drive` or `local` with `saveArchivePlace` before archiving.",
      })
    );
  }

  return Match.value(document.archive).pipe(
    Match.tag("Archived", () => refuse(document, "Archived", "Reserved")),
    Match.tag("Failed", () =>
      Result.succeed(reserved(document, fileId, place.id))
    ),
    Match.tag("Unarchived", () =>
      Result.succeed(reserved(document, fileId, place.id))
    ),
    Match.tag("Reserved", (state) =>
      state.fileId === fileId && state.placeId === place.id
        ? Result.succeed(document)
        : refuse(document, "Reserved", "Reserved")
    ),
    Match.exhaustive
  );
};

export const recordArchive = (
  document: InvoiceDocument,
  outcome: ArchiveOutcome,
  archivedAt: TimestampMillis
): Result.Result<InvoiceDocument, ArchiveStateRefused> => {
  const tag = outcomeTag(outcome);

  return Match.value(document.archive).pipe(
    Match.tag("Archived", () =>
      tag === "Archived"
        ? Result.succeed(document)
        : refuse(document, "Archived", "Failed")
    ),
    Match.tag("Failed", (state) =>
      Predicate.isTagged(outcome, "Failed") && outcome.reason === state.reason
        ? Result.succeed(document)
        : refuse(document, "Failed", tag)
    ),
    Match.tag("Unarchived", () => refuse(document, "Unarchived", tag)),
    Match.tag("Reserved", (state) =>
      Match.value(outcome).pipe(
        Match.tag("Archived", () =>
          Result.succeed({
            ...document,
            archive: ArchiveStateSchema.cases.Archived.make({
              archivedAt,
              fileId: state.fileId,
              placeId: state.placeId,
            }),
          })
        ),
        Match.tag("Failed", ({ reason }) =>
          Result.succeed({
            ...document,
            archive: ArchiveStateSchema.cases.Failed.make({ reason }),
          })
        ),
        Match.exhaustive
      )
    ),
    Match.exhaustive
  );
};
