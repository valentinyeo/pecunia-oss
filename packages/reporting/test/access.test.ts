import { expect, it } from "@effect/vitest";
import type { CurrentPerson } from "@pecunia/access";
import { Effect, Option, Predicate } from "effect";

import {
  incomeSummary,
  listMonths,
  monthlyTotals,
  readCategories,
  readCategoryPayments,
  readDashboard,
  readIncome,
  readMonth,
  readSpending,
  reportCapabilities,
  reportToolCapabilities,
  spendingSummary,
} from "../src/capabilities.js";
import { boundOf } from "../src/date.js";
import {
  demoLivingCategoryId,
  demoProfileId,
  secondHousingCategoryId,
  secondProfileId,
} from "../src/demo.js";
import type { ReportContractFailure } from "../src/errors.js";
import type { ProfileId } from "../src/model.js";
import { PeriodChoiceSchema } from "../src/model.js";
import type { ReportService } from "../src/service.js";
import { dateOf, monthOf } from "./fixtures.js";
import {
  memberOfSecond,
  personLayer,
  stranger,
  viewerOfDemo,
} from "./service-layer.js";

const march = PeriodChoiceSchema.cases.Month.make({});

const range = boundOf(dateOf("2024-03-01"), dateOf("2024-03-31"));

const monthOfProfile = (profileId: ProfileId) =>
  profileId === secondProfileId ? monthOf("2024-06") : monthOf("2024-03");

const categoryOfProfile = (profileId: ProfileId) =>
  profileId === secondProfileId
    ? secondHousingCategoryId
    : demoLivingCategoryId;

interface Row {
  readonly name: string;
  readonly read: (
    profileId: ProfileId
  ) => Effect.Effect<
    void,
    ReportContractFailure,
    CurrentPerson | ReportService
  >;
}

const rowOf = <
  Output,
  Requirements extends CurrentPerson | ReportService,
  Input,
>(
  capability: {
    readonly contract: { readonly name: string };
    readonly handler: (
      input: Input
    ) => Effect.Effect<Output, ReportContractFailure, Requirements>;
  },
  inputOf: (profileId: ProfileId) => Input,
  demoOf: (output: Output) => void
): Row => ({
  name: capability.contract.name,
  read: (profileId) =>
    capability.handler(inputOf(profileId)).pipe(
      Effect.tap((output) =>
        Effect.sync(() => {
          demoOf(output);
        })
      )
    ),
});

const rows: readonly Row[] = [
  rowOf(
    readDashboard,
    (profileId) => ({ period: march, profileId }),
    (report) => {
      expect(report.totals.spendMinor).toBe(90_945);
    }
  ),
  rowOf(
    readCategories,
    (profileId) => ({ period: march, profileId }),
    (report) => {
      expect(report.categoryCount).toBe(6);
    }
  ),
  rowOf(
    readSpending,
    (profileId) => ({ period: march, profileId }),
    (report) => {
      expect(
        report.split.find((row) => row.bucket === "personal")?.spendMinor
      ).toBe(78_945);
    }
  ),
  rowOf(
    readCategoryPayments,
    (profileId) => ({
      categoryId: categoryOfProfile(profileId),
      period: march,
      profileId,
    }),
    (report) => {
      expect(report.spendMinor).toBe(29_945);
    }
  ),
  rowOf(
    readIncome,
    (profileId) => ({ clientId: Option.none(), period: march, profileId }),
    (report) => {
      expect(report.totals.incomeMinor).toBe(205_200);
    }
  ),
  rowOf(
    readMonth,
    (profileId) => ({ month: monthOfProfile(profileId), profileId }),
    (report) => {
      expect(report.totals.spendMinor).toBe(90_945);
    }
  ),
  rowOf(
    listMonths,
    (profileId) => ({ profileId }),
    (report) => {
      expect(report.months).toHaveLength(3);
    }
  ),
  rowOf(
    spendingSummary,
    (profileId) => ({ bound: range, profileId }),
    (report) => {
      expect(report.spendMinor).toBe(90_945);
    }
  ),
  rowOf(
    incomeSummary,
    (profileId) => ({ bound: range, profileId }),
    (report) => {
      expect(report.incomeMinor).toBe(205_200);
    }
  ),
  rowOf(
    monthlyTotals,
    (profileId) => ({ bound: range, profileId }),
    (report) => {
      expect(report.months[0]?.totals.netMinor).toBe(96_755);
    }
  ),
];

it("every exported capability and tool has an access row, exactly once", () => {
  const exported = new Set(
    [...reportCapabilities, ...reportToolCapabilities].map(
      (capability) => capability.contract.name
    )
  );

  const names = rows.map((row) => row.name);

  expect(new Set(names)).toStrictEqual(exported);
  expect(names).toHaveLength(exported.size);
});

const expectForbidden = (failure: ReportContractFailure) => {
  expect(Predicate.isTagged(failure, "Forbidden")).toBe(true);

  if (Predicate.isTagged(failure, "Forbidden")) {
    expect(failure.reason).toBe("notMember");
  }
};

it.effect("a member of another profile is refused by every handler", () =>
  Effect.gen(function* memberOfSecondRefused() {
    const layer = personLayer(memberOfSecond);

    for (const row of rows) {
      const failure = yield* Effect.provide(
        row.read(demoProfileId),
        layer
      ).pipe(Effect.flip);

      expectForbidden(failure);
    }
  })
);

it.effect("a stranger is refused by every handler", () =>
  Effect.gen(function* strangerRefused() {
    const layer = personLayer(stranger);

    for (const row of rows) {
      const failure = yield* Effect.provide(
        row.read(demoProfileId),
        layer
      ).pipe(Effect.flip);

      expectForbidden(failure);
    }
  })
);

it.effect(
  "a viewer of the demo profile reads the demo book on every handler",
  () =>
    Effect.gen(function* viewerReads() {
      const layer = personLayer(viewerOfDemo);

      for (const row of rows) {
        yield* Effect.provide(row.read(demoProfileId), layer);
      }
    })
);
