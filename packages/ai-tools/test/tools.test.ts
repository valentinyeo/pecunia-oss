import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Predicate, Schema } from "effect";
import { TestClock } from "effect/testing";

import { AuditLog, AuditOutcomeSchema } from "../src/audit.js";
import type { AuditEntry } from "../src/audit.js";
import { ToolCatalog, toolNamed } from "../src/catalog.js";
import { TOOL_NAMES } from "../src/contracts.js";
import { dispatchTool } from "../src/dispatch.js";
import type { ToolCall } from "../src/dispatch.js";
import {
  GetLineOutputSchema,
  ListCategoriesOutputSchema,
  ListLinesOutputSchema,
  ListReportsOutputSchema,
  SuggestCategoryOutputSchema,
} from "../src/model.js";
import {
  categoryA,
  categoryB,
  lineA,
  lineB,
  profileA,
  profileB,
  reportA,
  worldLayer,
} from "./fixtures.js";

const successOutput = <
  S extends Schema.Top & { readonly DecodingServices: never },
>(
  schema: S,
  call: ToolCall
): S["Type"] => {
  if (!Predicate.isTagged(call.outcome, "Ok")) {
    throw new Error(`The call was refused: ${call.outcome.message}`);
  }

  return Schema.decodeUnknownSync(schema)(call.outcome.output);
};

const refusedOutcome = (call: ToolCall) => {
  if (!Predicate.isTagged(call.outcome, "Refused")) {
    throw new Error("The call was not refused");
  }

  return call.outcome;
};

const refusedReason = (call: ToolCall): string => refusedOutcome(call).reason;

const refusedField = (call: ToolCall): string | undefined =>
  refusedOutcome(call).field;

const refusedMessage = (call: ToolCall): string => refusedOutcome(call).message;

const isOk = (call: ToolCall): boolean =>
  Predicate.isTagged(call.outcome, "Ok");

const auditedOutputSize = (entry: AuditEntry | undefined): number => {
  if (entry === undefined) {
    return -1;
  }

  return Predicate.isTagged(entry.outcome, "Ok")
    ? entry.outcome.outputSize
    : -1;
};

const asOwner = Effect.provide(worldLayer("ownerA", profileA));

const asViewer = Effect.provide(worldLayer("viewerA", profileA));

const asStranger = Effect.provide(worldLayer("stranger", profileA));

const callFor = (tool: string, input: Schema.Json) =>
  dispatchTool({ input, tool });

const decodeLines = (call: ToolCall) =>
  successOutput(ListLinesOutputSchema, call);

const decodeLine = (call: ToolCall) => successOutput(GetLineOutputSchema, call);

const decodeSuggestion = (call: ToolCall) =>
  successOutput(SuggestCategoryOutputSchema, call);

const decodeCategories = (call: ToolCall) =>
  successOutput(ListCategoriesOutputSchema, call);

const decodeReports = (call: ToolCall) =>
  successOutput(ListReportsOutputSchema, call);

const auditOf = Effect.gen(function* readEntries() {
  const audit = yield* AuditLog;

  return yield* audit.entries();
});

describe("the catalog", () => {
  it("holds exactly the six tools the ticket names", () => {
    expect(ToolCatalog.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);
  });

  it("holds no tool that runs SQL or a free-form query", () => {
    for (const tool of ToolCatalog) {
      expect(tool.name).not.toMatch(/sql|query|exec|script|raw/iu);
      expect(Object.keys(tool.input.fields).toSorted()).not.toContain("sql");
      expect(Object.keys(tool.input.fields).toSorted()).not.toContain("query");
    }
  });

  it("accepts input only through the named fields of each tool", () => {
    const allowed = new Set([
      "categoryId",
      "cursor",
      "from",
      "limit",
      "lineId",
      "text",
      "to",
    ]);

    for (const tool of ToolCatalog) {
      const fields = Object.keys(tool.input.fields);

      expect(fields.length).toBeGreaterThan(0);

      for (const field of fields) {
        expect(allowed.has(field), `${tool.name} takes ${field}`).toBe(true);
      }
    }
  });

  it("marks reads read and writes write", () => {
    expect(ToolCatalog.map((tool) => [tool.name, tool.access])).toEqual([
      ["list_categories", "read"],
      ["list_lines", "read"],
      ["get_line", "read"],
      ["suggest_category", "write"],
      ["confirm_category", "write"],
      ["list_reports", "read"],
    ]);
  });

  it("finds a tool by name and nothing else", () => {
    expect(toolNamed(ToolCatalog, "get_line").pipe((found) => found._tag)).toBe(
      "Some"
    );

    expect(toolNamed(ToolCatalog, "getLines").pipe((found) => found._tag)).toBe(
      "None"
    );
  });
});

