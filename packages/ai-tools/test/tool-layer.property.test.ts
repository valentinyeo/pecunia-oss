import { expect, it } from "@effect/vitest";
import type { AccessNeed, ProfileId } from "@pecunia/access";
import type { BankLineStoreError } from "@pecunia/bank-lines";
import { Effect, Option, Predicate, Schema } from "effect";

import { AuditOutcomeSchema } from "../src/audit.js";
import type { AuditEntry } from "../src/audit.js";
import { ToolCatalog, toolNamed } from "../src/catalog.js";
import { TOOL_NAMES } from "../src/contracts.js";
import type { ToolName } from "../src/contracts.js";
import { dispatchTool } from "../src/dispatch.js";
import type { ToolCall } from "../src/dispatch.js";
import { SuggestCategoryOutputSchema } from "../src/model.js";
import {
  auditEntries,
  categoryA,
  categoryB,
  identifiersOf,
  lineA,
  lineB,
  linesState,
  otherProfile,
  personOf,
  profileA,
  profileB,
  profileIds,
  profileState,
  worldLayer,
} from "./fixtures.js";
import type { Persona } from "./fixtures.js";

const SEED = 2_024_021;

const CASES = 700;

const MODULUS = 4_294_967_296;

interface Random {
  readonly next: () => number;
}

const seeded = (seed: number): Random => {
  let state = seed % MODULUS;

  return {
    next: () => {
      state = (state * 1_664_525 + 1_013_904_223) % MODULUS;

      return state / MODULUS;
    },
  };
};

const pick = <A>(random: Random, values: readonly A[]): A => {
  const chosen = values[Math.floor(random.next() * values.length)];

  if (chosen === undefined) {
    throw new Error("The seeded pool is empty");
  }

  return chosen;
};

const personas: readonly Persona[] = [
  "ownerA",
  "ownerB",
  "stranger",
  "viewerA",
];

const days = [
  "2024-02-10",
  "2024-02-20",
  "2024-03-05",
  "2024-13-01",
  "2023-02-29",
  "1970-01-01",
  "1969-12-31",
] as const;

const texts = [
  "example",
  "demo",
  "",
  "   ",
  "x".repeat(200),
  "a".repeat(201),
] as const;

const lineIds = [
  lineA.invoice,
  lineA.rent,
  lineA.train,
  lineB.sofa,
  lineB.wages,
  "0192f0c1-9fff-7a2b-8c4d-5e6f70819299",
] as const;

const categoryIds = [
  categoryA.groceries,
  categoryA.travel,
  categoryB.home,
  categoryB.salary,
  "0192f0c1-9fff-7a2b-8c4d-5e6f70819298",
] as const;

const unknownToolNames = [
  "run_sql",
  "query",
  "",
  "list_lines; drop table lines",
  "getLines",
  "x".repeat(80),
] as const;

const extraFields = [
  "profileId",
  "profile_id",
  "sql",
  "query",
  "as",
  "limit2",
] as const;

const extraValues = [profileB, "select * from transactions", 5, null] as const;

const limits = [0, 201, "50", 1.5, 1_000_000, null, -1] as const;

const badLineIds = [7, null, "", "x".repeat(80)] as const;

const badDays = [42, "2024-02-30", null, ""] as const;

const badCategories = [profileB, 7, null] as const;

const generatedInputs = [null, 7, "lines", [], [1, 2], true] as const;

interface Generated {
  readonly actingProfileId: ProfileId;
  readonly input: Schema.Json;
  readonly persona: Persona;
  readonly tool: string;
}

interface LinesInput extends Schema.JsonObject {
  categoryId?: string;
  cursor?: string;
  from?: string;
  limit: number;
  text?: string;
  to?: string;
}

const validLinesInput = (random: Random): LinesInput => {
  const input: LinesInput = { limit: 1 + Math.floor(random.next() * 200) };

  if (random.next() < 0.6) {
    input.from = pick(random, days);
  }

  if (random.next() < 0.6) {
    input.to = pick(random, days);
  }

  if (random.next() < 0.5) {
    input.categoryId = pick(random, categoryIds);
  }

  if (random.next() < 0.5) {
    input.text = pick(random, texts);
  }

  if (random.next() < 0.2) {
    input.cursor = "not a cursor";
  }

  return input;
};

const validInput = (random: Random, tool: ToolName) => {
  if (tool === "list_lines") {
    return validLinesInput(random);
  }

  if (tool === "get_line") {
    return { lineId: pick(random, lineIds) };
  }

  if (tool === "suggest_category" || tool === "confirm_category") {
    return {
      categoryId: pick(random, categoryIds),
      lineId: pick(random, lineIds),
    };
  }

  return { limit: 1 + Math.floor(random.next() * 200) };
};

