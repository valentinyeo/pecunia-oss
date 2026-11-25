#!/usr/bin/env node
import { Effect, Predicate, Schema, Clock } from "effect";

import {
  PersonSchema,
  ProfileIdSchema,
} from "../../../../packages/access/dist/index.js";
import {
  dispatchTool,
  memoryToolsLayer,
  SuggestionStore,
  ToolCaller,
  ToolCatalog,
} from "../../../../packages/ai-tools/dist/index.js";
import {
  BankLineSchema,
  ReviewSchema,
} from "../../../../packages/bank-lines/dist/model.js";
import { CategorySchema } from "../../../../packages/categorize/dist/index.js";
import { observe } from "./lib/observation.mjs";

const decode = Schema.decodeSync;

const profileId = decode(ProfileIdSchema)(
  "0192f0c1-6001-7a2b-8c4d-5e6f70819301"
);

const groceriesId = "0192f0c1-6002-7a2b-8c4d-5e6f70819311";

const travelId = "0192f0c1-6003-7a2b-8c4d-5e6f70819312";

const categorizedLineId = "0192f0c1-6004-7a2b-8c4d-5e6f70819321";

const targetLineId = "0192f0c1-6005-7a2b-8c4d-5e6f70819322";

const accountId = "0192f0c1-6006-7a2b-8c4d-5e6f70819331";

const monthlyReportId = "0192f0c1-6007-7a2b-8c4d-5e6f70819341";

const explorationReportId = "0192f0c1-6008-7a2b-8c4d-5e6f70819342";

const otherProfileId = decode(ProfileIdSchema)(
  "0192f0c1-6011-7a2b-8c4d-5e6f70819301"
);

const otherCategoryId = "0192f0c1-6012-7a2b-8c4d-5e6f70819311";

const otherLineId = "0192f0c1-6013-7a2b-8c4d-5e6f70819321";

const otherReportId = "0192f0c1-6014-7a2b-8c4d-5e6f70819341";

const suggestedAt = 1_767_225_600_000;

const owner = decode(PersonSchema)({
  email: "owner@example.com",
  memberships: [{ profileId, role: "owner" }],
  personId: "person-owner",
});

const viewer = decode(PersonSchema)({
  email: "viewer@example.com",
  memberships: [{ profileId, role: "viewer" }],
  personId: "person-viewer",
});

const categories = decode(Schema.Array(CategorySchema))([
  {
    archived: false,
    color: "amber",
    id: groceriesId,
    name: "Groceries",
    parentId: null,
    profileId,
    spendingType: "personal",
  },
  {
    archived: false,
    color: "teal",
    id: travelId,
    name: "Travel",
    parentId: null,
    profileId,
    spendingType: "business",
  },
  {
    archived: false,
    color: "teal",
    id: otherCategoryId,
    name: "Other Groceries",
    parentId: null,
    profileId: otherProfileId,
    spendingType: "personal",
  },
]);

const lines = decode(Schema.Array(BankLineSchema))([
  {
    accountId,
    amount: { currency: "EUR", minor: 12_345 },
    baseAmount: { currency: "EUR", minor: 12_345 },
    category: travelId,
    direction: "out",
    id: categorizedLineId,
    note: "",
    occurredAt: 1_707_566_400_000,
    profileId,
    raw: {
      description: "Demo Rail ticket",
      merchant: "Demo Rail",
      reference: "DEMO-0001",
    },
    review: ReviewSchema.cases.Awaiting.make({}),
    status: "posted",
    valueDate: "2024-02-10",
  },
  {
    accountId,
    amount: { currency: "EUR", minor: 4250 },
    baseAmount: { currency: "EUR", minor: 4250 },
    category: null,
    direction: "out",
    id: targetLineId,
    note: "",
    occurredAt: 1_708_430_400_000,
    profileId,
    raw: {
      description: "Client lunch",
      merchant: "Demo Coffee",
      reference: "DEMO-0002",
    },
    review: ReviewSchema.cases.Awaiting.make({}),
    status: "posted",
    valueDate: "2024-02-20",
  },
  {
    accountId,
    amount: { currency: "EUR", minor: 9900 },
    baseAmount: { currency: "EUR", minor: 9900 },
    category: otherCategoryId,
    direction: "out",
    id: otherLineId,
    note: "",
    occurredAt: 1_706_000_000_000,
    profileId: otherProfileId,
    raw: {
      description: "Other profile lunch",
      merchant: "Demo Bakery",
      reference: "DEMO-0003",
    },
    review: ReviewSchema.cases.Awaiting.make({}),
    status: "posted",
    valueDate: "2024-01-30",
  },
]);

