import { describe, expect, it } from "@effect/vitest";
import { Forbidden } from "@pecunia/access";
import { Effect, Option, Schema } from "effect";
import { TestClock } from "effect/testing";

import {
  deleteReport,
  getReport,
  InvalidReport,
  listReports,
  memoryReportStoreLayer,
  ReportNotFound,
  ReportSchema,
  ReportStore,
  ReportStoreError,
  saveReport,
} from "../src/index.js";
import type { Report } from "../src/index.js";
import {
  DEMO_PROFILE,
  draft,
  OTHER_PROFILE,
  ownerOf,
  personWith,
  profileId,
  reportId,
  storedReport,
} from "./fixtures.js";

const MEMBER = "owner@example.test";

const VIEWER = "viewer@example.test";

const STRANGER = "stranger@example.test";

const REPORT = "report-march";

const title = (length: number): string => "a".repeat(length);

const withStore = <A, E>(effect: Effect.Effect<A, E, ReportStore>) =>
  effect.pipe(Effect.provide(memoryReportStoreLayer));

const home = profileId(DEMO_PROFILE);

const other = profileId(OTHER_PROFILE);

const owner = ownerOf(MEMBER, DEMO_PROFILE);

const otherOwner = ownerOf("other-owner@example.test", OTHER_PROFILE);

const viewer = personWith(VIEWER, [
  { profileId: DEMO_PROFILE, role: "viewer" },
]);

const stranger = personWith(STRANGER, []);

const save = (id: string, reportTitle: string, body = "Demo text") =>
  saveReport(owner, home, draft(id, reportTitle, body));

describe("saveReport", () => {
  it.effect("an owner saves a report and reads it back", () =>
    withStore(
      Effect.gen(function* savesAndReads() {
        const saved = yield* saveReport(
          owner,
          home,
          draft(REPORT, "  Demo report  ", "Demo Bank account moved")
        );

        expect(saved.id).toBe(REPORT);
        expect(saved.title).toBe("Demo report");
        expect(saved.body).toBe("Demo Bank account moved");
        expect(saved.ownerProfileId).toBe(DEMO_PROFILE);
        expect(saved.createdAt).toBe(saved.updatedAt);

        const read = yield* getReport(owner, home, reportId(REPORT));

        expect(read).toStrictEqual(saved);
      })
    )
  );

  it.effect("the body comes back exactly as stored, as text", () =>
    withStore(
      Effect.gen(function* keepsBodyVerbatim() {
        const body =
          '<script>alert("demo")</script> & Example Ltd\'s "quote"\n  Demo  ';

        yield* saveReport(owner, home, draft(REPORT, "Demo report", body));

        const read = yield* getReport(owner, home, reportId(REPORT));

        expect(read.body).toBe(body);
      })
    )
  );

  it.effect("a title of 120 characters is accepted", () =>
    withStore(
      Effect.gen(function* longestTitle() {
        const saved = yield* save(REPORT, title(120));

        expect(saved.title).toBe(title(120));
      })
    )
  );

  it.effect("a body of 200000 characters is accepted", () =>
    withStore(
      Effect.gen(function* longestBody() {
        const body = "a".repeat(200_000);

        const saved = yield* save(REPORT, "Demo report", body);

        expect(saved.body).toHaveLength(200_000);
      })
    )
  );
});

