import { Option, Predicate } from "effect";

import type {
  DocumentId,
  InvoiceCoverageMonth,
  InvoiceDocument,
  InvoiceException,
  InvoiceSource,
  InvoiceStatusRow,
  Month,
  Payment,
  PaymentInvoiceStatus,
} from "./model.js";
import { PaymentInvoiceStatusSchema } from "./model.js";
import { monthOf } from "./months.js";
import { sourceFor } from "./sources.js";

export interface InvoiceBook {
  readonly documents: readonly InvoiceDocument[];
  readonly exceptions: readonly InvoiceException[];
  readonly payments: readonly Payment[];
  readonly sources: readonly InvoiceSource[];
}

const nonEmpty = <A>(head: A, rest: readonly A[]): readonly [A, ...A[]] => [
  head,
  ...rest,
];

const documentsFor = (
  book: InvoiceBook,
  payment: Payment
): readonly InvoiceDocument[] =>
  book.documents.filter(
    (document) =>
      document.profileId === payment.profileId &&
      Option.getOrUndefined(document.transactionId) === payment.id
  );

const exceptionFor = (
  book: InvoiceBook,
  payment: Payment
): Option.Option<InvoiceException> =>
  Option.fromUndefinedOr(
    book.exceptions.find(
      (exception) =>
        exception.profileId === payment.profileId &&
        exception.transactionId === payment.id
    )
  );

const invoicedStatus = (
  documents: readonly [InvoiceDocument, ...InvoiceDocument[]]
): PaymentInvoiceStatus => {
  const [head, ...rest] = documents;

  const ids: readonly [DocumentId, ...DocumentId[]] = nonEmpty(
    head.id,
    rest.map((document) => document.id)
  );

  return documents.some((document) =>
    Predicate.isTagged(document.archive, "Archived")
  )
    ? PaymentInvoiceStatusSchema.cases.Archived.make({ documents: ids })
    : PaymentInvoiceStatusSchema.cases.Invoiced.make({ documents: ids });
};

export const statusOf = (
  book: InvoiceBook,
  payment: Payment
): PaymentInvoiceStatus => {
  const documents = documentsFor(book, payment);
  const [head, ...rest] = documents;

  if (head !== undefined) {
    return invoicedStatus(nonEmpty(head, rest));
  }

  return Option.match(exceptionFor(book, payment), {
    onNone: () => PaymentInvoiceStatusSchema.cases.Missing.make({}),
    onSome: (exception) =>
      PaymentInvoiceStatusSchema.cases.Excepted.make({
        reason: exception.reason,
      }),
  });
};

const compareRows = (
  left: InvoiceStatusRow,
  right: InvoiceStatusRow
): number => {
  if (left.paidOn !== right.paidOn) {
    return left.paidOn < right.paidOn ? 1 : -1;
  }

  if (left.transactionId === right.transactionId) {
    return 0;
  }

  return left.transactionId < right.transactionId ? -1 : 1;
};

export const outgoingPaymentsOf = (
  payments: readonly Payment[]
): readonly Payment[] =>
  payments.filter((payment) => payment.direction === "out");

export const statusRowOf = (
  book: InvoiceBook,
  payment: Payment
): InvoiceStatusRow => ({
  amount: payment.amount,
  merchant: payment.merchant,
  paidOn: payment.paidOn,
  payeeId: payment.payeeId,
  sourceId: Option.map(
    sourceFor(payment.merchant, book.sources),
    (source) => source.id
  ),
  status: statusOf(book, payment),
  transactionId: payment.id,
});

export const statusRowsOf = (book: InvoiceBook): readonly InvoiceStatusRow[] =>
  outgoingPaymentsOf(book.payments)
    .map((payment) => statusRowOf(book, payment))
    .toSorted(compareRows);

export const rowsInMonth = (
  rows: readonly InvoiceStatusRow[],
  month: Month
): readonly InvoiceStatusRow[] =>
  rows.filter((row) => monthOf(row.paidOn) === month);

export const missingCountOf = (rows: readonly InvoiceStatusRow[]): number =>
  rows.filter((row) => Predicate.isTagged(row.status, "Missing")).length;

interface RunningCount {
  readonly excepted: number;
  readonly invoiced: number;
  readonly missing: number;
  readonly payments: number;
}

export const coverageOf = (
  rows: readonly InvoiceStatusRow[]
): readonly InvoiceCoverageMonth[] => {
  const counted = new Map<Month, RunningCount>();

  for (const row of rows) {
    const month = monthOf(row.paidOn);

    const running = counted.get(month) ?? {
      excepted: 0,
      invoiced: 0,
      missing: 0,
      payments: 0,
    };

    counted.set(month, {
      excepted:
        running.excepted + (Predicate.isTagged(row.status, "Excepted") ? 1 : 0),
      invoiced:
        running.invoiced +
        (Predicate.isTagged(row.status, "Invoiced") ||
        Predicate.isTagged(row.status, "Archived")
          ? 1
          : 0),
      missing:
        running.missing + (Predicate.isTagged(row.status, "Missing") ? 1 : 0),
      payments: running.payments + 1,
    });
  }

  return [...counted.entries()]
    .map(([month, counts]) => ({ month, ...counts }))
    .toSorted((left, right) => {
      if (left.month === right.month) {
        return 0;
      }

      return left.month < right.month ? 1 : -1;
    });
};
