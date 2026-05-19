import { parseEmail } from "./parser/index.js";
import { htmlToText } from "./parser/index.js";
export type { ParsedTransaction as NewParsedTransaction } from "./parser/index.js";

/**
 * Legacy ParsedTransaction interface — kept for backward compatibility with
 * the email route and mobile app contract.
 */
export interface ParsedTransaction {
  title: string;
  merchant: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  bank: string;
  date: string;
  rawSubject: string;
  /** Last 4 digits of the card/account if mentioned in the email */
  lastFour?: string;
}

/**
 * Main entry point — delegates to the new parser module and maps the result
 * back to the legacy interface expected by routes and the mobile app.
 */
export function parseEmailContent(
  fromAddress: string,
  subject: string,
  textContent: string,
  htmlContent: string,
  emailDate: Date
): ParsedTransaction | null {
  const plainText = textContent || "";
  const htmlText = htmlContent ? htmlToText(htmlContent) : "";

  const result = parseEmail({
    emailId: "", // not available in IMAP flow, only used for logging
    from: fromAddress,
    subject,
    date: emailDate.toISOString(),
    plainText,
    htmlText,
  });

  if (!result) return null;

  const merchantName = result.merchant || (result.type === "withdrawal" ? "Withdrawal" : "Unknown");
  return {
    title: merchantName,
    merchant: merchantName,
    amount: result.amount,
    type: result.direction, // "income" | "expense"
    category: result.category,
    bank: result.bank,
    date: result.date,
    rawSubject: result.rawSubject,
    lastFour: result.lastFour,
  };
}
