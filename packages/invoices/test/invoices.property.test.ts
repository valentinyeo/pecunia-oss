import { expect, it } from "@effect/vitest";
import { CurrentPerson, ProfileIdSchema } from "@pecunia/access";
import {
  DateTime,
  Effect,
  Layer,
  Option,
  Predicate,
  Result,
  Schema,
} from "effect";

import { recordArchive, reserveArchive } from "../src/archive.js";
import { attachInvoice } from "../src/capabilities.js";
import { dayNumber, daysApart } from "../src/dates.js";
import {
  demoArchivePlaces,
  demoPayments,
  demoPerson,
  demoProfileId,
} from "../src/demo.js";
import { proposeMatches } from "../src/matching.js";
import { memoryInvoiceStoreLayer } from "../src/memory.js";
import {
  AmountSchema,
  ArchiveOutcomeSchema,
  ArchivePlaceIdSchema,
  ArchivePlaceSchema,
  ArchiveStateSchema,
  BlocklistSchema,
  DateOnlySchema,
  DocumentIdSchema,
  PayeeIdSchema,
  PaymentSchema,
  TimestampMillisSchema,
  TransactionIdSchema,
} from "../src/model.js";
import type {
  Amount,
  ArchivePlace,
  ArchivePlaceId,
  ArchiveState,
  DateOnly,
  DocumentId,
  InvoiceDocument,
  PayeeId,
  Payment,
  ProfileId,
  TransactionId,
} from "../src/model.js";
import { InvoiceService } from "../src/service.js";

const decode = Schema.decodeSync;

const CASES = 600;

const otherProfileId = decode(ProfileIdSchema)("profile-other-property");

interface Random {
  readonly chance: (probability: number) => boolean;
  readonly int: (min: number, max: number) => number;
  readonly pick: <A>(items: readonly [A, ...A[]]) => A;
}

const makeRandom = (seed: number): Random => {
  let state = seed % 4_294_967_296;

  const next = () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };

  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));

  const pick = <A>(items: readonly [A, ...A[]]): A => {
    const chosen = items[int(0, items.length - 1)];

    if (chosen === undefined) {
      throw new Error("A generated pick needs a non-empty source list");
    }

    return chosen;
  };

  return { chance: (probability) => next() < probability, int, pick };
};

const tuple = <A>(items: readonly A[]): readonly [A, ...A[]] => {
  const [first, ...rest] = items;

  if (first === undefined) {
    throw new Error("A generated pool needs at least one value");
  }

  return [first, ...rest];
};

const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const monthLength = (year: number, month: number): number =>
  month === 2 && isLeapYear(year) ? 29 : (monthLengths[month - 1] ?? 0);

const padded = (value: number, width: number): string =>
  String(value).padStart(width, "0");

const dateOf = (year: number, month: number, day: number): DateOnly =>
  decode(DateOnlySchema)(
    `${padded(year, 4)}-${padded(month, 2)}-${padded(day, 2)}`
  );

const generatedDate = (random: Random): DateOnly => {
  const year = random.int(1900, 2100);
  const month = random.int(1, 12);

  return dateOf(year, month, random.int(1, monthLength(year, month)));
};

const referenceEpochDay = (date: DateOnly): number =>
  Math.floor(
    DateTime.toEpochMillis(DateTime.makeUnsafe(`${date}T00:00:00.000Z`)) /
      86_400_000
  );

const datePlusDays = (date: DateOnly, days: number): DateOnly =>
  decode(DateOnlySchema)(
    DateTime.formatIso(
      DateTime.makeUnsafe(
        DateTime.toEpochMillis(DateTime.makeUnsafe(`${date}T00:00:00.000Z`)) +
          days * 86_400_000
      )
    ).slice(0, 10)
  );

const CURRENCIES = ["EUR", "GBP", "JPY", "USD"] as const;

const PAYEES: readonly [PayeeId, ...PayeeId[]] = [
  decode(PayeeIdSchema)("payee-demo-cloud"),
  decode(PayeeIdSchema)("payee-demo-design"),
  decode(PayeeIdSchema)("payee-demo-rail"),
];

const OTHER_PAYEES: readonly [PayeeId, ...PayeeId[]] = [
  decode(PayeeIdSchema)("payee-other-one"),
  decode(PayeeIdSchema)("payee-other-two"),
];

const designPayee = decode(PayeeIdSchema)("payee-demo-design");

