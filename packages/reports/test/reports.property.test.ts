import { describe, expect, it } from "@effect/vitest";
import { Forbidden } from "@pecunia/access";
import type { Person } from "@pecunia/access";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";

import {
  deleteReport,
  getReport,
  InvalidReport,
  listReports,
  memoryReportStoreLayer,
  ReportNotFound,
  ReportSchema,
  saveReport,
} from "../src/index.js";
import type { Report, ReportDraft, ReportId } from "../src/index.js";
import { draft, ownerOf, personWith, profileId, reportId } from "./fixtures.js";

const CASE_COUNT = 600;

const SEED = 20_260_601;

const INSTANT_CASE_COUNT = 600;

const ELSEWHERE = "profile-elsewhere";

const CASE_TITLES = [
  "March report",
  "Demo Bank summary",
  "Example Ltd invoices",
  "Rent and bills",
  "A",
] as const;

const CASE_BODIES = [
  "Demo Bank account moved by 1200.00",
  "Example Ltd paid 450.00\nRent 1200.00",
  "",
  "Two lines\n\nand a gap",
] as const;

const CONTROL_TITLE = "Demo\u0000report";

type Random = () => number;

const makeRandom = (seed: number): Random => {
  let state = seed % 4_294_967_296;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
};

const pick = <A>(random: Random, values: readonly A[]): A => {
  const value = values[Math.floor(random() * values.length)];

  if (value === undefined) {
    throw new Error("The generator picked from an empty list");
  }

  return value;
};

const firstOf = <A>(values: readonly A[]): A => {
  const [value] = values;

  if (value === undefined) {
    throw new Error("The generator produced an empty list");
  }

  return value;
};

const randomInt = (random: Random, minimum: number, maximum: number) =>
  minimum + Math.floor(random() * (maximum - minimum + 1));