const reports = [
  {
    id: otherReportId,
    kind: "report",
    profileId: otherProfileId,
    slug: "other-profile-report",
    title: "Other profile report",
    updatedAt: 1_709_683_200_000,
  },
  {
    id: explorationReportId,
    kind: "exploration",
    profileId,
    slug: "demo-exploration",
    title: "Demo exploration",
    updatedAt: 1_709_596_800_000,
  },
  {
    id: monthlyReportId,
    kind: "report",
    profileId,
    slug: "demo-monthly",
    title: "Demo monthly report",
    updatedAt: 1_707_566_400_000,
  },
];

const seed = { categories, lines, reports, suggestions: [] };

const fixedClock = {
  currentTimeMillis: Effect.succeed(suggestedAt),
  currentTimeMillisUnsafe: () => suggestedAt,
  currentTimeNanos: Effect.succeed(BigInt(suggestedAt) * 1_000_000n),
  currentTimeNanosUnsafe: () => BigInt(suggestedAt) * 1_000_000n,
  monotonicTimeNanos: Effect.succeed(0n),
  monotonicTimeNanosUnsafe: () => 0n,
  sleep: () => Effect.void,
};

const world = memoryToolsLayer(seed);

const writeTools = new Set(["suggest_category", "confirm_category"]);

const recorder = { total: 0 };

const call = (tool, input, caller = owner) =>
  dispatchTool({ input, tool }).pipe(
    Effect.provideService(ToolCaller, { person: caller, profileId }),
    Effect.tap((envelope) =>
      Effect.sync(() => {
        if (
          writeTools.has(tool) &&
          Predicate.isTagged(envelope.outcome, "Ok")
        ) {
          recorder.total += 1;
        }
      })
    )
  );

const outputOf = (envelope) =>
  Predicate.isTagged(envelope.outcome, "Ok")
    ? envelope.outcome.output
    : undefined;

const refusalOf = (envelope) =>
  Predicate.isTagged(envelope.outcome, "Refused")
    ? envelope.outcome
    : undefined;

const refusalText = (envelope) => {
  const refusal = refusalOf(envelope);

  return refusal === undefined
    ? "no-refusal"
    : `reason=${refusal.reason} field=${refusal.field ?? "none"}`;
};

const categoriesText = (page) =>
  `categories=${page.categories.length} names=${page.categories.map((category) => category.name).join(",")}`;

const linesText = (page) =>
  `lines=${page.lines.length} total=${page.total} next=${page.nextCursor ?? "none"}`;

const reportsText = (page) =>
  `reports=${page.reports.length} kinds=${page.reports.map((report) => report.kind).join(",")}`;

const lineText = (line) =>
  `line=${line.id} category=${line.category ?? "none"} review=${line.review._tag}`;