describe("reading the acting profile", () => {
  it.effect("lists only the acting profile's categories by name", () =>
    Effect.gen(function* listCategories() {
      const call = yield* callFor("list_categories", { limit: 200 });

      const output = decodeCategories(call);

      expect(output.categories.map((category) => category.name)).toEqual([
        "Groceries",
        "Travel",
      ]);

      expect(
        output.categories.every((category) => category.profileId === profileA)
      ).toBe(true);
    }).pipe(asOwner)
  );

  it.effect("refuses a limit outside one to two hundred by field name", () =>
    Effect.gen(function* refuseLimit() {
      for (const limit of [0, 201, 10_000, 1.5]) {
        const call = yield* callFor("list_categories", { limit });

        expect(refusedReason(call)).toBe("invalidField");
        expect(refusedField(call)).toBe("limit");
      }
    }).pipe(asOwner)
  );

  it.effect("refuses a missing limit and an invented field", () =>
    Effect.gen(function* refuseInventedFields() {
      const missing = yield* callFor("list_categories", {});

      expect(refusedReason(missing)).toBe("missingField");
      expect(refusedField(missing)).toBe("limit");

      const strange = yield* callFor("list_categories", {
        limit: 10,
        sortBy: "amount",
      });

      expect(refusedReason(strange)).toBe("unknownField");
      expect(refusedField(strange)).toBe("sortBy");
    }).pipe(asOwner)
  );

  it.effect(
    "lists the acting profile's lines newest first with exact amounts",
    () =>
      Effect.gen(function* listLines() {
        const call = yield* callFor("list_lines", { limit: 200 });
        const output = decodeLines(call);

        expect(output.lines.map((line) => line.id)).toEqual([
          lineA.train,
          lineA.rent,
          lineA.invoice,
        ]);

        expect(output.total).toBe(3);
        expect(output.nextCursor).toBeNull();

        for (const line of output.lines) {
          expect(Number.isInteger(line.amount.minor)).toBe(true);
          expect(line.profileId).toBe(profileA);
        }

        expect(output.lines.map((line) => line.amount)).toEqual([
          { currency: "GBP", minor: 899 },
          { currency: "EUR", minor: 12_345 },
          { currency: "EUR", minor: 480_000 },
        ]);
      }).pipe(asOwner)
  );

  it.effect("filters lines by day range, category and text", () =>
    Effect.gen(function* filterLines() {
      const window = decodeLines(
        yield* callFor("list_lines", {
          from: "2024-02-10",
          limit: 200,
          to: "2024-02-20",
        })
      );

      expect(window.lines.map((line) => line.id)).toEqual([
        lineA.rent,
        lineA.invoice,
      ]);

      const travel = decodeLines(
        yield* callFor("list_lines", {
          categoryId: categoryA.travel,
          limit: 200,
        })
      );

      expect(travel.lines.map((line) => line.id)).toEqual([lineA.invoice]);

      const text = decodeLines(
        yield* callFor("list_lines", { limit: 200, text: "demo rail" })
      );

      expect(text.lines.map((line) => line.id)).toEqual([lineA.train]);
    }).pipe(asOwner)
  );

  it.effect("refuses a day range that runs backwards by field name", () =>
    Effect.gen(function* refuseBackwards() {
      const call = yield* callFor("list_lines", {
        from: "2024-03-05",
        limit: 10,
        to: "2024-02-10",
      });

      expect(refusedReason(call)).toBe("invalidField");
      expect(refusedField(call)).toBe("from");
    }).pipe(asOwner)
  );

  it.effect("refuses a day that is not on the calendar", () =>
    Effect.gen(function* refuseFakeDay() {
      const call = yield* callFor("list_lines", {
        from: "2024-02-30",
        limit: 10,
      });

      expect(refusedReason(call)).toBe("invalidField");
      expect(refusedField(call)).toBe("from");
    }).pipe(asOwner)
  );

  it.effect("pages with a cursor that names the same filter", () =>
    Effect.gen(function* pageLines() {
      const first = decodeLines(yield* callFor("list_lines", { limit: 2 }));

      expect(first.lines.map((line) => line.id)).toEqual([
        lineA.train,
        lineA.rent,
      ]);
      expect(first.nextCursor).not.toBeNull();

      const second = decodeLines(
        yield* callFor("list_lines", {
          cursor: first.nextCursor ?? "",
          limit: 2,
        })
      );

      expect(second.lines.map((line) => line.id)).toEqual([lineA.invoice]);
      expect(second.nextCursor).toBeNull();
    }).pipe(asOwner)
  );

  it.effect("refuses a cursor made under another filter by field name", () =>
    Effect.gen(function* refuseCursor() {
      const first = decodeLines(yield* callFor("list_lines", { limit: 1 }));

      const moved = yield* callFor("list_lines", {
        cursor: first.nextCursor ?? "",
        limit: 1,
        text: "different",
      });

      expect(refusedReason(moved)).toBe("invalidField");
      expect(refusedField(moved)).toBe("cursor");

      const broken = yield* callFor("list_lines", {
        cursor: "not a cursor",
        limit: 1,
      });

      expect(refusedReason(broken)).toBe("invalidField");
      expect(refusedField(broken)).toBe("cursor");
    }).pipe(asOwner)
  );

  it.effect("reads one line and refuses another profile's line", () =>
    Effect.gen(function* readOneLine() {
      const found = decodeLine(
        yield* callFor("get_line", { lineId: lineA.invoice })
      );

      expect(found.line.amount).toEqual({ currency: "EUR", minor: 480_000 });

      const foreign = yield* callFor("get_line", { lineId: lineB.sofa });

      expect(refusedReason(foreign)).toBe("notFound");
      expect(refusedField(foreign)).toBe("lineId");
    }).pipe(asOwner)
  );

  it.effect("lists report summaries without their html", () =>
    Effect.gen(function* listReports() {
      const call = yield* callFor("list_reports", { limit: 200 });

      const output = decodeReports(call);

      expect(output.reports.map((report) => report.id)).toEqual([
        reportA.exploration,
        reportA.monthly,
      ]);

      expect(Object.keys(output.reports[0] ?? {})).not.toContain("html");
    }).pipe(asOwner)
  );
});