describe("parseReportDraft", () => {
  it.effect("refuses an empty title and names the title", () =>
    withStore(
      Effect.gen(function* emptyTitle() {
        const failure = yield* Effect.flip(save(REPORT, "   "));

        expect(failure).toBeInstanceOf(InvalidReport);
        expect(failure).toHaveProperty("field", "title");
      })
    )
  );

  it.effect("refuses a title of 121 characters and names the title", () =>
    withStore(
      Effect.gen(function* longTitle() {
        const failure = yield* Effect.flip(save(REPORT, title(121)));

        expect(failure).toHaveProperty("field", "title");
      })
    )
  );

  it.effect("refuses a control character in the title", () =>
    withStore(
      Effect.gen(function* controlTitle() {
        const failure = yield* Effect.flip(save(REPORT, "Demo\u0000report"));

        expect(failure).toHaveProperty("field", "title");
      })
    )
  );

  it.effect("refuses a body over 200000 characters and names the body", () =>
    withStore(
      Effect.gen(function* longBody() {
        const failure = yield* Effect.flip(
          save(REPORT, "Demo report", title(200_001))
        );

        expect(failure).toBeInstanceOf(InvalidReport);
        expect(failure).toHaveProperty("field", "body");
      })
    )
  );

  it.effect("refuses a blank id and names the id", () =>
    withStore(
      Effect.gen(function* blankId() {
        const failure = yield* Effect.flip(save("", "Demo report"));

        expect(failure).toHaveProperty("field", "id");
      })
    )
  );

  it.effect("a refused draft is not stored", () =>
    withStore(
      Effect.gen(function* refusesNothing() {
        yield* Effect.flip(save(REPORT, ""));

        const rows = yield* listReports(owner, home);

        expect(rows).toStrictEqual([]);
      })
    )
  );
});

describe("access", () => {
  it.effect("a viewer reads nothing and writes nothing", () =>
    withStore(
      Effect.gen(function* viewerRefused() {
        const saveFailure = yield* Effect.flip(
          saveReport(viewer, home, draft(REPORT, "Demo report", "Demo text"))
        );

        const listFailure = yield* Effect.flip(listReports(viewer, home));

        const deleteFailure = yield* Effect.flip(
          deleteReport(viewer, home, reportId(REPORT))
        );

        expect(saveFailure).toBeInstanceOf(Forbidden);
        expect(listFailure).toBeInstanceOf(Forbidden);
        expect(deleteFailure).toBeInstanceOf(Forbidden);
        expect(saveFailure).toHaveProperty("reason", "notOwner");
      })
    )
  );

  it.effect("a stranger is not a member", () =>
    withStore(
      Effect.gen(function* strangerRefused() {
        const failure = yield* Effect.flip(listReports(stranger, home));

        expect(failure).toBeInstanceOf(Forbidden);
        expect(failure).toHaveProperty("reason", "notMember");
      })
    )
  );

  it.effect(
    "a viewer gets the same answer for a missing and a foreign id",
    () =>
      withStore(
        Effect.gen(function* viewerSameAnswer() {
          yield* saveReport(
            otherOwner,
            other,
            draft(REPORT, "Other report", "Demo")
          );

          const missing = yield* Effect.flip(
            getReport(viewer, home, reportId("report-missing"))
          );

          const foreign = yield* Effect.flip(
            getReport(viewer, home, reportId(REPORT))
          );

          expect(missing).toBeInstanceOf(Forbidden);
          expect(foreign).toStrictEqual(missing);
        })
      )
  );

  it.effect(
    "a stranger gets the same answer for a missing and a foreign id",
    () =>
      withStore(
        Effect.gen(function* strangerSameAnswer() {
          yield* saveReport(
            otherOwner,
            other,
            draft(REPORT, "Other report", "Demo")
          );

          const missing = yield* Effect.flip(
            getReport(stranger, home, reportId("report-missing"))
          );

          const foreign = yield* Effect.flip(
            getReport(stranger, home, reportId(REPORT))
          );

          expect(missing).toBeInstanceOf(Forbidden);
          expect(foreign).toStrictEqual(missing);
        })
      )
  );

  it.effect(
    "an owner gets the same answer for a missing and a foreign id",
    () =>
      withStore(
        Effect.gen(function* ownerSameAnswer() {
          yield* saveReport(
            otherOwner,
            other,
            draft(REPORT, "Other report", "Demo")
          );

          const missing = yield* Effect.flip(
            getReport(owner, home, reportId("report-missing"))
          );

          const foreign = yield* Effect.flip(
            getReport(owner, home, reportId(REPORT))
          );

          expect(missing).toBeInstanceOf(ReportNotFound);
          expect(foreign).toBeInstanceOf(ReportNotFound);
        })
      )
  );
});