const drivePlaceId = decode(ArchivePlaceIdSchema)("place-drive");

const PLACE_IDS: readonly [ArchivePlaceId, ...ArchivePlaceId[]] = [
  decode(ArchivePlaceIdSchema)("place-local"),
  decode(ArchivePlaceIdSchema)("place-drive"),
];

const PROVIDERS = ["drive", "local"] as const;

const paymentNamed = (payments: readonly Payment[], id: string): Payment => {
  const found = payments.find((payment) => payment.id === id);

  if (found === undefined) {
    throw new Error(`The demo book has no payment at ${id}`);
  }

  return found;
};

const documentOf = (options: {
  readonly amount: Amount | undefined;
  readonly archive: ArchiveState;
  readonly documentDate: DateOnly;
  readonly id: DocumentId;
  readonly payeeId: PayeeId;
  readonly profileId: ProfileId;
  readonly transactionId: TransactionId | undefined;
}): InvoiceDocument => ({
  amount: Option.fromUndefinedOr(options.amount),
  archive: options.archive,
  contentType: "application/pdf",
  documentDate: options.documentDate,
  documentType: "invoice",
  id: options.id,
  originalFilename: "demo-invoice.pdf",
  profileId: options.profileId,
  r2Key: "documents/demo-invoice.pdf",
  sha256: "6".repeat(64),
  sizeBytes: 4096,
  source: "upload",
  sourceRef: Option.none(),
  transactionId: Option.fromUndefinedOr(options.transactionId),
  vendorPayeeId: Option.some(options.payeeId),
});

const paymentOf = (options: {
  readonly amount: Amount;
  readonly direction?: Payment["direction"];
  readonly id: TransactionId;
  readonly merchant?: string;
  readonly paidOn: DateOnly;
  readonly payeeId: PayeeId;
  readonly profileId: ProfileId;
}): Payment => ({
  amount: options.amount,
  direction: options.direction ?? "out",
  id: options.id,
  merchant: options.merchant ?? "Demo Vendor",
  paidOn: options.paidOn,
  payeeId: Option.some(options.payeeId),
  profileId: options.profileId,
});

const placeOf = (options: {
  readonly id: ArchivePlaceId;
  readonly provider: ArchivePlace["provider"];
}): ArchivePlace => ({
  blocklist: [],
  id: options.id,
  profileId: demoProfileId,
  provider: options.provider,
  rootRef: "demo-archive",
});

const amountOf = (currency: string, minor: number): Amount =>
  decode(AmountSchema)({ currency, minor });

const instant = decode(TimestampMillisSchema)(1_762_160_400_000);

const archiveStateOf = (
  random: Random,
  options: {
    readonly fileId: string;
    readonly otherPlaceId: ArchivePlaceId;
    readonly placeId: ArchivePlaceId;
  }
): ArchiveState => {
  switch (random.int(0, 3)) {
    case 0: {
      return ArchiveStateSchema.cases.Unarchived.make({});
    }

    case 1: {
      return ArchiveStateSchema.cases.Reserved.make({
        fileId: random.chance(0.5) ? options.fileId : `${options.fileId}-other`,
        placeId: random.chance(0.5) ? options.placeId : options.otherPlaceId,
      });
    }

    case 2: {
      return ArchiveStateSchema.cases.Archived.make({
        archivedAt: instant,
        fileId: options.fileId,
        placeId: options.placeId,
      });
    }

    default: {
      return ArchiveStateSchema.cases.Failed.make({
        reason: "Demo archive failure",
      });
    }
  }
};

it("counts calendar days exactly like Effect's DateTime across 600 dates", () => {
  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x5e_ed_00_01 + index);
    const left = generatedDate(random);
    const right = generatedDate(random);

    expect(dayNumber(left) - dayNumber(right)).toBe(
      referenceEpochDay(left) - referenceEpochDay(right)
    );

    expect(daysApart(left, right)).toBe(daysApart(right, left));
    expect(daysApart(left, right)).toBe(
      Math.abs(referenceEpochDay(left) - referenceEpochDay(right))
    );
  }
});