describe("suggesting and confirming a category", () => {
  it.effect("suggests without confirming", () =>
    Effect.gen(function* suggestOnly() {
      const suggestion = decodeSuggestion(
        yield* callFor("suggest_category", {
          categoryId: categoryA.groceries,
          lineId: lineA.rent,
        })
      );

      expect(suggestion.suggestion.lineId).toBe(lineA.rent);
      expect(suggestion.suggestion.categoryId).toBe(categoryA.groceries);

      const line = decodeLine(
        yield* callFor("get_line", { lineId: lineA.rent })
      );

      expect(Option.isNone(line.line.category)).toBe(true);
    }).pipe(asOwner)
  );

  it.effect("refuses to suggest onto a confirmed line", () =>
    Effect.gen(function* refuseConfirmed() {
      const confirmed = yield* callFor("confirm_category", {
        categoryId: categoryA.travel,
        lineId: lineA.rent,
      });

      expect(isOk(confirmed)).toBe(true);

      const refused = yield* callFor("suggest_category", {
        categoryId: categoryA.groceries,
        lineId: lineA.rent,
      });

      expect(refusedReason(refused)).toBe("alreadyConfirmed");
      expect(refusedField(refused)).toBe("lineId");
    }).pipe(asOwner)
  );

  it.effect("confirms a category as the person's own decision", () =>
    Effect.gen(function* confirmCategory() {
      const call = yield* callFor("confirm_category", {
        categoryId: categoryA.travel,
        lineId: lineA.rent,
      });

      const line = decodeLine(call);

      expect(Option.getOrNull(line.line.category)).toBe(categoryA.travel);
    }).pipe(asOwner)
  );

  it.effect("refuses an unknown category and another profile's category", () =>
    Effect.gen(function* refuseCategory() {
      const unknown = yield* callFor("confirm_category", {
        categoryId: "0192f0c1-9fff-7a2b-8c4d-5e6f70819299",
        lineId: lineA.rent,
      });

      expect(refusedReason(unknown)).toBe("notFound");
      expect(refusedField(unknown)).toBe("categoryId");

      const foreign = yield* callFor("confirm_category", {
        categoryId: categoryB.home,
        lineId: lineA.rent,
      });

      expect(refusedReason(foreign)).toBe("notFound");
      expect(refusedField(foreign)).toBe("categoryId");
    }).pipe(asOwner)
  );

  it.effect("refuses an injected profile id instead of reading it", () =>
    Effect.gen(function* refuseProfile() {
      const injected = yield* callFor("list_lines", {
        limit: 10,
        profileId: profileB,
      });

      expect(refusedReason(injected)).toBe("unknownField");
      expect(refusedField(injected)).toBe("profileId");

      const snake = yield* callFor("confirm_category", {
        categoryId: categoryB.home,
        lineId: lineB.sofa,
        profile_id: profileB,
      });

      expect(refusedReason(snake)).toBe("unknownField");
      expect(refusedField(snake)).toBe("profile_id");
    }).pipe(asOwner)
  );
});

