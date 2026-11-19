import { expect, it } from "@effect/vitest";
import { toRpcGroup, toToolkit } from "@pecunia/capability";
import { codecs, parse, TaxObligationStatusSchema } from "@pecunia/core/model";
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
  ListTaxDuesRequestSchema,
  SyncTaxDuesRequestSchema,
} from "../src/model.js";
import type { DueDeclaration } from "../src/model.js";

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
    status: TaxObligationStatusSchema.cases.Estimated.make({
      booksStatus: "unpaid",
    }),
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
    status: TaxObligationStatusSchema.cases.Estimated.make({
      booksStatus: "unpaid",
    }),
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
