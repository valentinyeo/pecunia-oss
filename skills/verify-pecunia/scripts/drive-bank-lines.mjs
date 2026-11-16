#!/usr/bin/env node
import { Effect, Layer, Option, Schema } from "effect";
import { Clock } from "effect";

import {
  CurrentPerson,
  PersonSchema,
} from "../../../packages/access/dist/index.js";
import {
  editBankLine,
  listBankLines,
  reviewBankLine,
} from "../../../packages/bank-lines/dist/capabilities.js";
import {
  demoBankLines,
  demoCategories,
  demoPerson,
  demoProfileId,
} from "../../../packages/bank-lines/dist/demo.js";
import { memoryBankLineStoreLayer } from "../../../packages/bank-lines/dist/memory.js";
import {
  CategoryChangeSchema,
  CategoryFilterSchema,
  NoteChangeSchema,
  ReviewFilterSchema,
} from "../../../packages/bank-lines/dist/model.js";
import { BankLineService } from "../../../packages/bank-lines/dist/service.js";
import { BankLineStore } from "../../../packages/bank-lines/dist/store.js";
import { countingLayer, mutationRecorder } from "./lib/mutating-adapter.mjs";
import { canonicalRecords } from "./lib/records.mjs";

const fence = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};

const arguments_ = process.argv.slice(2);
const capabilityIndex = arguments_.indexOf("--capability");
if (capabilityIndex === -1 || arguments_[capabilityIndex + 1] === undefined) {
  fence("drive-bank-lines needs --capability <list|edit|review>");
}

const capability = arguments_[capabilityIndex + 1];
if (!["list", "edit", "review"].includes(capability)) {
  fence(`drive-bank-lines does not know the capability ${capability}`);
}

const foreignCategory = "0192f0c1-00ff-7000-8000-000000000000";
const missingLine = "line-missing";
const writtenNote = "Demo note written by the verify drive";
const reviewedAt = 1_767_225_600_000;
const recorder = mutationRecorder();

const fixedClock = {
  currentTimeMillis: Effect.succeed(reviewedAt),
  currentTimeMillisUnsafe: () => reviewedAt,
  currentTimeNanos: Effect.succeed(BigInt(reviewedAt) * 1_000_000n),
  currentTimeNanosUnsafe: () => BigInt(reviewedAt) * 1_000_000n,
  monotonicTimeNanos: Effect.succeed(0n),
  monotonicTimeNanosUnsafe: () => 0n,
  sleep: () => Effect.void,
};

const viewerPerson = Schema.decodeSync(PersonSchema)({
  email: "viewer@example.com",
  memberships: [{ profileId: demoProfileId, role: "viewer" }],
  personId: "person-viewer",
});

const layerFor = (person) =>
  Layer.mergeAll(
    BankLineService.layer.pipe(
      Layer.provide(
        countingLayer({
          layer: memoryBankLineStoreLayer({
            categories: demoCategories,
            lines: demoBankLines,
          }),
          mutations: ["patch"],
          recorder,
          service: BankLineStore,
        })
      )
    ),
    Layer.succeed(CurrentPerson, person)
  );

const noFilter = {
  account: Option.none(),
  amount: Option.none(),
  category: CategoryFilterSchema.cases.Any.make({}),
  direction: Option.none(),
  occurred: Option.none(),
  review: ReviewFilterSchema.cases.Any.make({}),
};

const request = ({
  cursor = Option.none(),
  filter = noFilter,
  limit = 50,
  search = "",
}) => ({
  cursor,
  filter,
  limit,
  profileId: demoProfileId,
  search,
});

const failureTag = (result) =>
  result._tag === "Failure" ? result.failure._tag : "NoFailure";

const editRequest = ({ category, lineId, note }) => ({
  category,
  lineId,
  note,
  profileId: demoProfileId,
});

const reviewRequest = ({ lineId }) => ({ lineId, profileId: demoProfileId });

const ownerLayer = layerFor(demoPerson);

const listObservations = () =>
  Effect.runPromise(
    Effect.gen(function* listBook() {
      const page = yield* listBankLines.handler(request({}));
      const occurred = page.lines.map((line) => line.occurredAt);
      const ordered = occurred.every(
        (value, index) => index === 0 || occurred[index - 1] >= value
      );
      const outFilter = { ...noFilter, direction: Option.some("out") };
      const filtered = yield* listBankLines.handler(
        request({ filter: outFilter })
      );
      const bookOut = page.lines.filter(
        (line) => line.direction === "out"
      ).length;
      const first = yield* listBankLines.handler(request({ limit: 5 }));
      const second = yield* listBankLines.handler(
        request({ cursor: first.next, limit: 5 })
      );
      const firstIds = first.lines.map((line) => line.id);
      const secondIds = second.lines.map((line) => line.id);
      const overlap = secondIds.filter((id) => firstIds.includes(id)).length;
      const awaiting = page.lines.filter(
        (line) => line.review._tag === "Awaiting"
      ).length;

      return {
        observations: [
          {
            id: "bank-line-list-returns-the-demo-book",
            value: `total=${page.lines.length} demoLines=${demoBankLines.length} awaiting=${awaiting}`,
          },
          {
            id: "bank-line-list-orders-newest-first",
            value: ordered ? "true" : "false",
          },
          {
            id: "bank-line-list-filters-by-direction",
            value: `lines=${filtered.lines.length} allOut=${filtered.lines.every((line) => line.direction === "out")} bookOut=${bookOut}`,
          },
          {
            id: "bank-line-list-pages-without-repeats",
            value: `first=${firstIds.length} second=${secondIds.length} overlap=${overlap}`,
          },
        ],
      };
    }).pipe(Effect.provide(ownerLayer))
  );