const observations = await Effect.runPromise(
  Effect.gen(function* driveTools() {
    const emitted = [
      observe({
        id: "ai-tools-catalog",
        value: ToolCatalog.map((tool) => `${tool.name}:${tool.access}`).join(
          ","
        ),
      }),
    ];

    const catalog = outputOf(yield* call("list_categories", { limit: 200 }));

    emitted.push(
      observe({
        id: "ai-tools-lists-categories",
        value: categoriesText(catalog),
      })
    );

    const page = outputOf(yield* call("list_lines", { limit: 200 }));

    emitted.push(
      observe({
        id: "ai-tools-lists-lines",
        value: linesText(page),
      })
    );

    const before = outputOf(yield* call("get_line", { lineId: targetLineId }));

    emitted.push(
      observe({
        id: "ai-tools-reads-one-line",
        value: lineText(before.line),
      })
    );

    const suggestion = outputOf(
      yield* call("suggest_category", {
        categoryId: groceriesId,
        lineId: targetLineId,
      })
    );

    const afterSuggestion = outputOf(
      yield* call("get_line", { lineId: targetLineId })
    );

    emitted.push(
      observe({
        id: "ai-tools-suggests-without-confirming",
        value: `suggested=${suggestion.suggestion.categoryId} lineCategory=${afterSuggestion.line.category ?? "none"}`,
      })
    );

    const confirmed = outputOf(
      yield* call("confirm_category", {
        categoryId: groceriesId,
        lineId: targetLineId,
      })
    );

    emitted.push(
      observe({
        id: "ai-tools-confirms-a-category",
        value: `line=${confirmed.line.id} category=${confirmed.line.category ?? "none"}`,
      })
    );

    const readback = outputOf(yield* call("list_lines", { limit: 200 }));

    emitted.push(
      observe({
        id: "ai-tools-confirmed-line-reads-back",
        operation: "list_lines",
        value: readback.lines,
      })
    );

    const reportPage = outputOf(yield* call("list_reports", { limit: 200 }));

    emitted.push(
      observe({
        id: "ai-tools-lists-reports",
        value: reportsText(reportPage),
      })
    );

    const viewerCategories = outputOf(
      yield* call("list_categories", { limit: 200 }, viewer)
    );

    emitted.push(
      observe({
        id: "ai-tools-viewer-lists-categories",
        value: categoriesText(viewerCategories),
      })
    );

    const viewerLines = outputOf(
      yield* call("list_lines", { limit: 200 }, viewer)
    );

    emitted.push(
      observe({
        id: "ai-tools-viewer-lists-lines",
        value: linesText(viewerLines),
      })
    );

    const viewerLine = outputOf(
      yield* call("get_line", { lineId: targetLineId }, viewer)
    );

    emitted.push(
      observe({
        id: "ai-tools-viewer-reads-one-line",
        value: lineText(viewerLine.line),
      })
    );

    const viewerReports = outputOf(
      yield* call("list_reports", { limit: 200 }, viewer)
    );

    emitted.push(
      observe({
        id: "ai-tools-viewer-lists-reports",
        value: reportsText(viewerReports),
      })
    );

    const viewerConfirm = yield* call(
      "confirm_category",
      { categoryId: travelId, lineId: targetLineId },
      viewer
    );

    emitted.push(
      observe({
        id: "ai-tools-refuses-a-viewer-confirm",
        value: refusalText(viewerConfirm),
      })
    );

    const afterViewerConfirm = outputOf(
      yield* call("get_line", { lineId: targetLineId })
    );

    emitted.push(
      observe({
        id: "ai-tools-viewer-confirm-changes-nothing",
        value: `line=${afterViewerConfirm.line.id} category=${afterViewerConfirm.line.category ?? "none"}`,
      })
    );

    const viewerWrite = yield* call(
      "suggest_category",
      { categoryId: groceriesId, lineId: categorizedLineId },
      viewer
    );

    emitted.push(
      observe({
        id: "ai-tools-refuses-a-viewer-write",
        value: refusalText(viewerWrite),
      })
    );

    const suggestionStore = yield* SuggestionStore;
    const stored = yield* suggestionStore.list(profileId);

    emitted.push(
      observe({
        id: "ai-tools-viewer-suggest-stores-nothing",
        value: `suggestions=${stored.length} lines=${stored
          .map((entry) => entry.lineId)
          .toSorted()
          .join(",")}`,
      })
    );

    const unknown = yield* call("run_sql", {});

    emitted.push(
      observe({
        id: "ai-tools-refuses-an-unknown-tool",
        value: refusalText(unknown),
      })
    );

    return { observations: emitted };
  }).pipe(Effect.provide(world), Effect.provideService(Clock.Clock, fixedClock))
);

process.stdout.write(
  `${JSON.stringify({ ...observations, mutatingCalls: recorder.total }, null, 2)}\n`
);