const mutated = (
  random: Random,
  input: ReturnType<typeof validInput>
): Schema.Json => {
  const roll = random.next();

  if (roll < 0.55) {
    return input;
  }

  const variant = 1 + (Math.floor(roll * 100) % 5);

  if (variant === 1) {
    return { ...input, [pick(random, extraFields)]: pick(random, extraValues) };
  }

  if (variant === 2) {
    return { ...input, limit: pick(random, limits) };
  }

  if (variant === 3) {
    return { ...input, lineId: pick(random, badLineIds) };
  }

  if (variant === 4) {
    return { ...input, from: pick(random, badDays) };
  }

  return { ...input, categoryId: pick(random, badCategories) };
};

const generatedInput = (random: Random, tool: string): Schema.Json => {
  const roll = random.next();

  if (roll < 0.08) {
    return pick(random, generatedInputs);
  }

  if (roll < 0.16) {
    return {};
  }

  const named = TOOL_NAMES.find((name) => name === tool) ?? "list_lines";

  return mutated(random, validInput(random, named));
};

const generate = (random: Random): Generated => {
  if (random.next() < 0.2) {
    return {
      actingProfileId: profileA,
      input: {
        categoryId: pick(random, [
          categoryA.groceries,
          categoryA.travel,
          categoryB.home,
        ]),
        lineId: pick(random, [lineA.invoice, lineA.rent, lineA.train]),
      },
      persona: "ownerA",
      tool: "suggest_category",
    };
  }

  const persona = pick(random, personas);

  const actingProfileId = pick(random, profileIds);

  const tool =
    random.next() < 0.8
      ? pick(random, TOOL_NAMES)
      : pick(random, unknownToolNames);

  return {
    actingProfileId,
    input: generatedInput(random, tool),
    persona,
    tool,
  };
};

const grantOf = (persona: Persona, acting: ProfileId): AccessNeed | null => {
  const membership = personOf(persona).memberships.find(
    (candidate) => candidate.profileId === acting
  );

  if (membership === undefined) {
    return null;
  }

  return membership.role === "owner" ? "write" : "read";
};

interface Observed {
  readonly actingAfter: string;
  readonly actingBefore: string;
  readonly actingLinesAfter: string;
  readonly actingLinesBefore: string;
  readonly auditsAfter: readonly AuditEntry[];
  readonly auditsBefore: readonly AuditEntry[];
  readonly call: ToolCall;
  readonly otherAfter: string;
  readonly otherBefore: string;
}

const observe = (
  generated: Generated
): Effect.Effect<Observed, BankLineStoreError> =>
  Effect.gen(function* observeOneCall() {
    const other = otherProfile(generated.actingProfileId);

    const actingBefore = yield* profileState(generated.actingProfileId);
    const actingLinesBefore = yield* linesState(generated.actingProfileId);
    const otherBefore = yield* profileState(other);
    const auditsBefore = yield* auditEntries;

    const call = yield* dispatchTool({
      input: generated.input,
      tool: generated.tool,
    });

    const actingAfter = yield* profileState(generated.actingProfileId);
    const actingLinesAfter = yield* linesState(generated.actingProfileId);
    const otherAfter = yield* profileState(other);
    const auditsAfter = yield* auditEntries;

    return {
      actingAfter,
      actingLinesAfter,
      actingLinesBefore,
      actingBefore,
      auditsAfter,
      auditsBefore,
      call,
      otherAfter,
      otherBefore,
    };
  }).pipe(
    Effect.provide(worldLayer(generated.persona, generated.actingProfileId))
  );

const callTagOf = (call: ToolCall): "Ok" | "Refused" =>
  Predicate.isTagged(call.outcome, "Ok") ? "Ok" : "Refused";

const refusalOf = (call: ToolCall) => {
  if (!Predicate.isTagged(call.outcome, "Refused")) {
    throw new Error("The call was not refused");
  }

  return call.outcome;
};

const auditTagOf = (
  entry: AuditEntry | undefined
): "Ok" | "Refused" | "missing" => {
  if (entry === undefined) {
    return "missing";
  }

  return Predicate.isTagged(entry.outcome, "Ok") ? "Ok" : "Refused";
};

const mentionedIn = (text: string, ids: readonly string[]): readonly string[] =>
  ids.filter((id) => text.includes(id));

const suggestionOf = (call: ToolCall) => {
  if (!Predicate.isTagged(call.outcome, "Ok")) {
    throw new Error("The suggestion call was refused");
  }

  return Schema.decodeUnknownSync(SuggestCategoryOutputSchema)(
    call.outcome.output
  );
};

