import { expect, it } from "@effect/vitest";
import { ProfileIdSchema } from "@pecunia/access";
import { Option, Predicate, Schema } from "effect";

import {
  AmountSchema,
  ArchivePlaceIdSchema,
  ArchivePlaceSchema,
  ArchiveStateSchema,
  DateOnlySchema,
  DocumentIdSchema,
  InvoiceExceptionSchema,
  InvoiceSourceSchema,
  MonthSchema,
  PaymentSchema,
  TimestampMillisSchema,
} from "../src/model.js";
import type {
  ArchiveDocumentCursor,
  ArchivePlace,
  ArchiveState,
  DateOnly,
  InvoiceDocument,
  InvoiceException,
  InvoiceSource,
  Month,
  Payment,
  ProfileId,
  TransactionId,
} from "../src/model.js";
import { monthOf } from "../src/months.js";
import { archivedPageOf, archivedOf } from "../src/paging.js";
import {
  coverageOf,
  missingCountOf,
  rowsInMonth,
  statusRowsOf,
} from "../src/status.js";
import type { InvoiceBook } from "../src/status.js";

const decode = Schema.decodeSync;

const CASES = 600;

const demoProfileId = decode(ProfileIdSchema)(
  "0192f0c1-0001-702d-8484-48490b729601"
);

const otherProfileId = decode(ProfileIdSchema)(
  "0192f0c1-0002-702d-8484-48490b729602"
);

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

const padded = (value: number, width: number): string =>
  String(value).padStart(width, "0");

const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const monthLength = (year: number, month: number): number =>
  month === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    ? 29
    : (monthLengths[month - 1] ?? 0);

const dateOf = (year: number, month: number, day: number): DateOnly =>
  decode(DateOnlySchema)(
    `${padded(year, 4)}-${padded(month, 2)}-${padded(day, 2)}`
  );

const monthText = (year: number, month: number): Month =>
  decode(MonthSchema)(`${padded(year, 4)}-${padded(month, 2)}`);

const amountOf = (currency: string, minor: number) =>
  decode(AmountSchema)({ currency, minor });

const CURRENCIES = ["EUR", "GBP", "JPY", "USD"] as const;

const DIRECTIONS = ["in", "neutral", "out"] as const;

const months = [
  monthText(2024, 12),
  monthText(2025, 1),
  monthText(2025, 2),
  monthText(2025, 3),
  monthText(2025, 4),
  monthText(2025, 5),
] as const;

const placeId = decode(ArchivePlaceIdSchema)("place-property-archive");

const archivePlace: ArchivePlace = decode(ArchivePlaceSchema)({
  blocklist: [],
  id: placeId,
  profileId: demoProfileId,
  provider: "drive",
  rootRef: "archive",
});

const paymentOf = (options: {
  readonly amount: readonly [string, number];
  readonly direction: Payment["direction"];
  readonly id: string;
  readonly merchant: string;
  readonly paidOn: DateOnly;
  readonly profileId: ProfileId;
}): Payment =>
  decode(PaymentSchema)({
    amount: { currency: options.amount[0], minor: options.amount[1] },
    direction: options.direction,
    id: options.id,
    merchant: options.merchant,
    paidOn: options.paidOn,
    payeeId: null,
    profileId: options.profileId,
  });

const archiveOf = (
  state: "archived" | "failed" | "reserved" | "unarchived",
  archivedAt: number
): ArchiveState => {
  if (state === "archived") {
    return ArchiveStateSchema.cases.Archived.make({
      archivedAt: decode(TimestampMillisSchema)(archivedAt),
      fileId: `file-${archivedAt}`,
      placeId,
    });
  }

  if (state === "reserved") {
    return ArchiveStateSchema.cases.Reserved.make({
      fileId: `file-${archivedAt}`,
      placeId,
    });
  }

  if (state === "failed") {
    return ArchiveStateSchema.cases.Failed.make({
      reason: "Demo archive failure",
    });
  }

  return ArchiveStateSchema.cases.Unarchived.make({});
};

const documentOf = (options: {
  readonly archive: ArchiveState;
  readonly id: string;
  readonly index: number;
  readonly profileId: ProfileId;
  readonly transactionId: TransactionId | undefined;
}): InvoiceDocument => ({
  amount: Option.some(amountOf("EUR", 1000 + options.index)),
  archive: options.archive,
  contentType: "application/pdf",
  documentDate: dateOf(2025, 3, 11),
  documentType: "invoice",
  id: decode(DocumentIdSchema)(options.id),
  originalFilename: `demo-invoice-${options.index}.pdf`,
  profileId: options.profileId,
  r2Key: `documents/demo-invoice-${options.index}.pdf`,
  sha256: padded(options.index, 64).replaceAll(" ", "0"),
  sizeBytes: 1024 + options.index,
  source: "upload",
  sourceRef: Option.none(),
  transactionId: Option.fromUndefinedOr(options.transactionId),
  vendorPayeeId: Option.none(),
});

