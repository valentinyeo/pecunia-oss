import { toRpcGroup } from "@pecunia/capability/rpc-group";
import { Predicate, Schema } from "effect";
import { expect, it } from "vitest";

import { investmentCapabilities } from "../src/capabilities.js";
import { investmentContracts } from "../src/contracts.js";
import {
  AddHoldingRequestSchema,
  CostBasisChangeSchema,
  DeleteHoldingRequestSchema,
  EditHoldingRequestSchema,
  HoldingIdSchema,
  MoneySchema,
  NameChangeSchema,
  PriceChangeSchema,
  ProfileIdSchema,
  QuantityChangeSchema,
  ReadPortfolioRequestSchema,
  TimestampSchema,
} from "../src/model.js";

const demoProfile = "0192f0c1-0001-702d-8484-48490b729601";

const demoHolding = "0192f0c1-0020-7c24-8409-4096749fc882";

const addRequest = {
  assetType: "etf",
  costBasis: { currency: "EUR", minor: 450_000 },
  currency: "EUR",
  name: "Demo Manual Fund",
  openedOn: "2025-05-01",
  platformId: "manual",
  price: { currency: "EUR", minor: 12_500 },
  pricedAt: "2026-01-05T09:00:00.000Z",
  profileId: demoProfile,
  quantity: 2_000_000,
  state: "active",
  symbol: "DEMO-MANUAL",
};

const decodeAdd = (value: Schema.Json) =>
  Schema.decodeUnknownResult(AddHoldingRequestSchema)(value);

const decodeEdit = (value: Schema.Json) =>
  Schema.decodeUnknownResult(EditHoldingRequestSchema)(value);

const decodeDelete = (value: Schema.Json) =>
  Schema.decodeUnknownResult(DeleteHoldingRequestSchema)(value);

const decodeRead = (value: Schema.Json) =>
  Schema.decodeUnknownResult(ReadPortfolioRequestSchema)(value);

it("parses a plain add-holding request at the boundary", () => {
  expect(decodeAdd(addRequest)._tag).toBe("Success");
});

it("refuses a price without the instant it was priced", () => {
  expect(decodeAdd({ ...addRequest, pricedAt: null })._tag).toBe("Failure");
});

it("refuses a priced instant without a price", () => {
  expect(decodeAdd({ ...addRequest, price: null })._tag).toBe("Failure");
});

it("refuses a quantity, name or symbol outside its range", () => {
  expect(decodeAdd({ ...addRequest, quantity: -1 })._tag).toBe("Failure");

  expect(decodeAdd({ ...addRequest, name: "" })._tag).toBe("Failure");

  expect(decodeAdd({ ...addRequest, symbol: "S".repeat(65) })._tag).toBe(
    "Failure"
  );

  expect(decodeAdd({ ...addRequest, state: "pending" })._tag).toBe("Failure");
});

it("refuses a holding priced in a currency that is not a code", () => {
  expect(
    decodeAdd({
      ...addRequest,
      price: { currency: "EURO", minor: 12_500 },
    })._tag
  ).toBe("Failure");
});

it("parses an edit whose changes are explicit", () => {
  const edit = Schema.encodeSync(EditHoldingRequestSchema)({
    costBasis: CostBasisChangeSchema.cases.Cleared.make({}),
    holdingId: Schema.decodeSync(HoldingIdSchema)(demoHolding),
    name: NameChangeSchema.cases.Unchanged.make({}),
    price: PriceChangeSchema.cases.Set.make({
      price: Schema.decodeSync(MoneySchema)({
        currency: "EUR",
        minor: 520_000,
      }),
      pricedAt: Schema.decodeSync(TimestampSchema)("2026-01-05T09:00:00.000Z"),
    }),
    profileId: Schema.decodeSync(ProfileIdSchema)(demoProfile),
    quantity: QuantityChangeSchema.cases.Unchanged.make({}),
  });

  expect(decodeEdit(edit)._tag).toBe("Success");

  if (!Predicate.isTagged(edit.price, "Set")) {
    throw new Error("The encoded edit lost its price change");
  }

  const { pricedAt: _pricedAt, ...priceWithoutInstant } = edit.price;

  expect(decodeEdit({ ...edit, price: priceWithoutInstant })._tag).toBe(
    "Failure"
  );
});

it("refuses a delete for a holding id that is not one", () => {
  expect(
    decodeDelete({ holdingId: "not-a-uuid", profileId: demoProfile })._tag
  ).toBe("Failure");

  expect(decodeRead({ profileId: demoProfile })._tag).toBe("Success");
});

it("projects every contract onto one RPC group", () => {
  const { group } = toRpcGroup(investmentContracts);

  expect([...group.requests.keys()]).toEqual([
    "readInvestmentPortfolio",
    "addHolding",
    "editHolding",
    "deleteHolding",
    "syncInvestmentHoldings",
    "refreshInvestmentPrices",
  ]);

  expect(
    investmentCapabilities.map((capability) => capability.contract.name)
  ).toEqual([...group.requests.keys()]);
});

it("marks the read read-only and the delete destructive", () => {
  const annotations = Object.fromEntries(
    investmentContracts.map((contract) => [contract.name, contract.annotations])
  );

  expect(annotations.readInvestmentPortfolio?.readOnly).toBe(true);

  expect(annotations.addHolding?.readOnly).toBe(false);

  expect(annotations.deleteHolding?.destructive).toBe(true);

  expect(annotations.syncInvestmentHoldings?.idempotent).toBe(true);

  expect(investmentContracts.every((contract) => !contract.needsApproval)).toBe(
    true
  );
});