it("keeps the five day match window exact across leap days and year ends", () => {
  const windows = [
    [dateOf(2024, 2, 26), dateOf(2024, 3, 2), 5],
    [dateOf(2024, 2, 26), dateOf(2024, 3, 3), 6],
    [dateOf(2023, 2, 26), dateOf(2023, 3, 3), 5],
    [dateOf(2024, 12, 29), dateOf(2025, 1, 3), 5],
    [dateOf(2024, 12, 29), dateOf(2025, 1, 4), 6],
    [dateOf(2024, 3, 1), dateOf(2024, 2, 29), 1],
  ] as const;

  for (const [from, to, apart] of windows) {
    expect(daysApart(from, to)).toBe(apart);
  }
});

it("proposes a payment only inside the five day same vendor window", () => {
  const [payee] = PAYEES;

  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x5e_ed_00_02 + index);
    const documentDate = generatedDate(random);
    const offset = random.int(-8, 8);
    const paidOn = datePlusDays(documentDate, offset);
    const apart = daysApart(documentDate, paidOn);

    const document = documentOf({
      amount: undefined,
      archive: ArchiveStateSchema.cases.Unarchived.make({}),
      documentDate,
      id: decode(DocumentIdSchema)(`document-${index}`),
      payeeId: payee,
      profileId: demoProfileId,
      transactionId: undefined,
    });

    const payment = paymentOf({
      amount: amountOf("EUR", index),
      id: decode(TransactionIdSchema)(`payment-${index}`),
      paidOn,
      payeeId: payee,
      profileId: demoProfileId,
    });

    const proposals = proposeMatches([document], [payment]);

    expect(apart).toBe(Math.abs(offset));
    expect(proposals).toHaveLength(apart <= 5 ? 1 : 0);

    if (apart <= 5) {
      expect(proposals[0]).toEqual({
        daysApart: apart,
        documentId: document.id,
        payeeId: payee,
        transactionId: payment.id,
      });
    }
  }
});

it("never repeats a side or crosses a payee in 600 generated books", () => {
  let proposed = 0;

  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x5e_ed_00_03 + index);

    const documents = Array.from({ length: 5 }, (_, position) =>
      documentOf({
        amount: undefined,
        archive: ArchiveStateSchema.cases.Unarchived.make({}),
        documentDate: generatedDate(random),
        id: decode(DocumentIdSchema)(`document-${index}-${position}`),
        payeeId: random.pick(PAYEES),
        profileId: random.chance(0.8) ? demoProfileId : otherProfileId,
        transactionId: undefined,
      })
    );

    const payments = Array.from({ length: 5 }, (_, position) => {
      const anchor = documents[random.int(0, documents.length - 1)];

      const paidOn =
        anchor === undefined || random.chance(0.4)
          ? generatedDate(random)
          : datePlusDays(anchor.documentDate, random.int(-8, 8));

      return paymentOf({
        amount: amountOf(random.pick(CURRENCIES), position),
        id: decode(TransactionIdSchema)(`payment-${index}-${position}`),
        paidOn,
        payeeId: random.chance(0.5)
          ? random.pick(PAYEES)
          : random.pick(OTHER_PAYEES),
        profileId: random.chance(0.8) ? demoProfileId : otherProfileId,
      });
    });

    const proposals = proposeMatches(documents, payments);

    proposed += proposals.length;

    expect(new Set(proposals.map((proposal) => proposal.documentId)).size).toBe(
      proposals.length
    );

    expect(
      new Set(proposals.map((proposal) => proposal.transactionId)).size
    ).toBe(proposals.length);

    for (const proposal of proposals) {
      const document = documents.find(
        (candidate) => candidate.id === proposal.documentId
      );

      const payment = payments.find(
        (candidate) => candidate.id === proposal.transactionId
      );

      expect(document).toBeDefined();
      expect(payment).toBeDefined();

      if (document !== undefined && payment !== undefined) {
        expect(proposal.payeeId).toBe(Option.getOrUndefined(payment.payeeId));
        expect(Option.getOrUndefined(document.vendorPayeeId)).toBe(
          Option.getOrUndefined(payment.payeeId)
        );
        expect(document.profileId).toBe(payment.profileId);
        expect(proposal.daysApart).toBe(
          daysApart(document.documentDate, payment.paidOn)
        );
        expect(proposal.daysApart).toBeLessThanOrEqual(5);
      }
    }
  }

  expect(proposed).toBeGreaterThan(50);
});