describe("ReportStore", () => {
  it.effect("each profile keeps its own report with the same id", () =>
    withStore(
      Effect.gen(function* perProfileIds() {
        const store = yield* ReportStore;

        const mine = storedReport({
          body: "Demo",
          createdAt: 1,
          id: REPORT,
          profile: DEMO_PROFILE,
          title: "Mine",
          updatedAt: 1,
        });

        const theirs = storedReport({
          body: "Demo",
          createdAt: 2,
          id: REPORT,
          profile: OTHER_PROFILE,
          title: "Theirs",
          updatedAt: 2,
        });

        yield* store.save(home, mine);
        yield* store.save(other, theirs);

        expect(yield* store.get(home, reportId(REPORT))).toStrictEqual(
          Option.some(mine)
        );
        expect(yield* store.list(home)).toStrictEqual([mine]);
        expect(yield* store.list(other)).toStrictEqual([theirs]);
      })
    )
  );

  it.effect("get and delete never reach another profile", () =>
    withStore(
      Effect.gen(function* filteredCalls() {
        const store = yield* ReportStore;

        const theirs = storedReport({
          body: "Demo",
          createdAt: 2,
          id: REPORT,
          profile: OTHER_PROFILE,
          title: "Theirs",
          updatedAt: 2,
        });

        yield* store.save(other, theirs);

        const removed = yield* store.delete(home, reportId(REPORT));

        expect(removed).toStrictEqual(Option.none());

        expect(yield* store.get(home, reportId(REPORT))).toStrictEqual(
          Option.none()
        );
        expect(yield* store.list(other)).toStrictEqual([theirs]);
      })
    )
  );

  it.effect("replace keeps createdAt and the newest updatedAt wins", () =>
    withStore(
      Effect.gen(function* replaceKeepsHistory() {
        const store = yield* ReportStore;

        const first = storedReport({
          body: "Demo",
          createdAt: 1,
          id: "report-one",
          profile: DEMO_PROFILE,
          title: "One",
          updatedAt: 1,
        });

        const replaced = storedReport({
          body: "Demo",
          createdAt: 1,
          id: "report-one",
          profile: DEMO_PROFILE,
          title: "One, edited",
          updatedAt: 5,
        });

        expect(yield* store.save(home, first)).toStrictEqual(first);

        const stored = yield* store.save(home, replaced);

        expect(stored.createdAt).toBe(1);
        expect(stored.updatedAt).toBe(5);
        expect(yield* store.list(home)).toStrictEqual([stored]);
      })
    )
  );

  it.effect(
    "a replace never returns a report updated before it was created",
    () =>
      withStore(
        Effect.gen(function* replaceAfterClockSkew() {
          const store = yield* ReportStore;

          const created = storedReport({
            body: "Demo",
            createdAt: 10,
            id: "report-one",
            profile: DEMO_PROFILE,
            title: "One",
            updatedAt: 10,
          });

          const skewed = storedReport({
            body: "Demo",
            createdAt: 5,
            id: "report-one",
            profile: DEMO_PROFILE,
            title: "One, edited",
            updatedAt: 6,
          });

          yield* store.save(home, created);

          const stored = yield* store.save(home, skewed);

          expect(stored.createdAt).toBe(10);
          expect(stored.updatedAt).toBe(10);
          expect(Schema.is(ReportSchema)(stored)).toBe(true);
        })
      )
  );

  it.effect("a save under another profile is refused and changes nothing", () =>
    withStore(
      Effect.gen(function* refusesForeignSave() {
        const store = yield* ReportStore;

        const mine = storedReport({
          body: "Demo",
          createdAt: 1,
          id: REPORT,
          profile: DEMO_PROFILE,
          title: "Mine",
          updatedAt: 1,
        });

        yield* store.save(home, mine);

        const failure = yield* Effect.flip(store.save(other, mine));

        expect(failure).toBeInstanceOf(ReportStoreError);
        expect(yield* store.list(home)).toStrictEqual([mine]);
        expect(yield* store.list(other)).toStrictEqual([]);
      })
    )
  );

  it.effect("a report updated before it was created cannot be built", () =>
    withStore(
      Effect.sync(() => {
        expect(() =>
          storedReport({
            body: "Demo",
            createdAt: 5,
            id: "report-inverted",
            profile: DEMO_PROFILE,
            title: "Inverted",
            updatedAt: 4,
          })
        ).toThrow();
      })
    )
  );
});

