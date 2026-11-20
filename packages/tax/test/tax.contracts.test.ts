import { expect, it } from "@effect/vitest";
import { toRpcGroup, toToolkit } from "@pecunia/capability";
import { codecs, parse } from "@pecunia/core/model";
import type { TaxObligation } from "@pecunia/core/model";
import { Result, Schema } from "effect";

import { taxDueCapabilities } from "../src/capabilities.js";
import {
  listTaxDuesContract,
  syncTaxDuesContract,
  taxDueContracts,
} from "../src/contracts.js";
import { dueKey } from "../src/dues.js";
import { freeAgentTaxBooks, parseFreeAgentDues } from "../src/freeagent.js";
import {
  DateOnlySchema,
  ListTaxDuesRequestSchema,
  SyncTaxDuesRequestSchema,
  TaxDuesSchema,
  TimestampSchema,
} from "../src/model.js";
import type { DueDeclaration } from "../src/model.js";
import type { DueRejection } from "../src/tax-due-rejected.js";
import { estimatedStatus } from "./support.js";

const profileId = parse(
  codecs.profileId,
  "0192f0c1-0001-702d-8484-48490b729601"
);

const taxProfileId = parse(
  codecs.taxProfileId,
  "0192f0c1-0040-75c4-8a37-7c0d1c2b6f10"
);

const request = { profileId };

const syncRequest = { profileId, taxProfileId };

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a wire payload is untrusted by definition; the request schema decodes it here.
const decodeList = (input: unknown) =>
  Schema.decodeUnknownResult(ListTaxDuesRequestSchema)(input);

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a wire payload is untrusted by definition; the request schema decodes it here.
const decodeSync = (input: unknown) =>
  Schema.decodeUnknownResult(SyncTaxDuesRequestSchema)(input);

it("parses the list request at the wire boundary", () => {
  const parsed = decodeList(request);

  expect(Result.isSuccess(parsed)).toBe(true);

  const trimmed = decodeList({ ...request, cursor: "next" });

  expect(Result.isSuccess(trimmed)).toBe(true);

  if (Result.isSuccess(trimmed)) {
    expect(trimmed.success).toEqual(request);
  }

  expect(Result.isFailure(decodeList({ profileId: "demo-profile" }))).toBe(
    true
  );

  expect(Result.isFailure(decodeList({ profileId: 12 }))).toBe(true);
});

it("parses the sync request at the wire boundary", () => {
  const parsed = decodeSync(syncRequest);

  expect(Result.isSuccess(parsed)).toBe(true);

  expect(Result.isFailure(decodeSync({ profileId }))).toBe(true);

  expect(
    Result.isFailure(decodeSync({ ...syncRequest, taxProfileId: "gb" }))
  ).toBe(true);
});

it("projects both contracts onto one RPC group", () => {
  const { group } = toRpcGroup(taxDueContracts);

  expect([...group.requests.keys()]).toEqual(["listTaxDues", "syncTaxDues"]);

  expect(
    taxDueCapabilities.map((capability) => capability.contract.name)
  ).toEqual([...group.requests.keys()]);
});

it("marks the read read-only and keeps both capabilities unapproved", () => {
  expect(listTaxDuesContract.annotations.readOnly).toBe(true);
  expect(syncTaxDuesContract.annotations.readOnly).toBe(false);
  expect(listTaxDuesContract.annotations.idempotent).toBe(true);
  expect(syncTaxDuesContract.annotations.idempotent).toBe(true);
  expect(taxDueContracts.every((contract) => !contract.needsApproval)).toBe(
    true
  );
});

it("exposes the Self Assessment due list as one assistant tool", () => {
  const { toolkit } = toToolkit(taxDueCapabilities);

  expect(Object.keys(toolkit.tools)).toEqual(["listTaxDues", "syncTaxDues"]);

  expect(toolkit.tools.listTaxDues.description).toContain(
    "Self Assessment payments due"
  );
});

it("refuses a FreeAgent answer with no payments list by name", () => {
  const parsed = parseFreeAgentDues({ bills: [] });

  expect(Result.isFailure(parsed)).toBe(true);

  if (Result.isFailure(parsed)) {
    expect(parsed.failure.rejections).toEqual([
      {
        field: "self_assessment_payments",
        index: null,
        reason: "PaymentsMissing",
      },
    ]);
  }
});

it("names FreeAgent as the first books tool", () => {
  expect(freeAgentTaxBooks({ self_assessment_payments: [] }).booksTool).toBe(
    "freeagent"
  );
});

interface RawPayment {
  readonly amount_due: string;
  readonly currency: string;
  readonly due_on: string;
  readonly period_ends_on: string;
  readonly status: string;
}

const payment = (overrides: Partial<RawPayment>): RawPayment => ({
  amount_due: "10.00",
  currency: "GBP",
  due_on: "2026-01-31",
  period_ends_on: "2020-01-31",
  status: "unpaid",
  ...overrides,
});

const rejectionsOf = (entry: RawPayment): readonly DueRejection[] => {
  const parsed = parseFreeAgentDues({
    self_assessment_payments: [entry],
  });

  return Result.isFailure(parsed) ? parsed.failure.rejections : [];
};

const IMPOSSIBLE_DATES = [
  "2025-02-29",
  "1900-02-29",
  "2025-04-31",
  "2025-06-31",
  "2025-02-30",
  "2025-11-31",
] as const;

it("names an impossible calendar date as not a date on its own field", () => {
  for (const date of IMPOSSIBLE_DATES) {
    expect(rejectionsOf(payment({ due_on: date })), date).toEqual([
      { field: "due_on", index: 0, reason: "NotADate" },
    ]);

    expect(rejectionsOf(payment({ period_ends_on: date })), date).toEqual([
      { field: "period_ends_on", index: 0, reason: "NotADate" },
    ]);
  }

  expect(rejectionsOf(payment({ due_on: "" }))).toEqual([
    { field: "due_on", index: 0, reason: "EmptyString" },
  ]);
});

