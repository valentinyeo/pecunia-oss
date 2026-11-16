import { Match, Option, Predicate } from "effect";

import { ReviewSchema } from "./model.js";
import type {
  BankLine,
  CategoryChange,
  LinePatch,
  NoteChange,
  ReviewChange,
} from "./model.js";

const applyCategory = (line: BankLine, change: CategoryChange): BankLine =>
  Match.value(change).pipe(
    Match.tag("Unchanged", () => line),
    Match.tag("Cleared", () => ({ ...line, category: Option.none() })),
    Match.tag("Assigned", ({ categoryId }) => ({
      ...line,
      category: Option.some(categoryId),
    })),
    Match.exhaustive
  );

const applyNote = (line: BankLine, change: NoteChange): BankLine =>
  Match.value(change).pipe(
    Match.tag("Unchanged", () => line),
    Match.tag("Set", ({ text }) => ({ ...line, note: text.trim() })),
    Match.exhaustive
  );

const applyReview = (line: BankLine, change: ReviewChange): BankLine =>
  Match.value(change).pipe(
    Match.tag("Unchanged", () => line),
    Match.tag("Mark", ({ at }) =>
      Predicate.isTagged(line.review, "Reviewed")
        ? line
        : { ...line, review: ReviewSchema.cases.Reviewed.make({ at }) }
    ),
    Match.exhaustive
  );

export const applyLinePatch = (line: BankLine, patch: LinePatch): BankLine =>
  applyReview(
    applyNote(applyCategory(line, patch.category), patch.note),
    patch.review
  );