const editObservations = () =>
  Effect.runPromise(
    Effect.gen(function* editOneLine() {
      const target = demoBankLines[0];
      const category = demoCategories[0].id;
      const edited = yield* editBankLine.handler(
        editRequest({
          category: CategoryChangeSchema.cases.Assigned.make({
            categoryId: category,
          }),
          lineId: target.id,
          note: NoteChangeSchema.cases.Set.make({ text: writtenNote }),
        })
      );
      const storedAfterEdit = yield* listBankLines.handler(request({}));
      const unknownLine = yield* editBankLine
        .handler(
          editRequest({
            category: CategoryChangeSchema.cases.Unchanged.make({}),
            lineId: missingLine,
            note: NoteChangeSchema.cases.Unchanged.make({}),
          })
        )
        .pipe(Effect.result);
      const storedAfterUnknownLine = yield* listBankLines.handler(request({}));
      const unknownCategory = yield* editBankLine
        .handler(
          editRequest({
            category: CategoryChangeSchema.cases.Assigned.make({
              categoryId: foreignCategory,
            }),
            lineId: target.id,
            note: NoteChangeSchema.cases.Unchanged.make({}),
          })
        )
        .pipe(Effect.result);
      const storedAfterForeignCategory = yield* listBankLines.handler(
        request({})
      );

      return {
        observations: [
          {
            id: "bank-line-edit-sets-category-and-note",
            value: `category=${Option.isSome(edited.category) ? edited.category.value : "none"} note=${edited.note}`,
          },
          {
            id: "bank-line-edit-stores-category-and-note",
            operation: "listBankLines",
            value: canonicalRecords(storedAfterEdit.lines),
          },
          {
            id: "bank-line-edit-unknown-line-stores-nothing",
            operation: "listBankLines",
            value: canonicalRecords(storedAfterUnknownLine.lines),
          },
          {
            id: "bank-line-edit-foreign-category-stores-nothing",
            operation: "listBankLines",
            value: canonicalRecords(storedAfterForeignCategory.lines),
          },
          {
            id: "bank-line-edit-keeps-the-line-in-its-profile",
            value: `lineId=${edited.id} profileId=${edited.profileId}`,
          },
          {
            id: "bank-line-edit-refuses-an-unknown-line",
            value: failureTag(unknownLine),
          },
          {
            id: "bank-line-edit-refuses-a-foreign-category",
            value: failureTag(unknownCategory),
          },
        ],
      };
    }).pipe(Effect.provide(ownerLayer))
  );

const reviewObservations = async () => {
  const target = demoBankLines.find((line) => line.review._tag === "Awaiting");

  if (target === undefined) {
    fence("The demo book has no line awaiting review to drive");
  }

  const reviewed = await Effect.runPromise(
    Effect.provideService(
      Effect.gen(function* reviewOneLine() {
        const marked = yield* reviewBankLine.handler(
          reviewRequest({ lineId: target.id })
        );
        const storedAfterReview = yield* listBankLines.handler(request({}));
        const viewer = yield* reviewBankLine
          .handler(reviewRequest({ lineId: target.id }))
          .pipe(
            Effect.provideService(CurrentPerson, viewerPerson),
            Effect.result
          );
        const storedAfterViewer = yield* listBankLines.handler(request({}));

        return {
          at:
            marked.review._tag === "Reviewed" &&
            typeof marked.review.at === "number",
          lineId: marked.id,
          storedAfterReview: canonicalRecords(storedAfterReview.lines),
          storedAfterViewer: canonicalRecords(storedAfterViewer.lines),
          tag: marked.review._tag,
          viewer: failureTag(viewer),
        };
      }),
      Clock.Clock,
      fixedClock
    ).pipe(Effect.provide(ownerLayer))
  );

  return {
    observations: [
      {
        id: "bank-line-review-marks-the-line",
        value: `tag=${reviewed.tag} hasTime=${reviewed.at}`,
      },
      {
        id: "bank-line-review-shows-in-the-list",
        operation: "listBankLines",
        value: reviewed.storedAfterReview,
      },
      {
        id: "bank-line-review-viewer-stores-nothing",
        operation: "listBankLines",
        value: reviewed.storedAfterViewer,
      },
      { id: "bank-line-review-refuses-a-viewer", value: reviewed.viewer },
    ],
  };
};

const observations = await {
  edit: editObservations,
  list: listObservations,
  review: reviewObservations,
}[capability]();

process.stdout.write(
  `${JSON.stringify({ ...observations, mutatingCalls: recorder.total() }, null, 2)}\n`
);