const compare = (left: Report, right: Report): number => {
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

const expectOrdered = (rows: readonly Report[], caseIndex: number) => {
  for (const [index, row] of rows.entries()) {
    const previous = rows[index - 1];

    if (previous === undefined) {
      continue;
    }

    expect(
      compare(previous, row),
      `case ${caseIndex}: list order at ${index}`
    ).toBeLessThanOrEqual(0);
  }
};

const PLANS = [
  "valid",
  "valid",
  "valid",
  "valid",
  "title-empty",
  "title-long",
  "title-control",
  "body-long",
  "id-blank",
] as const;

type Plan = (typeof PLANS)[number];

interface PlannedDraft {
  readonly draft: ReportDraft;
  readonly refusedField?: "body" | "id" | "title";
}

const makeTitle = (random: Random): string => {
  const core = pick(random, CASE_TITLES);
  const padding = " ".repeat(randomInt(random, 0, 3));

  if (random() < 0.2) {
    return `${padding}${"b".repeat(randomInt(random, 1, 120))}${padding}`;
  }

  return `${padding}${core}${padding}`;
};

const makeDraft = (
  random: Random,
  id: string,
  caseIndex: number
): PlannedDraft => {
  const plan: Plan = pick(random, PLANS);
  const body = pick(random, CASE_BODIES);

  if (plan === "title-empty") {
    return { draft: draft(id, "   ", body), refusedField: "title" };
  }

  if (plan === "title-long") {
    return { draft: draft(id, "c".repeat(121), body), refusedField: "title" };
  }

  if (plan === "title-control") {
    return { draft: draft(id, CONTROL_TITLE, body), refusedField: "title" };
  }

  if (plan === "body-long") {
    return {
      draft: draft(id, `Case ${caseIndex}`, "d".repeat(200_001)),
      refusedField: "body",
    };
  }

  if (plan === "id-blank") {
    return { draft: draft("", makeTitle(random), body), refusedField: "id" };
  }

  return { draft: draft(id, makeTitle(random), body) };
};

const tick = (random: Random) =>
  TestClock.adjust(`${randomInt(random, 0, 3)} seconds`);

const asRefusal = (error: InvalidReport) => Effect.succeed(error);

const saveOne = (owner: Person, profile: string, planned: PlannedDraft) =>
  saveReport(owner, profileId(profile), planned.draft).pipe(
    Effect.catchTag("InvalidReport", asRefusal)
  );

const expectRefusal = (
  outcome: Report | InvalidReport,
  planned: PlannedDraft,
  caseIndex: number
) => {
  expect(
    Schema.is(InvalidReport)(outcome),
    `case ${caseIndex}: an invalid draft was accepted`
  ).toBe(true);

  if (Schema.is(InvalidReport)(outcome)) {
    expect(
      outcome.field,
      `case ${caseIndex}: the refusal named the wrong field`
    ).toBe(planned.refusedField);
  }
};

interface CaseContext {
  readonly caseIndex: number;
  readonly foreignId: ReportId;
  readonly owners: readonly Person[];
  readonly profileNames: readonly string[];
  readonly random: Random;
  readonly rowsByProfile: Map<string, readonly Report[]>;
  readonly stranger: Person;
  readonly viewer: Person;
}

const ownerAt = (context: CaseContext, index: number): Person => {
  const owner = context.owners[index];

  if (owner === undefined) {
    throw new Error("The generator lost an owner");
  }

  return owner;
};

const rowsOf = (context: CaseContext, name: string): readonly Report[] => {
  const rows = context.rowsByProfile.get(name);

  if (rows === undefined) {
    throw new Error("The generator lost a profile");
  }

  return rows;
};

const savePhase = (context: CaseContext) =>
  Effect.gen(function* savesEveryDraft() {
    const { caseIndex, profileNames, random } = context;

    for (const [profileIndex, name] of profileNames.entries()) {
      const owner = ownerAt(context, profileIndex);
      const count = randomInt(random, 0, 3);

      for (let index = 0; index < count; index += 1) {
        yield* tick(random);

        const planned = makeDraft(
          random,
          `report-${caseIndex}-${index}`,
          caseIndex
        );

        const outcome = yield* saveOne(owner, name, planned);

        if (planned.refusedField !== undefined) {
          expectRefusal(outcome, planned, caseIndex);
          continue;
        }

        expect(
          Schema.is(InvalidReport)(outcome),
          `case ${caseIndex}: a valid draft was refused`
        ).toBe(false);

        if (Schema.is(InvalidReport)(outcome)) {
          continue;
        }

        expect(
          outcome.title,
          `case ${caseIndex}: the stored title is not the trimmed title`
        ).toBe(planned.draft.title.trim());

        expect(
          outcome.ownerProfileId,
          `case ${caseIndex}: the report belongs to another profile`
        ).toBe(name);

        context.rowsByProfile.set(name, [...rowsOf(context, name), outcome]);
      }
    }
  });

const readPhase = (context: CaseContext) =>
  Effect.gen(function* readsEveryReport() {
    const { caseIndex, foreignId, profileNames } = context;

    for (const [profileIndex, name] of profileNames.entries()) {
      const owner = ownerAt(context, profileIndex);
      const expected = rowsOf(context, name);

      for (const saved of expected) {
        const read = yield* getReport(owner, profileId(name), saved.id);

        expect(
          read,
          `case ${caseIndex}: a report read back differently`
        ).toStrictEqual(saved);
      }

      const rows = yield* listReports(owner, profileId(name));

      expect(
        rows,
        `case ${caseIndex}: the list is not the saved set`
      ).toHaveLength(expected.length);

      expect(
        rows.map((report) => report.id).toSorted(),
        `case ${caseIndex}: the list holds other ids`
      ).toStrictEqual(expected.map((report) => report.id).toSorted());

      expect(
        rows.every((report) => report.ownerProfileId === name),
        `case ${caseIndex}: another profile's report is listed`
      ).toBe(true);

      expect(
        rows.some((report) => report.id === foreignId),
        `case ${caseIndex}: a foreign report is listed`
      ).toBe(false);

      expectOrdered(rows, caseIndex);

      const again = yield* listReports(owner, profileId(name));

      expect(
        again,
        `case ${caseIndex}: the list changed between reads`
      ).toStrictEqual(rows);
    }
  });

const accessPhase = (context: CaseContext) =>
  Effect.gen(function* refusesOutsiders() {
    const { caseIndex, foreignId, profileNames, stranger, viewer } = context;

    const home = profileId(firstOf(profileNames));
    const missingId = reportId(`report-missing-${caseIndex}`);

    const viewerSave = yield* Effect.flip(
      saveReport(viewer, home, draft("report-viewer", "Viewer", "Demo"))
    );

    const viewerList = yield* Effect.flip(listReports(viewer, home));

    const viewerMissing = yield* Effect.flip(
      getReport(viewer, home, missingId)
    );

    const viewerForeign = yield* Effect.flip(
      getReport(viewer, home, foreignId)
    );

    const viewerDelete = yield* Effect.flip(
      deleteReport(viewer, home, foreignId)
    );

    const viewerDeleteMissing = yield* Effect.flip(
      deleteReport(viewer, home, missingId)
    );

    expect(viewerSave, `case ${caseIndex}: a viewer saved`).toBeInstanceOf(
      Forbidden
    );
    expect(viewerList, `case ${caseIndex}: a viewer listed`).toBeInstanceOf(
      Forbidden
    );
    expect(viewerDelete, `case ${caseIndex}: a viewer deleted`).toBeInstanceOf(
      Forbidden
    );
    expect(
      viewerDelete,
      `case ${caseIndex}: a viewer learned via delete whether the report exists`
    ).toStrictEqual(viewerDeleteMissing);
    expect(
      viewerForeign,
      `case ${caseIndex}: a viewer learned the report exists`
    ).toStrictEqual(viewerMissing);

    const strangerList = yield* Effect.flip(listReports(stranger, home));

    const strangerSave = yield* Effect.flip(
      saveReport(stranger, home, draft("report-stranger", "Stranger", "Demo"))
    );

    const strangerMissing = yield* Effect.flip(
      getReport(stranger, home, missingId)
    );

    const strangerForeign = yield* Effect.flip(
      getReport(stranger, home, foreignId)
    );

    const strangerDelete = yield* Effect.flip(
      deleteReport(stranger, home, foreignId)
    );

    const strangerDeleteMissing = yield* Effect.flip(
      deleteReport(stranger, home, missingId)
    );

    expect(strangerList, `case ${caseIndex}: a stranger listed`).toBeInstanceOf(
      Forbidden
    );
    expect(strangerSave, `case ${caseIndex}: a stranger saved`).toBeInstanceOf(
      Forbidden
    );
    expect(
      strangerDelete,
      `case ${caseIndex}: a stranger deleted`
    ).toBeInstanceOf(Forbidden);
    expect(
      strangerForeign,
      `case ${caseIndex}: a stranger learned the report exists`
    ).toStrictEqual(strangerMissing);
    expect(
      strangerDelete,
      `case ${caseIndex}: a stranger learned via delete whether the report exists`
    ).toStrictEqual(strangerDeleteMissing);
  });

const replacePhase = (context: CaseContext) =>
  Effect.gen(function* replacesOneReport() {
    const { caseIndex, profileNames, random } = context;

    const replaceable = profileNames.filter(
      (name) => rowsOf(context, name).length > 0
    );

    if (replaceable.length === 0) {
      return;
    }

    const name = pick(random, replaceable);
    const owner = ownerAt(context, profileNames.indexOf(name));
    const target = pick(random, rowsOf(context, name));

    yield* TestClock.adjust("1 second");

    const replaced = yield* saveReport(
      owner,
      profileId(name),
      draft(target.id, "  Replaced report  ", "Demo text, replaced")
    );

    const rows = yield* listReports(owner, profileId(name));

    expect(
      replaced.createdAt,
      `case ${caseIndex}: a replace reset createdAt`
    ).toBe(target.createdAt);

    expect(
      replaced.updatedAt,
      `case ${caseIndex}: a replace kept the old updatedAt`
    ).toBeGreaterThan(target.updatedAt);

    expect(
      replaced.title,
      `case ${caseIndex}: a replace kept the old title`
    ).toBe("Replaced report");

    expect(
      firstOf(rows).id,
      `case ${caseIndex}: a replaced report is not newest`
    ).toBe(target.id);

    expect(
      rows,
      `case ${caseIndex}: a replace changed the report count`
    ).toHaveLength(rowsOf(context, name).length);

    expectOrdered(rows, caseIndex);

    context.rowsByProfile.set(name, rows);
  });

const deletePhase = (context: CaseContext) =>
  Effect.gen(function* deletesOneReport() {
    const { caseIndex, profileNames, random } = context;

    const deletable = profileNames.filter(
      (name) => rowsOf(context, name).length > 0
    );

    if (deletable.length === 0) {
      return;
    }

    const name = pick(random, deletable);
    const owner = ownerAt(context, profileNames.indexOf(name));
    const target = pick(random, rowsOf(context, name));
    const before = new Map<string, readonly Report[]>();

    for (const [profileIndex, profileName] of profileNames.entries()) {
      before.set(
        profileName,
        yield* listReports(
          ownerAt(context, profileIndex),
          profileId(profileName)
        )
      );
    }

    const removed = yield* deleteReport(owner, profileId(name), target.id);

    expect(
      removed,
      `case ${caseIndex}: the delete named another report`
    ).toStrictEqual(target);

    const gone = yield* Effect.flip(
      getReport(owner, profileId(name), target.id)
    );

    expect(
      gone,
      `case ${caseIndex}: a deleted report is still read`
    ).toBeInstanceOf(ReportNotFound);

    for (const [profileIndex, profileName] of profileNames.entries()) {
      const rows = yield* listReports(
        ownerAt(context, profileIndex),
        profileId(profileName)
      );

      const expected =
        profileName === name
          ? (before.get(profileName) ?? []).filter(
              (report) => report.id !== target.id
            )
          : (before.get(profileName) ?? []);

      expect(
        rows,
        `case ${caseIndex}: a delete touched another report`
      ).toStrictEqual(expected);
    }
  });

const contextFor = (caseIndex: number): CaseContext => {
  const random = makeRandom(SEED + caseIndex);

  const profileNames = Array.from(
    { length: randomInt(random, 1, 3) },
    (_, index) => `profile-${caseIndex}-${index}`
  );

  const owners = profileNames.map((name, index) =>
    ownerOf(`owner-${caseIndex}-${index}@example.test`, name)
  );

  const homeName = firstOf(profileNames);

  return {
    caseIndex,
    foreignId: reportId(`report-elsewhere-${caseIndex}`),
    owners,
    profileNames,
    random,
    rowsByProfile: new Map(profileNames.map((name) => [name, []])),
    stranger: personWith(
      `stranger-${caseIndex}@example.test`,
      random() < 0.5
        ? [{ profileId: `profile-outside-${caseIndex}`, role: "viewer" }]
        : []
    ),
    viewer: personWith(`viewer-${caseIndex}@example.test`, [
      { profileId: homeName, role: "viewer" },
      ...(random() < 0.5
        ? [
            {
              profileId: `profile-outside-${caseIndex}`,
              role: "owner" as const,
            },
          ]
        : []),
    ]),
  };
};

const saveForeignReport = (caseIndex: number) =>
  saveReport(
    ownerOf(`elsewhere-${caseIndex}@example.test`, ELSEWHERE),
    profileId(ELSEWHERE),
    draft(`report-elsewhere-${caseIndex}`, "Elsewhere report", "Demo text")
  );

const reportCase = (caseIndex: number) =>
  Effect.gen(function* runCase() {
    yield* saveForeignReport(caseIndex);

    const context = contextFor(caseIndex);

    yield* savePhase(context);
    yield* readPhase(context);
    yield* accessPhase(context);
    yield* replacePhase(context);
    yield* deletePhase(context);
  });

describe("reports property", () => {
  it.effect(
    "keeps every report inside its profile, its rules and its order",
    () =>
      Effect.gen(function* reportsProperty() {
        for (let caseIndex = 0; caseIndex < CASE_COUNT; caseIndex += 1) {
          yield* reportCase(caseIndex).pipe(
            Effect.provide(memoryReportStoreLayer)
          );
        }
      })
  );

  it.effect("a report holds only instants in order", () =>
    Effect.sync(() => {
      const random = makeRandom(SEED);

      for (let caseIndex = 0; caseIndex < INSTANT_CASE_COUNT; caseIndex += 1) {
        const createdAt = randomInt(random, 0, 50);
        const updatedAt = randomInt(random, 0, 50);

        const report = {
          body: "Demo",
          createdAt,
          id: `report-${caseIndex}`,
          ownerProfileId: `profile-${caseIndex}`,
          title: `Report ${caseIndex}`,
          updatedAt,
        };

        expect(
          Schema.is(ReportSchema)(report),
          `case ${caseIndex}: ${updatedAt} after ${createdAt}`
        ).toBe(updatedAt >= createdAt);
      }
    })
  );
});