it("gives two payments to the two nearest documents and leaves the third out", () => {
  const [payee] = PAYEES;

  const documentAt = (id: string, date: DateOnly) =>
    documentOf({
      amount: undefined,
      archive: ArchiveStateSchema.cases.Unarchived.make({}),
      documentDate: date,
      id: decode(DocumentIdSchema)(id),
      payeeId: payee,
      profileId: demoProfileId,
      transactionId: undefined,
    });

  const paymentOn = (id: string, date: DateOnly) =>
    paymentOf({
      amount: amountOf("EUR", 100),
      id: decode(TransactionIdSchema)(id),
      paidOn: date,
      payeeId: payee,
      profileId: demoProfileId,
    });

  const proposals = proposeMatches(
    [
      documentAt("document-far", dateOf(2025, 3, 1)),
      documentAt("document-near", dateOf(2025, 3, 11)),
      documentAt("document-next", dateOf(2025, 3, 12)),
    ],
    [
      paymentOn("payment-eleventh", dateOf(2025, 3, 11)),
      paymentOn("payment-tenth", dateOf(2025, 3, 10)),
    ]
  );

  expect(proposals).toEqual([
    {
      daysApart: 0,
      documentId: "document-near",
      payeeId: payee,
      transactionId: "payment-eleventh",
    },
    {
      daysApart: 2,
      documentId: "document-next",
      payeeId: payee,
      transactionId: "payment-tenth",
    },
  ]);
});

it("never proposes a payment that already has a document", () => {
  const [payee] = PAYEES;

  const attached = documentOf({
    amount: undefined,
    archive: ArchiveStateSchema.cases.Unarchived.make({}),
    documentDate: dateOf(2025, 3, 11),
    id: decode(DocumentIdSchema)("document-attached"),
    payeeId: payee,
    profileId: demoProfileId,
    transactionId: decode(TransactionIdSchema)("payment-taken"),
  });

  const fresh = documentOf({
    amount: undefined,
    archive: ArchiveStateSchema.cases.Unarchived.make({}),
    documentDate: dateOf(2025, 3, 11),
    id: decode(DocumentIdSchema)("document-fresh"),
    payeeId: payee,
    profileId: demoProfileId,
    transactionId: undefined,
  });

  const payment = paymentOf({
    amount: amountOf("EUR", 100),
    id: decode(TransactionIdSchema)("payment-taken"),
    paidOn: dateOf(2025, 3, 11),
    payeeId: payee,
    profileId: demoProfileId,
  });

  expect(proposeMatches([attached, fresh], [payment])).toEqual([]);
});

it.effect(
  "keeps the exact minor units of every attached invoice in 600 cases",
  () => {
    const random = makeRandom(0x5e_ed_00_04);

    const documents = Array.from({ length: CASES }, (_, index) => {
      const currency = random.pick(CURRENCIES);
      const minor = random.int(-1_000_000, 1_000_000) * random.int(1, 1000);

      return documentOf({
        amount: amountOf(currency, minor),
        archive: ArchiveStateSchema.cases.Unarchived.make({}),
        documentDate: dateOf(2025, 2, 3),
        id: decode(DocumentIdSchema)(`amount-document-${index}`),
        payeeId: designPayee,
        profileId: demoProfileId,
        transactionId: undefined,
      });
    });

    const layer = Layer.mergeAll(
      InvoiceService.layer.pipe(
        Layer.provide(
          memoryInvoiceStoreLayer({
            documents,
            payments: demoPayments,
            places: demoArchivePlaces,
          })
        )
      ),
      Layer.succeed(CurrentPerson, demoPerson)
    );

    const payment = paymentNamed(
      demoPayments,
      "0192f0c1-0028-7018-8357-3578945c907b"
    );

    return Effect.gen(function* keepAmounts() {
      for (const document of documents) {
        const attached = yield* attachInvoice.handler({
          documentId: document.id,
          profileId: demoProfileId,
          transactionId: payment.id,
        });

        expect(Option.getOrUndefined(attached.transactionId)).toBe(payment.id);
        expect(Option.getOrUndefined(attached.amount)).toEqual(
          Option.getOrUndefined(document.amount)
        );
        expect(attached.documentDate).toBe(document.documentDate);
      }
    }).pipe(Effect.provide(layer), Effect.orDie);
  }
);