const exceptionOf = (options: {
  readonly profileId: ProfileId;
  readonly reason: string;
  readonly transactionId: TransactionId;
}): InvoiceException =>
  decode(InvoiceExceptionSchema)({
    profileId: options.profileId,
    reason: options.reason,
    recordedAt: 1_762_000_000_000,
    transactionId: options.transactionId,
  });

const sourceOf = (options: {
  readonly id: string;
  readonly pattern: string;
}): InvoiceSource =>
  decode(InvoiceSourceSchema)({
    id: options.id,
    loginHint: null,
    notes: null,
    pattern: options.pattern,
    portalUrl: null,
    profileId: demoProfileId,
    retrieval: {
      bookkeeper: false,
      email: false,
      portal: true,
      twoFactor: false,
    },
    vendorPayeeId: null,
  });

interface GeneratedBook {
  readonly documents: readonly InvoiceDocument[];
  readonly exceptions: readonly InvoiceException[];
  readonly payments: readonly Payment[];
  readonly profileId: ProfileId;
  readonly sources: readonly InvoiceSource[];
}

const generatedBook = (random: Random, index: number): GeneratedBook => {
  const profileId = random.chance(0.85) ? demoProfileId : otherProfileId;

  const payments = Array.from({ length: random.int(1, 7) }, (_, position) => {
    const month = random.pick(months);
    const year = Number(month.slice(0, 4));
    const number = Number(month.slice(5, 7));

    return paymentOf({
      amount: [random.pick(CURRENCIES), random.int(0, 900_000)],
      direction: random.pick(DIRECTIONS),
      id: `payment-${index}-${position}`,
      merchant: random.chance(0.2) ? "" : `Demo Vendor ${position}`,
      paidOn: dateOf(year, number, random.int(1, monthLength(year, number))),
      profileId,
    });
  });

  const documents = payments.flatMap((payment, position) => {
    if (!random.chance(0.5)) {
      return [];
    }

    return [
      documentOf({
        archive: archiveOf(
          random.pick([
            "archived",
            "unarchived",
            "reserved",
            "failed",
          ] as const),
          1_700_000_000_000 + position
        ),
        id: `document-${index}-${position}`,
        index: index * 10 + position,
        profileId: random.chance(0.9) ? profileId : otherProfileId,
        transactionId: random.chance(0.9) ? payment.id : undefined,
      }),
    ];
  });

  const exceptions = payments.flatMap((payment, position) =>
    random.chance(0.3)
      ? [
          exceptionOf({
            profileId: random.chance(0.9) ? profileId : otherProfileId,
            reason: `Written reason ${position}`,
            transactionId: payment.id,
          }),
        ]
      : []
  );

  const sources = random.chance(0.6)
    ? [
        sourceOf({ id: `source-${index}-a`, pattern: "Demo Vendor 1" }),
        sourceOf({
          id: `source-${index}-b`,
          pattern: `demo vendor ${random.int(0, 6)}`,
        }),
      ]
    : [];

  return { documents, exceptions, payments, profileId, sources };
};

const bookOf = (generated: GeneratedBook): InvoiceBook => ({
  documents: generated.documents,
  exceptions: generated.exceptions,
  payments: generated.payments,
  sources: generated.sources,
});

const referenceStatusTag = (
  generated: GeneratedBook,
  payment: Payment
): "Archived" | "Excepted" | "Invoiced" | "Missing" => {
  const documents = generated.documents.filter(
    (document) =>
      document.profileId === payment.profileId &&
      Option.getOrUndefined(document.transactionId) === payment.id
  );

  if (documents.length > 0) {
    const archived = documents.some((document) =>
      Predicate.isTagged(document.archive, "Archived")
    );

    return archived ? "Archived" : "Invoiced";
  }

  const exception = generated.exceptions.some(
    (candidate) =>
      candidate.profileId === payment.profileId &&
      candidate.transactionId === payment.id
  );

  return exception ? "Excepted" : "Missing";
};