describe("who may call", () => {
  it.effect("lets a viewer read the profile", () =>
    Effect.gen(function* viewerReads() {
      const call = yield* callFor("list_lines", { limit: 5 });

      expect(isOk(call)).toBe(true);
    }).pipe(asViewer)
  );

  it.effect("refuses a viewer's write and changes nothing", () =>
    Effect.gen(function* viewerWrites() {
      const before = yield* auditOf;

      const call = yield* callFor("confirm_category", {
        categoryId: categoryA.travel,
        lineId: lineA.rent,
      });

      expect(refusedReason(call)).toBe("notPermitted");

      const line = yield* callFor("get_line", { lineId: lineA.rent });

      expect(Option.isNone(decodeLine(line).line.category)).toBe(true);

      const after = yield* auditOf;

      expect(after.length).toBe(before.length + 2);
    }).pipe(asViewer)
  );

  it.effect("refuses a stranger on every tool", () =>
    Effect.gen(function* strangerCalls() {
      for (const tool of TOOL_NAMES) {
        const call = yield* callFor(tool, { limit: 10 });

        expect(refusedReason(call)).toBe("notPermitted");
      }
    }).pipe(asStranger)
  );
});

describe("the audit log", () => {
  it.effect("records one entry per call, with sizes but no contents", () =>
    Effect.gen(function* auditOneEntry() {
      const tool = "list_lines";

      const call = yield* callFor(tool, { limit: 1, text: "rent" });

      const entries = yield* auditOf;

      expect(entries.length).toBe(1);

      const [entry] = entries;

      expect(entry?.tool).toBe(tool);
      expect(entry?.profileId).toBe(profileA);
      expect(entry?.access).toBe("write");
      expect(auditedOutputSize(entry)).toBeGreaterThan(0);
      expect(entry?.inputSize).toBeGreaterThan(0);
      expect(
        entry === undefined ? false : Predicate.isTagged(entry.outcome, "Ok"),
        "an accepted call is audited as Ok"
      ).toBe(true);

      const stored = JSON.stringify(entry);

      expect(stored).not.toContain("rent");
      expect(stored).not.toContain(lineA.rent);
      expect(isOk(call)).toBe(true);
    }).pipe(asOwner)
  );

  it.effect("records a refused call with its reason", () =>
    Effect.gen(function* auditRefusal() {
      yield* callFor("run_sql", { query: "select * from transactions" });

      const entries = yield* auditOf;

      expect(entries.length).toBe(1);
      const [entry] = entries;

      expect(entry?.tool).toBe("run_sql");
      expect(entry?.outcome).toEqual(
        AuditOutcomeSchema.cases.Refused.make({ reason: "unknownTool" })
      );
    }).pipe(asOwner)
  );

  it.effect("records a viewer's refused write with the caller's access", () =>
    Effect.gen(function* auditViewer() {
      yield* callFor("suggest_category", {
        categoryId: categoryA.groceries,
        lineId: lineA.rent,
      });

      const entries = yield* auditOf;

      const [entry] = entries;

      expect(entry?.access).toBe("read");
      expect(entry?.outcome).toEqual(
        AuditOutcomeSchema.cases.Refused.make({ reason: "notPermitted" })
      );
    }).pipe(asViewer)
  );

  it.effect("takes its timestamp from the injected clock", () =>
    Effect.gen(function* clockedAudit() {
      yield* TestClock.setTime(1_700_000_000_000);
      yield* callFor("list_categories", { limit: 5 });

      yield* TestClock.setTime(1_700_000_060_000);
      yield* callFor("list_categories", { limit: 5 });

      const entries = yield* auditOf;

      expect(entries.map((entry) => entry.atMillis)).toEqual([
        1_700_000_000_000, 1_700_000_060_000,
      ]);
    }).pipe(asOwner)
  );
});

describe("the boundary", () => {
  it.effect("refuses an unknown tool by name", () =>
    Effect.gen(function* unknownTool() {
      const call = yield* callFor("get_lines", { limit: 1 });

      expect(refusedReason(call)).toBe("unknownTool");
      expect(refusedMessage(call)).toContain("list_lines");
    }).pipe(asOwner)
  );

  it.effect("refuses a wrong field type by field name", () =>
    Effect.gen(function* wrongType() {
      const call = yield* callFor("get_line", { lineId: 7 });

      expect(refusedReason(call)).toBe("invalidField");
      expect(refusedField(call)).toBe("lineId");
    }).pipe(asOwner)
  );

  it("keeps the person's identity out of the tool input", () => {
    for (const tool of ToolCatalog) {
      expect(Object.keys(tool.input.fields)).not.toContain("person");
      expect(Object.keys(tool.input.fields)).not.toContain("email");
    }
  });
});