it("moves an invoice through the archive states only by the named rules", () => {
  const fileId = "demo-file-reserve";

  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x5e_ed_00_05 + index);

    const place = placeOf({
      id: random.pick(PLACE_IDS),
      provider: random.pick(PROVIDERS),
    });

    const state = archiveStateOf(random, {
      fileId,
      otherPlaceId: drivePlaceId,
      placeId: place.id,
    });

    const document = documentOf({
      amount: undefined,
      archive: state,
      documentDate: dateOf(2025, 3, 11),
      id: decode(DocumentIdSchema)(`archive-document-${index}`),
      payeeId: PAYEES[0],
      profileId: demoProfileId,
      transactionId: undefined,
    });

    const reserved = reserveArchive(document, place, fileId);

    const fresh =
      Predicate.isTagged(state, "Unarchived") ||
      Predicate.isTagged(state, "Failed");

    if (fresh) {
      expect(Result.isSuccess(reserved)).toBe(true);

      if (Result.isSuccess(reserved)) {
        expect(Predicate.isTagged(reserved.success.archive, "Reserved")).toBe(
          true
        );

        if (Predicate.isTagged(reserved.success.archive, "Reserved")) {
          expect(reserved.success.archive.fileId).toBe(fileId);
          expect(reserved.success.archive.placeId).toBe(place.id);
        }
      }
    }

    if (Predicate.isTagged(state, "Archived")) {
      expect(Result.isFailure(reserved)).toBe(true);
    }

    if (Predicate.isTagged(state, "Reserved")) {
      const sameFile = state.fileId === fileId && state.placeId === place.id;

      expect(Result.isSuccess(reserved)).toBe(sameFile);
    }

    const archived = recordArchive(
      document,
      ArchiveOutcomeSchema.cases.Archived.make({}),
      instant
    );

    if (Predicate.isTagged(state, "Reserved")) {
      expect(Result.isSuccess(archived)).toBe(true);

      if (Result.isSuccess(archived)) {
        expect(Predicate.isTagged(archived.success.archive, "Archived")).toBe(
          true
        );

        if (Predicate.isTagged(archived.success.archive, "Archived")) {
          expect(archived.success.archive.archivedAt).toBe(instant);
          expect(archived.success.archive.fileId).toBe(state.fileId);
          expect(archived.success.archive.placeId).toBe(state.placeId);
        }
      }
    }

    if (fresh) {
      expect(Result.isFailure(archived)).toBe(true);
    }

    if (Predicate.isTagged(state, "Archived")) {
      expect(Result.isSuccess(archived)).toBe(true);

      if (Result.isSuccess(archived)) {
        expect(archived.success.archive).toEqual(state);
      }
    }

    const failed = recordArchive(
      document,
      ArchiveOutcomeSchema.cases.Failed.make({
        reason: "Demo archive failure",
      }),
      instant
    );

    const repeatable =
      Predicate.isTagged(state, "Reserved") ||
      (Predicate.isTagged(state, "Failed") &&
        state.reason === "Demo archive failure");

    expect(Result.isSuccess(failed)).toBe(repeatable);

    if (Result.isSuccess(failed)) {
      expect(Predicate.isTagged(failed.success.archive, "Failed")).toBe(true);
      expect(Object.hasOwn(failed.success.archive, "fileId")).toBe(false);
      expect(Object.hasOwn(failed.success.archive, "archivedAt")).toBe(false);
    }
  }
});

it("refuses to reserve a file in a place that stores nothing", () => {
  const place = placeOf({ id: PLACE_IDS[0], provider: "none" });

  const document = documentOf({
    amount: undefined,
    archive: ArchiveStateSchema.cases.Unarchived.make({}),
    documentDate: dateOf(2025, 3, 11),
    id: decode(DocumentIdSchema)("archive-place-none-document"),
    payeeId: PAYEES[0],
    profileId: demoProfileId,
    transactionId: undefined,
  });

  const reserved = reserveArchive(document, place, "demo-file-none");

  expect(Result.isFailure(reserved)).toBe(true);

  if (Result.isFailure(reserved)) {
    expect(reserved.failure._tag).toBe("ArchivePlaceUnavailable");
  }
});

it("trims a blocklist and refuses a repeated or blank entry in 600 cases", () => {
  const words = tuple(["*.tmp", "drafts", "exports", "*/2024", "old"]);

  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x5e_ed_00_06 + index);

    const entries = Array.from({ length: random.int(0, 4) }, () => {
      const word = random.pick(words);

      return random.chance(0.15) ? ` ${word} ` : word;
    });

    const distinct = new Set(
      entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    );

    const decoded = Schema.decodeResult(BlocklistSchema)(entries);

    expect(Result.isSuccess(decoded)).toBe(distinct.size === entries.length);

    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual(entries.map((entry) => entry.trim()));
    }
  }
});