it("counts every outgoing payment once in 600 generated books", () => {
  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x50_11_00_01 + index);
    const generated = generatedBook(random, index);
    const rows = statusRowsOf(bookOf(generated));

    const outgoing = generated.payments.filter(
      (payment) => payment.direction === "out"
    );

    expect(rows).toHaveLength(outgoing.length);

    expect(new Set(rows.map((row) => row.transactionId)).size).toBe(
      rows.length
    );

    for (const row of rows) {
      const payment = generated.payments.find(
        (candidate) => candidate.id === row.transactionId
      );

      expect(payment).toBeDefined();

      if (payment !== undefined) {
        expect(row.status._tag).toBe(referenceStatusTag(generated, payment));
        expect(row.amount).toEqual(payment.amount);
        expect(row.merchant).toBe(payment.merchant);
      }
    }

    for (let position = 1; position < rows.length; position += 1) {
      const previous = rows[position - 1];
      const current = rows[position];

      expect(previous).toBeDefined();
      expect(current).toBeDefined();

      if (previous !== undefined && current !== undefined) {
        const ordered =
          previous.paidOn > current.paidOn ||
          (previous.paidOn === current.paidOn &&
            previous.transactionId <= current.transactionId);

        expect(ordered).toBe(true);
      }
    }
  }
});

it("counts missing invoices per month in 600 generated books", () => {
  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x50_11_00_02 + index);
    const generated = generatedBook(random, index);
    const book = bookOf(generated);
    const rows = statusRowsOf(book);

    for (const month of months) {
      const monthRows = rowsInMonth(rows, month);

      const expected = generated.payments.filter(
        (payment) =>
          payment.direction === "out" && monthOf(payment.paidOn) === month
      );

      expect(monthRows).toHaveLength(expected.length);
      expect(monthRows.every((row) => monthOf(row.paidOn) === month)).toBe(
        true
      );
      expect(missingCountOf(monthRows)).toBe(
        expected.filter(
          (payment) => referenceStatusTag(generated, payment) === "Missing"
        ).length
      );
    }

    const coverage = coverageOf(rows);

    const totalPayments = coverage.reduce(
      (sum, month) => sum + month.payments,
      0
    );

    expect(totalPayments).toBe(rows.length);

    for (const month of coverage) {
      expect(month.excepted + month.invoiced + month.missing).toBe(
        month.payments
      );
      expect(month.payments).toBe(rowsInMonth(rows, month.month).length);
    }

    for (let position = 1; position < coverage.length; position += 1) {
      const previous = coverage[position - 1];
      const current = coverage[position];

      if (previous !== undefined && current !== undefined) {
        expect(previous.month > current.month).toBe(true);
      }
    }
  }
});

it("walks every generated archive page without repeating or dropping a row", () => {
  for (let index = 0; index < CASES; index += 1) {
    const random = makeRandom(0x50_11_00_03 + index);

    const documents = Array.from({ length: random.int(0, 12) }, (_, position) =>
      documentOf({
        archive: archiveOf(
          random.pick([
            "archived",
            "archived",
            "archived",
            "failed",
            "reserved",
            "unarchived",
          ] as const),
          1_700_000_000_000 + random.int(0, 40)
        ),
        id: `archive-document-${index}-${position}`,
        index: index * 20 + position,
        profileId: demoProfileId,
        transactionId: undefined,
      })
    );

    const limit = random.int(1, 5);

    const seen: string[] = [];
    let cursor = Option.none<ArchiveDocumentCursor>();

    for (let step = 0; step < 40; step += 1) {
      const page = archivedPageOf({
        cursor,
        documents,
        limit,
        places: [archivePlace],
      });

      expect(page.documents.length).toBeLessThanOrEqual(limit);

      seen.push(...page.documents.map((row) => row.document.id));

      if (Option.isNone(page.next)) {
        break;
      }

      cursor = page.next;
    }

    const expected = archivedOf(documents)
      .toSorted((left, right) => {
        const leftAt = Predicate.isTagged(left.archive, "Archived")
          ? left.archive.archivedAt
          : 0;

        const rightAt = Predicate.isTagged(right.archive, "Archived")
          ? right.archive.archivedAt
          : 0;

        if (leftAt !== rightAt) {
          return leftAt < rightAt ? 1 : -1;
        }

        return left.id < right.id ? -1 : 1;
      })
      .map((document) => document.id);

    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(seen.length);

    const first = archivedPageOf({
      cursor: Option.none(),
      documents,
      limit,
      places: [archivePlace],
    });

    expect(first.total).toBe(expected.length);

    for (const row of first.documents) {
      expect(row.path).toEqual(
        Option.some(
          `archive/2025/03/${row.document.sha256.slice(0, 12)}-${row.document.originalFilename}`
        )
      );
    }
  }
});
