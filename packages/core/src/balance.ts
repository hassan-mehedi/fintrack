import { ACCOUNT_CLASSIFICATION, type AccountClassification } from "@fintrack/shared/types";

export function getAccountClassification(accountType: string): AccountClassification {
  return ACCOUNT_CLASSIFICATION[accountType] || "asset";
}

export function isLiabilityAccount(accountType: string): boolean {
  return getAccountClassification(accountType) === "liability";
}

/**
 * Returns the balance delta for a non-transfer transaction.
 *
 * Asset accounts: income adds, expense subtracts.
 * Liability accounts: expense increases debt, income (payment) reduces debt.
 * Fees always work against the user.
 */
export function getBalanceDelta(
  accountType: string,
  transactionType: "income" | "expense",
  amount: number,
  fee: number
): number {
  const isLiability = isLiabilityAccount(accountType);

  if (transactionType === "income") {
    const delta = amount - fee;
    return isLiability ? -delta : delta;
  } else {
    const delta = amount + fee;
    return isLiability ? delta : -delta;
  }
}

/**
 * Returns { sourceDelta, destDelta } for transfers.
 *
 * Asset -> Asset: source -(amount+fee), dest +received
 * Asset -> Liability: source -(amount+fee), dest -received (paying off debt)
 * Liability -> Asset: source +(amount+fee), dest +received (borrowing)
 * Liability -> Liability: source -(amount+fee), dest +received (debt transfer)
 *
 * `receivedAmount` defaults to `amount`; it differs only for cross-currency
 * transfers, where the source loses one currency and the destination gains
 * another (fee is always in the source currency).
 */
export function getTransferDeltas(
  sourceAccountType: string,
  destAccountType: string,
  amount: number,
  fee: number,
  receivedAmount: number = amount
): { sourceDelta: number; destDelta: number } {
  const sourceIsLiability = isLiabilityAccount(sourceAccountType);
  const destIsLiability = isLiabilityAccount(destAccountType);

  let sourceDelta: number;
  let destDelta: number;

  if (!sourceIsLiability && !destIsLiability) {
    // Asset -> Asset
    sourceDelta = -(amount + fee);
    destDelta = receivedAmount;
  } else if (!sourceIsLiability && destIsLiability) {
    // Asset -> Liability (paying off debt)
    sourceDelta = -(amount + fee);
    destDelta = -receivedAmount;
  } else if (sourceIsLiability && !destIsLiability) {
    // Liability -> Asset (borrowing)
    sourceDelta = amount + fee;
    destDelta = receivedAmount;
  } else {
    // Liability -> Liability (debt transfer)
    sourceDelta = -(amount + fee);
    destDelta = receivedAmount;
  }

  return { sourceDelta, destDelta };
}