const archiveStepOf = (
  document: InvoiceDocument,
  place: ArchivePlace,
  random: Random,
  step: number
) => {
  switch (random.int(0, 2)) {
    case 0: {
      return reserveArchive(document, place, `demo-file-${step}`);
    }

    case 1: {
      return recordArchive(
        document,
        ArchiveOutcomeSchema.cases.Archived.make({}),
        instant
      );
    }

    default: {
      return recordArchive(
        document,
        ArchiveOutcomeSchema.cases.Failed.make({
          reason: "Demo archive failure",
        }),
        instant
      );
    }
  }
};

it("keeps every generated archive history in a legal state", () => {
  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x5e_ed_00_08 + index);

    const place = placeOf({
      id: random.pick(PLACE_IDS),
      provider: random.pick(PROVIDERS),
    });

    let document = documentOf({
      amount: undefined,
      archive: ArchiveStateSchema.cases.Unarchived.make({}),
      documentDate: dateOf(2025, 3, 11),
      id: decode(DocumentIdSchema)(`history-document-${index}`),
      payeeId: PAYEES[0],
      profileId: demoProfileId,
      transactionId: undefined,
    });

    for (let step = 0; step < 8; step += 1) {
      const next = archiveStepOf(document, place, random, step);

      if (Result.isSuccess(next)) {
        document = next.success;
      }

      const { archive } = document;

      if (Predicate.isTagged(archive, "Unarchived")) {
        expect(Object.keys(archive)).toEqual(["_tag"]);
      }

      if (Predicate.isTagged(archive, "Failed")) {
        expect(Object.hasOwn(archive, "fileId")).toBe(false);
        expect(Object.hasOwn(archive, "archivedAt")).toBe(false);
        expect(archive.reason.length).toBeGreaterThan(0);
      }

      if (Predicate.isTagged(archive, "Reserved")) {
        expect(archive.fileId.length).toBeGreaterThan(0);
        expect(archive.placeId).toBe(place.id);
        expect(Object.hasOwn(archive, "archivedAt")).toBe(false);
      }

      if (Predicate.isTagged(archive, "Archived")) {
        expect(archive.fileId.length).toBeGreaterThan(0);
        expect(archive.placeId).toBe(place.id);
        expect(archive.archivedAt).toBe(instant);
      }
    }
  }
});

const generatedBlocklist = (random: Random): readonly string[] => {
  if (random.chance(0.3)) {
    return ["*.tmp", " *.tmp "];
  }

  if (random.chance(0.3)) {
    return [" "];
  }

  return random.chance(0.5) ? ["drafts"] : [];
};

it("parses a generated archive place and payment at the boundary", () => {
  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x5e_ed_00_07 + index);

    const blocklist = generatedBlocklist(random);
    const rootRef = random.chance(0.2) ? "   " : ` archives/demo-${index} `;
    const trimmed = blocklist.map((entry) => entry.trim());

    const place = Schema.decodeResult(ArchivePlaceSchema)({
      blocklist,
      id: `place-${index}`,
      profileId: demoProfileId,
      provider: random.pick(PROVIDERS),
      rootRef,
    });

    const valid =
      rootRef.trim().length > 0 &&
      trimmed.every((entry) => entry.length > 0) &&
      new Set(trimmed).size === trimmed.length;

    expect(Result.isSuccess(place)).toBe(valid);

    if (Result.isSuccess(place)) {
      expect(place.success.rootRef).toBe(`archives/demo-${index}`);
      expect(place.success.blocklist).toEqual(trimmed);
    }

    const payment = Schema.decodeResult(PaymentSchema)({
      amount: { currency: random.pick(CURRENCIES), minor: random.int(0, 500) },
      direction: random.pick(["in", "neutral", "out"] as const),
      id: `payment-${index}`,
      merchant: random.chance(0.2) ? "  " : ` Demo Vendor ${index} `,
      paidOn: "2025-03-11",
      payeeId: null,
      profileId: demoProfileId,
    });

    expect(Result.isSuccess(payment)).toBe(true);

    if (Result.isSuccess(payment)) {
      expect(Option.isNone(payment.success.payeeId)).toBe(true);
    }
  }
});