describe("listReports", () => {
  it.effect("lists newest first and keeps the order stable", () =>
    withStore(
      Effect.gen(function* newestFirst() {
        yield* save("report-b", "B");
        yield* TestClock.adjust("1 second");
        yield* save("report-a", "A");
        yield* TestClock.adjust("1 second");
        yield* save("report-c", "C");

        const first = yield* listReports(owner, home);
        const second = yield* listReports(owner, home);

        expect(first.map((report: Report) => report.id)).toStrictEqual([
          "report-c",
          "report-a",
          "report-b",
        ]);
        expect(second).toStrictEqual(first);
      })
    )
  );

  it.effect("breaks a tie on the same instant by id", () =>
    withStore(
      Effect.gen(function* tieBreak() {
        yield* save("report-b", "B");
        yield* save("report-a", "A");
        yield* save("report-c", "C");

        const rows = yield* listReports(owner, home);

        expect(rows.map((report: Report) => report.id)).toStrictEqual([
          "report-a",
          "report-b",
          "report-c",
        ]);
      })
    )
  );

  it.effect("a replaced report moves to the front and keeps createdAt", () =>
    withStore(
      Effect.gen(function* replaceMovesToFront() {
        const created = yield* save("report-one", "One");

        yield* TestClock.adjust("1 second");
        yield* save("report-two", "Two");
        yield* TestClock.adjust("1 second");

        const replaced = yield* save("report-one", "One, edited", "Demo");

        const rows = yield* listReports(owner, home);

        expect(replaced.createdAt).toBe(created.createdAt);
        expect(replaced.updatedAt).toBeGreaterThan(created.updatedAt);
        expect(rows[0]?.id).toBe("report-one");
        expect(rows).toHaveLength(2);
      })
    )
  );

  it.effect("another profile's list never holds this profile's reports", () =>
    withStore(
      Effect.gen(function* noLeak() {
        yield* save("report-one", "One");

        expect(yield* listReports(otherOwner, other)).toStrictEqual([]);
      })
    )
  );
});

describe("deleteReport", () => {
  it.effect("removes only that report", () =>
    withStore(
      Effect.gen(function* deleteOne() {
        yield* save("report-one", "One");
        yield* save("report-two", "Two");

        const before = yield* listReports(owner, home);

        yield* deleteReport(owner, home, reportId("report-one"));

        const after = yield* listReports(owner, home);

        const gone = yield* Effect.flip(
          getReport(owner, home, reportId("report-one"))
        );

        expect(gone).toBeInstanceOf(ReportNotFound);
        expect(after).toStrictEqual(
          before.filter((report: Report) => report.id !== "report-one")
        );
      })
    )
  );

  it.effect("a second delete finds nothing", () =>
    withStore(
      Effect.gen(function* deleteTwice() {
        yield* save("report-one", "One");
        yield* deleteReport(owner, home, reportId("report-one"));

        const failure = yield* Effect.flip(
          deleteReport(owner, home, reportId("report-one"))
        );

        expect(failure).toBeInstanceOf(ReportNotFound);
      })
    )
  );

  it.effect("deleting in one profile leaves the other profile's report", () =>
    withStore(
      Effect.gen(function* deleteDoesNotCross() {
        yield* save("report-one", "One");
        yield* saveReport(
          otherOwner,
          other,
          draft("report-one", "Theirs", "Demo")
        );

        yield* deleteReport(owner, home, reportId("report-one"));

        expect(yield* listReports(otherOwner, other)).toHaveLength(1);
      })
    )
  );
});
