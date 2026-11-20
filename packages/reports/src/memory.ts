import type { ProfileId } from "@pecunia/access";
import { Effect, Layer, Option, Ref, Semaphore } from "effect";

import type { Report, ReportId } from "./model.js";
import { ReportStoreError } from "./report-store-error.js";
import { ReportStore } from "./store.js";

const newestFirst = (left: Report, right: Report): number => {
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt - left.updatedAt;
  }

  if (left.id < right.id) {
    return -1;
  }

  if (left.id > right.id) {
    return 1;
  }

  return 0;
};

const belongsTo = (profileId: ProfileId, report: Report): boolean =>
  report.ownerProfileId === profileId;

export const memoryReportStoreLayer = Layer.effect(
  ReportStore,
  Effect.gen(function* makeMemoryReportStore() {
    const rows = yield* Ref.make<readonly Report[]>([]);
    const gate = yield* Semaphore.make(1);

    const save = Effect.fn("ReportStore.save")(function* save(
      profileId: ProfileId,
      report: Report
    ) {
      if (report.ownerProfileId !== profileId) {
        return yield* new ReportStoreError({
          cause: new Error(
            `Report ${report.id} belongs to another profile, not ${profileId}`
          ),
          operation: "save",
        });
      }

      return yield* gate.withPermit(
        Effect.gen(function* keepCreatedAt() {
          const current = yield* Ref.get(rows);

          const existing = current.find(
            (row) => belongsTo(profileId, row) && row.id === report.id
          );

          const stored: Report =
            existing === undefined
              ? report
              : { ...report, createdAt: existing.createdAt };

          const kept: Report =
            stored.updatedAt < stored.createdAt
              ? { ...stored, updatedAt: stored.createdAt }
              : stored;

          yield* Ref.set(
            rows,
            existing === undefined
              ? [...current, kept]
              : current.map((row) => (row === existing ? kept : row))
          );

          return kept;
        })
      );
    });

    const get = Effect.fn("ReportStore.get")(function* get(
      profileId: ProfileId,
      id: ReportId
    ) {
      const current = yield* Ref.get(rows);

      return Option.fromUndefinedOr(
        current.find((row) => belongsTo(profileId, row) && row.id === id)
      );
    });

    const list = Effect.fn("ReportStore.list")(function* list(
      profileId: ProfileId
    ) {
      const current = yield* Ref.get(rows);

      return current
        .filter((row) => belongsTo(profileId, row))
        .toSorted(newestFirst);
    });

    const remove = Effect.fn("ReportStore.delete")(function* remove(
      profileId: ProfileId,
      id: ReportId
    ) {
      return yield* gate.withPermit(
        Effect.gen(function* removeReport() {
          const current = yield* Ref.get(rows);

          const found = current.find(
            (row) => belongsTo(profileId, row) && row.id === id
          );

          yield* Ref.set(
            rows,
            current.filter(
              (row) => !(belongsTo(profileId, row) && row.id === id)
            )
          );

          return Option.fromUndefinedOr(found);
        })
      );
    });

    return { delete: remove, get, list, save };
  })
);
