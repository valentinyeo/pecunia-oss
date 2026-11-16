import { toRpcGroup } from "@pecunia/capability/rpc-group";
import { Schema } from "effect";
import { expect, it } from "vitest";

import { bankLineCapabilities } from "../src/capabilities.js";
import { bankLineContracts } from "../src/contracts.js";
import {
  CategoryChangeSchema,
  CategoryFilterSchema,
  EditBankLineRequestSchema,
  ListBankLinesRequestSchema,
  NOTE_MAX_LENGTH,
  NoteChangeSchema,
  ReviewFilterSchema,
  SEARCH_LIMIT_MAX,
  SEARCH_MAX_LENGTH,
} from "../src/model.js";

const demoProfile = "0192f0c1-0001-702d-8484-48490b729601";

const demoLine = "0192f0c1-002a-7549-8811-8111b948c159";

const listRequest = {
  cursor: null,
  filter: {
    account: null,
    amount: null,
    category: CategoryFilterSchema.cases.Any.make({}),
    direction: null,
    occurred: null,
    review: ReviewFilterSchema.cases.Any.make({}),
  },
  limit: 20,
  profileId: demoProfile,
  search: "coffee",
};

const editRequest = {
  category: CategoryChangeSchema.cases.Unchanged.make({}),
  lineId: demoLine,
  note: NoteChangeSchema.cases.Set.make({ text: "checked" }),
  profileId: demoProfile,
};

const decodeList = (value: Schema.Json) =>
  Schema.decodeUnknownResult(ListBankLinesRequestSchema)(value);

const decodeEdit = (value: Schema.Json) =>
  Schema.decodeUnknownResult(EditBankLineRequestSchema)(value);

it("parses a plain bank line request at the boundary", () => {
  expect(decodeList(listRequest)._tag).toBe("Success");
});

it("parses an edit whose category and note are explicit changes", () => {
  expect(decodeEdit(editRequest)._tag).toBe("Success");
});

it("refuses a filter range whose ends are crossed", () => {
  expect(
    decodeList({
      ...listRequest,
      filter: {
        ...listRequest.filter,
        amount: { currency: "EUR", max: 100, min: 500 },
      },
    })._tag
  ).toBe("Failure");

  expect(
    decodeList({
      ...listRequest,
      filter: {
        ...listRequest.filter,
        occurred: { from: 1_741_683_600_000, to: 1_736_154_000_000 },
      },
    })._tag
  ).toBe("Failure");
});

it("refuses a page size or text outside its range", () => {
  expect(decodeList({ ...listRequest, limit: 0 })._tag).toBe("Failure");

  expect(decodeList({ ...listRequest, limit: SEARCH_LIMIT_MAX + 1 })._tag).toBe(
    "Failure"
  );

  expect(
    decodeList({ ...listRequest, search: "a".repeat(SEARCH_MAX_LENGTH + 1) })
      ._tag
  ).toBe("Failure");

  expect(
    decodeEdit({
      ...editRequest,
      // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- A wire payload this test decodes, not a domain value.
      note: { _tag: "Set", text: "a".repeat(NOTE_MAX_LENGTH + 1) },
    })._tag
  ).toBe("Failure");
});

it("refuses a filter member the union does not name", () => {
  expect(
    decodeList({
      ...listRequest,
      filter: {
        ...listRequest.filter,
        // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- A wire payload this test decodes, not a domain value.
        review: { _tag: "Some" },
      },
    })._tag
  ).toBe("Failure");
});

it("refuses a category change that names no category", () => {
  expect(
    decodeEdit({
      ...editRequest,
      // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- A wire payload this test decodes, not a domain value.
      category: { _tag: "Assigned" },
    })._tag
  ).toBe("Failure");
});

it("projects the three contracts onto one RPC group", () => {
  const { group } = toRpcGroup(bankLineContracts);

  expect([...group.requests.keys()]).toEqual([
    "listBankLines",
    "editBankLine",
    "reviewBankLine",
  ]);

  expect(
    bankLineCapabilities.map((capability) => capability.contract.name)
  ).toEqual([...group.requests.keys()]);
});

it("marks reads read-only and leaves every bank line write approved as itself", () => {
  const annotations = Object.fromEntries(
    bankLineContracts.map((contract) => [contract.name, contract.annotations])
  );

  expect(annotations.listBankLines?.readOnly).toBe(true);
  expect(annotations.editBankLine?.readOnly).toBe(false);
  expect(annotations.reviewBankLine?.readOnly).toBe(false);

  expect(bankLineContracts.every((contract) => !contract.needsApproval)).toBe(
    true
  );
});