it("keeps the leap days that exist and refuses the ones that do not", () => {
  for (const date of ["2024-02-29", "2000-02-29"] as const) {
    const parsed = parseFreeAgentDues({
      self_assessment_payments: [
        payment({ due_on: date, period_ends_on: "2000-01-31" }),
      ],
    });

    expect(Result.isSuccess(parsed), date).toBe(true);

    if (Result.isSuccess(parsed)) {
      expect(parsed.success[0]?.dueOn).toBe(date);
    }
  }
});

it("names a currency that is not three upper-case letters", () => {
  for (const currency of ["gbp", "Gbp", "GB", "GBPX", "1BX"]) {
    expect(rejectionsOf(payment({ currency })), currency).toEqual([
      { field: "currency", index: 0, reason: "NotACurrencyCode" },
    ]);
  }

  expect(rejectionsOf(payment({ currency: "" }))).toEqual([
    { field: "currency", index: 0, reason: "EmptyString" },
  ]);

  expect(
    Result.isSuccess(
      parseFreeAgentDues({ self_assessment_payments: [payment({})] })
    )
  ).toBe(true);
});

it("keeps a books-tool declaration aligned with core's obligation fields", () => {
  const obligationFields: Omit<
    TaxObligation,
    "id" | "profileId" | "syncedAt" | "taxProfileId"
  > = {
    amount: parse(codecs.money, { currency: "GBP", minor: 124_050 }),
    dueOn: parse(codecs.dateOnly, "2026-01-31"),
    kind: "SelfAssessment",
    label: "Self Assessment",
    periodEndsOn: parse(codecs.dateOnly, "2025-04-05"),
    status: estimatedStatus("unpaid"),
  };

  const declaration: DueDeclaration = obligationFields;

  const asObligationFields: Omit<
    TaxObligation,
    "id" | "profileId" | "syncedAt" | "taxProfileId"
  > = declaration;

  expect(asObligationFields).toEqual(obligationFields);
});

it("keys a due by the tax profile, kind, period, due date and label", () => {
  const base = parse(codecs.taxObligation, {
    amount: { currency: "GBP", minor: 124_050 },
    dueOn: "2026-01-31",
    id: "0192f0c1-0042-7c1d-8e2f-3a4b5c6d7e8f",
    kind: "SelfAssessment",
    label: "Self Assessment",
    periodEndsOn: "2025-04-05",
    profileId,
    status: estimatedStatus("unpaid"),
    syncedAt: "2026-01-01T00:00:00.000Z",
    taxProfileId,
  });

  const revalued = parse(codecs.taxObligation, {
    ...base,
    amount: { currency: "GBP", minor: 130_000 },
    id: "0192f0c1-0043-7f2a-9c31-5e6d7a8b9c0d",
  });

  expect(dueKey(revalued)).toBe(dueKey(base));

  const moved = parse(codecs.taxObligation, {
    ...base,
    dueOn: "2026-02-28",
  });

  expect(dueKey(moved)).not.toBe(dueKey(base));
});

const CALENDAR_TEXTS = [
  "2024-02-29",
  "2025-02-29",
  "1900-02-29",
  "2000-02-29",
  "2025-04-31",
  "2025-06-31",
  "2025-11-31",
  "2025-01-00",
  "2025-13-01",
  "",
  "2025-1-1",
];

const TIMESTAMP_TEXTS = [
  "2024-02-29T10:00:00.000Z",
  "2025-02-29T10:00:00.000Z",
  "2024-02-29T24:00:00.000Z",
  "2024-02-29T10:60:00.000Z",
  "2024-02-29T10:00:00.00Z",
  "2024-02-29 10:00:00.000Z",
];

it("keeps the tax boundary dates agreeing with core's codecs", () => {
  for (const text of CALENDAR_TEXTS) {
    expect(
      Result.isSuccess(Schema.decodeResult(DateOnlySchema)(text)),
      text
    ).toBe(Result.isSuccess(codecs.dateOnly.decode(text)));
  }

  for (const text of TIMESTAMP_TEXTS) {
    expect(
      Result.isSuccess(Schema.decodeResult(TimestampSchema)(text)),
      text
    ).toBe(Result.isSuccess(codecs.timestamp.decode(text)));
  }
});

it("round trips a stored due through the tax boundary schema", () => {
  const due = parse(codecs.taxObligation, {
    amount: { currency: "GBP", minor: 124_050 },
    dueOn: "2026-01-31",
    id: "0192f0c1-0042-7c1d-8e2f-3a4b5c6d7e8f",
    kind: "SelfAssessment",
    label: "Self Assessment",
    periodEndsOn: "2025-04-05",
    profileId,
    status: estimatedStatus("unpaid"),
    syncedAt: "2026-01-01T00:00:00.000Z",
    taxProfileId,
  });

  const taxProfile = parse(codecs.taxProfile, {
    id: taxProfileId,
    jurisdiction: "GB",
    primary: true,
    profileId,
    yearStart: { day: 6, month: 4 },
  });

  const wire = Schema.encodeSync(TaxDuesSchema)({
    dues: [due],
    taxProfiles: [taxProfile],
  });

  const decoded = Result.getOrThrow(Schema.decodeResult(TaxDuesSchema)(wire));

  expect(decoded.dues).toEqual([due]);
  expect(decoded.taxProfiles).toEqual([taxProfile]);
  expect(parse(codecs.taxObligation, decoded.dues[0])).toEqual(due);
});
