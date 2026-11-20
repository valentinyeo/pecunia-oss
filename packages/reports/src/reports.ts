import { authorize, Forbidden } from "@pecunia/access";
import type { Person, ProfileId } from "@pecunia/access";
import { DateTime, Effect, Option, Result, Schema } from "effect";

import type { InvalidReport } from "./invalid-report.js";
import { InstantSchema } from "./model.js";
import type { ReportDraft, ReportId } from "./model.js";
import { parseReportDraft } from "./parse.js";
import { ReportNotFound } from "./report-not-found.js";
import type { ReportStoreError } from "./report-store-error.js";
import { ReportStore } from "./store.js";

const currentInstant = DateTime.now.pipe(
  Effect.map(DateTime.toEpochMillis),
  Effect.flatMap((millis) => Schema.decodeEffect(InstantSchema)(millis)),
  Effect.orDie
);

const ownerOnly = Effect.fn("ownerOnly")(function* ownerOnly(
  person: Person,
  profileId: ProfileId
) {
  const membership = yield* authorize(person, profileId, "read");

  if (membership.role !== "owner") {
    return yield* new Forbidden({
      message: `${person.email} is a ${membership.role} on profile ${profileId}`,
      reason: "notOwner",
    });
  }

  return membership;
});

export const saveReport = Effect.fn("saveReport")(function* saveReport(
  person: Person,
  profileId: ProfileId,
  draft: ReportDraft
) {
  yield* ownerOnly(person, profileId);

  const values = parseReportDraft(draft);

  if (Result.isFailure(values)) {
    return yield* values.failure;
  }

  const store = yield* ReportStore;
  const now = yield* currentInstant;

  return yield* store.save(profileId, {
    body: values.success.body,
    createdAt: now,
    id: values.success.id,
    ownerProfileId: profileId,
    title: values.success.title,
    updatedAt: now,
  });
});

export const getReport = Effect.fn("getReport")(function* getReport(
  person: Person,
  profileId: ProfileId,
  id: ReportId
) {
  yield* ownerOnly(person, profileId);

  const store = yield* ReportStore;
  const found = yield* store.get(profileId, id);

  if (Option.isNone(found)) {
    return yield* new ReportNotFound({ id });
  }

  return found.value;
});

export const listReports = Effect.fn("listReports")(function* listReports(
  person: Person,
  profileId: ProfileId
) {
  yield* ownerOnly(person, profileId);

  const store = yield* ReportStore;

  return yield* store.list(profileId);
});

export const deleteReport = Effect.fn("deleteReport")(function* deleteReport(
  person: Person,
  profileId: ProfileId,
  id: ReportId
) {
  yield* ownerOnly(person, profileId);

  const store = yield* ReportStore;
  const removed = yield* store.delete(profileId, id);

  if (Option.isNone(removed)) {
    return yield* new ReportNotFound({ id });
  }

  return removed.value;
});

export type ReportFailure =
  | Forbidden
  | InvalidReport
  | ReportNotFound
  | ReportStoreError;