const checkAudit = (
  observed: Observed,
  generated: Generated,
  grant: AccessNeed | null,
  label: string
) => {
  expect(
    observed.auditsAfter.length,
    `${label}: one audit entry per call`
  ).toBe(observed.auditsBefore.length + 1);

  const entry = observed.auditsAfter.at(-1);

  expect(entry?.tool, `${label}: audit names the tool`).toBe(
    generated.tool.slice(0, 64)
  );

  expect(entry?.profileId, `${label}: audit names the acting profile`).toBe(
    generated.actingProfileId
  );

  expect(entry?.access, `${label}: audit names the caller's access`).toBe(
    grant
  );

  expect(auditTagOf(entry), `${label}: audit names the outcome`).toBe(
    callTagOf(observed.call)
  );

  if (callTagOf(observed.call) === "Refused") {
    expect(entry?.outcome, `${label}: audit names the reason`).toEqual(
      AuditOutcomeSchema.cases.Refused.make({
        reason: refusalOf(observed.call).reason,
      })
    );
  }
};

const checkAccess = (
  observed: Observed,
  generated: Generated,
  grant: AccessNeed | null,
  label: string
) => {
  if (grant === null) {
    expect(
      callTagOf(observed.call),
      `${label}: a person outside the profile gets nothing`
    ).toBe("Refused");
  }

  if (grant !== "write") {
    expect(
      observed.actingBefore,
      `${label}: a read-only caller changes no state`
    ).toBe(observed.actingAfter);
  }

  if (callTagOf(observed.call) === "Refused") {
    expect(
      observed.actingBefore,
      `${label}: a refused call changes no state`
    ).toBe(observed.actingAfter);

    expect(
      observed.actingLinesBefore,
      `${label}: a refused call moves no line's category`
    ).toBe(observed.actingLinesAfter);
  }

  const known = toolNamed(ToolCatalog, generated.tool);

  if (
    Option.isSome(known) &&
    known.value.access === "write" &&
    grant !== "write"
  ) {
    expect(
      callTagOf(observed.call),
      `${label}: a write tool never runs for a read-only caller`
    ).toBe("Refused");

    expect(refusalOf(observed.call).reason, `${label}: notPermitted`).toBe(
      "notPermitted"
    );
  }
};

const checkScope = (
  observed: Observed,
  generated: Generated,
  label: string
) => {
  const otherIds = identifiersOf(otherProfile(generated.actingProfileId));

  expect(observed.otherBefore, `${label}: no other profile is written`).toBe(
    observed.otherAfter
  );

  if (callTagOf(observed.call) === "Ok") {
    expect(
      mentionedIn(JSON.stringify(observed.call), otherIds),
      `${label}: a successful call reads only the acting profile`
    ).toEqual([]);

    return;
  }

  const sent = JSON.stringify(generated.input);

  expect(
    mentionedIn(JSON.stringify(observed.call), otherIds).filter(
      (id) => !sent.includes(id)
    ),
    `${label}: a refusal echoes no id the caller did not send`
  ).toEqual([]);
};

const checkSuggestion = (observed: Observed, label: string): boolean => {
  if (callTagOf(observed.call) !== "Ok") {
    return false;
  }

  const suggestion = suggestionOf(observed.call);

  expect(
    observed.actingLinesBefore,
    `${label}: a suggestion changes no line's category`
  ).toBe(observed.actingLinesAfter);

  expect(
    suggestion.suggestion.categoryId,
    `${label}: a suggestion carries the category it was given`
  ).toBeTypeOf("string");

  return true;
};

it.effect(
  "keeps the tool layer safe over generated names, inputs, roles and profiles",
  () =>
    Effect.gen(function* runProperty() {
      const random = seeded(SEED);

      let readOnlyCases = 0;
      let writeCases = 0;
      let refusedCases = 0;
      let okCases = 0;
      let suggestCases = 0;

      for (let index = 0; index < CASES; index += 1) {
        const generated = generate(random);

        const grant = grantOf(generated.persona, generated.actingProfileId);

        const label = `case ${index}: ${generated.persona} on ${generated.actingProfileId} calling ${generated.tool.slice(0, 40)}`;

        const observed = yield* observe(generated);

        checkAudit(observed, generated, grant, label);
        checkAccess(observed, generated, grant, label);
        checkScope(observed, generated, label);

        if (
          generated.tool === "suggest_category" &&
          checkSuggestion(observed, label)
        ) {
          suggestCases += 1;
        }

        writeCases += grant === "write" ? 1 : 0;
        readOnlyCases += grant === "write" ? 0 : 1;
        okCases += callTagOf(observed.call) === "Ok" ? 1 : 0;
        refusedCases += callTagOf(observed.call) === "Refused" ? 1 : 0;
      }

      expect(readOnlyCases, "read-only callers were exercised").toBeGreaterThan(
        200
      );
      expect(writeCases, "writing callers were exercised").toBeGreaterThan(100);
      expect(okCases, "successful calls were exercised").toBeGreaterThan(40);
      expect(refusedCases, "refusals were exercised").toBeGreaterThan(300);
      expect(
        suggestCases,
        "confirmed suggestions were justified"
      ).toBeGreaterThan(20);
    })
);
