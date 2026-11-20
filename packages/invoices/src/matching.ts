import { Option } from "effect";

import { daysApart } from "./dates.js";
import type {
  InvoiceDocument,
  MatchProposal,
  PayeeId,
  Payment,
} from "./model.js";

export const MATCH_WINDOW_DAYS = 5;

const compareText = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};

const compareProposals = (left: MatchProposal, right: MatchProposal): number =>
  left.daysApart - right.daysApart ||
  compareText(left.documentId, right.documentId) ||
  compareText(left.transactionId, right.transactionId);

const proposalsFor = (
  document: InvoiceDocument,
  payments: readonly Payment[],
  payeeId: PayeeId
): readonly MatchProposal[] =>
  payments.flatMap((payment) => {
    const paymentPayeeId = Option.getOrUndefined(payment.payeeId);

    if (
      paymentPayeeId === undefined ||
      payment.profileId !== document.profileId ||
      paymentPayeeId !== payeeId
    ) {
      return [];
    }

    const apart = daysApart(document.documentDate, payment.paidOn);

    return apart <= MATCH_WINDOW_DAYS
      ? [
          {
            daysApart: apart,
            documentId: document.id,
            payeeId,
            transactionId: payment.id,
          },
        ]
      : [];
  });

const candidatesOf = (
  document: InvoiceDocument,
  payments: readonly Payment[]
): readonly MatchProposal[] => {
  const payeeId = Option.getOrUndefined(document.vendorPayeeId);

  if (payeeId === undefined || Option.isSome(document.transactionId)) {
    return [];
  }

  return proposalsFor(document, payments, payeeId);
};

const invoicedPaymentIds = (documents: readonly InvoiceDocument[]) =>
  new Set(
    documents.flatMap((document) => Option.toArray(document.transactionId))
  );

export const proposeMatches = (
  documents: readonly InvoiceDocument[],
  payments: readonly Payment[]
): readonly MatchProposal[] => {
  const invoiced = invoicedPaymentIds(documents);

  const open = payments.filter((payment) => !invoiced.has(payment.id));

  const ordered = documents
    .flatMap((document) => candidatesOf(document, open))
    .toSorted(compareProposals);

  const claimedDocuments = new Set<string>();
  const claimedPayments = new Set<string>();
  const proposals: MatchProposal[] = [];

  for (const candidate of ordered) {
    if (
      claimedDocuments.has(candidate.documentId) ||
      claimedPayments.has(candidate.transactionId)
    ) {
      continue;
    }

    claimedDocuments.add(candidate.documentId);
    claimedPayments.add(candidate.transactionId);
    proposals.push(candidate);
  }

  return proposals;
};
