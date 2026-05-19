import { parseForwardedEmail } from "./forwarded.js";
import { extractTransaction } from "./extractor.js";
import { identifyBank, identifyBankFromBody, shouldRejectSubject } from "./bankIdentifier.js";
import { extractLastFour, safeParseDate, extractTransactionDate, categorize, stripSubjectPrefixes } from "./utils.js";

export interface DebugParseResult {
  from: string;
  subject: string;
  date: string;
  bodySnippet: string;
  isForwarded: boolean;
  originalFrom?: string;
  bankDetected: string | null;
  parseStatus: "matched" | "skipped_non_transaction" | "skipped_unknown_bank" | "skipped_no_pattern";
  rejectReason?: string;
  merchant?: string;
  amount?: number;
  currency?: string;
  direction?: "income" | "expense";
  matchedPattern?: string;
  category?: string;
  lastFour?: string;
}

export function debugParseEmail(params: {
  emailId: string;
  from: string;
  subject: string;
  date: string;
  plainText: string;
  htmlText: string;
}): DebugParseResult {
  const { from, subject, date, plainText, htmlText } = params;

  const bodyText = (plainText || htmlText).replace(/\s+/g, " ").trim();

  // Step 1: Forwarded detection
  const fwd = parseForwardedEmail(subject, bodyText);
  const effectiveSender  = fwd.isForwarded ? fwd.originalFrom || from : from;
  const effectiveSubject = fwd.isForwarded
    ? fwd.originalSubject || stripSubjectPrefixes(subject)
    : subject;
  const effectiveBody = fwd.isForwarded ? fwd.innerBody : bodyText;

  const base: DebugParseResult = {
    from,
    subject,
    date,
    bodySnippet: bodyText.slice(0, 400),
    isForwarded: fwd.isForwarded,
    originalFrom: fwd.isForwarded ? fwd.originalFrom : undefined,
    bankDetected: null,
    parseStatus: "skipped_unknown_bank",
  };

  // Step 2: Bank identification
  let bank = identifyBank(effectiveSender, "");
  if (!bank) {
    const subj = (effectiveSubject + " " + subject).toLowerCase();
    if (/interac|e-transfer/i.test(subj))                                        bank = "Interac";
    else if (/point of sale|transaction alert|debit alert|purchase alert|withdrawal alert|card alert/i.test(subj))
                                                                                  bank = "Bank Alert";
    else if (/achat effectu\u00e9|transaction effectu\u00e9e/i.test(subj))       bank = "Alerte Bancaire";
  }

  base.bankDetected = bank;

  if (!bank) {
    return { ...base, parseStatus: "skipped_unknown_bank", rejectReason: `No bank domain matched for sender: "${effectiveSender}"` };
  }

  // Step 3: Reject non-transaction subjects
  if (shouldRejectSubject(effectiveSubject)) {
    return { ...base, parseStatus: "skipped_non_transaction", rejectReason: `Subject matched reject pattern: "${effectiveSubject}"` };
  }

  // Step 4: Extract transaction
  const combined = effectiveSubject + "\n" + effectiveBody;
  const tx = extractTransaction(combined, effectiveSubject);

  if (!tx) {
    return { ...base, parseStatus: "skipped_no_pattern", rejectReason: `No amount/merchant pattern matched in body` };
  }

  const resolvedBank =
    bank === "Bank Alert" || bank === "Alerte Bancaire"
      ? identifyBankFromBody(effectiveBody)
      : bank;

  return {
    ...base,
    bankDetected: resolvedBank,
    parseStatus: "matched",
    merchant: tx.merchant,
    amount: tx.amount,
    currency: tx.currency,
    direction: tx.direction,
    matchedPattern: tx.matchedPattern,
    category: categorize(tx.merchant, tx.direction),
    lastFour: extractLastFour(combined),
  };
}
