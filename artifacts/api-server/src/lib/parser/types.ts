export type TransactionType =
  | "purchase" | "withdrawal" | "deposit"
  | "transfer" | "refund" | "pre_authorization"
  | "payment" | "fee";

export type TransactionDirection = "income" | "expense";

export type ParseStatus =
  | "matched"
  | "skipped_non_transaction"
  | "skipped_unknown_bank"
  | "skipped_no_pattern"
  | "failed";

export interface ParsedTransaction {
  emailId: string;
  isForwarded: boolean;
  bank: string;
  merchant: string;
  amount: number;
  currency: string;
  direction: TransactionDirection;
  type: TransactionType;
  category: string;
  date: string;
  transactionDate?: string;
  lastFour?: string;
  rawSubject: string;
  rawBodySnippet: string;
  parseStatus: ParseStatus;
  matchedPattern: string;
}
