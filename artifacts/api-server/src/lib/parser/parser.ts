import { parseForwardedEmail } from "./forwarded.js";
import { extractTransaction } from "./extractor.js";
import { identifyBank, identifyBankFromBody, shouldRejectSubject } from "./bankIdentifier.js";
import { extractLastFour, safeParseDate, extractTransactionDate, categorize, stripSubjectPrefixes } from "./utils.js";
import type { ParsedTransaction, ParseStatus } from "./types.js";

export function parseEmail(params: {
  emailId: string;
  from: string;
  subject: string;
  date: string;
  plainText: string;
  htmlText: string;
}): ParsedTransaction | null {
  const { emailId, from, subject, date, plainText, htmlText } = params;

  // Use plain text if available, otherwise decoded HTML
  const bodyText = (plainText || htmlText).replace(/\s+/g, " ").trim();

  // ── Step 1: Detect forwarded ─────────────────────────────────────────────
  const fwd = parseForwardedEmail(subject, bodyText);

  const effectiveSender  = fwd.isForwarded ? fwd.originalFrom || from : from;
  const effectiveSubject = fwd.isForwarded
    ? fwd.originalSubject || stripSubjectPrefixes(subject)
    : subject;
  const effectiveBody    = fwd.isForwarded ? fwd.innerBody : bodyText;

  // ── Step 2: Identify bank ────────────────────────────────────────────────
  let bank = identifyBank(effectiveSender, "");

  // Subject-level fallback (forwarded where body extraction failed)
  if (!bank) {
    const subj = (effectiveSubject + " " + subject).toLowerCase();
    if (/interac|e-transfer/i.test(subj))                              bank = "Interac";
    else if (/point of sale|transaction alert|debit alert|purchase alert|withdrawal alert|card alert/i.test(subj))
                                                                        bank = "Bank Alert";
    else if (/achat effectu\u00e9|transaction effectu\u00e9e/i.test(subj))       bank = "Alerte Bancaire";
  }

  if (!bank) {
    log("skipped_unknown_bank", emailId, subject);
    return null;
  }

  // ── Step 3: Reject non-transaction emails ────────────────────────────────
  if (shouldRejectSubject(effectiveSubject)) {
    log("skipped_non_transaction", emailId, subject);
    return null;
  }

  // ── Step 4: Extract transaction ──────────────────────────────────────────
  const combined = effectiveSubject + "\n" + effectiveBody;
  const tx = extractTransaction(combined, effectiveSubject);

  if (!tx) {
    log("skipped_no_pattern", emailId, subject, effectiveBody.slice(0, 200));
    return null;
  }

  // ── Step 5: Resolve generic bank names ──────────────────────────────────
  const resolvedBank =
    bank === "Bank Alert" || bank === "Alerte Bancaire"
      ? identifyBankFromBody(effectiveBody)
      : bank;

  return {
    emailId,
    isForwarded: fwd.isForwarded,
    bank: resolvedBank,
    merchant: tx.merchant,
    amount: tx.amount,
    currency: tx.currency,
    direction: tx.direction,
    type: tx.type,
    category: categorize(tx.merchant, tx.direction),
    date: safeParseDate(date),
    transactionDate: extractTransactionDate(effectiveBody),
    lastFour: extractLastFour(combined),
    rawSubject: subject,
    rawBodySnippet: effectiveBody.slice(0, 500),
    parseStatus: "matched",
    matchedPattern: tx.matchedPattern,
  };
}

function log(status: ParseStatus, emailId: string, subject: string, body?: string) {
  const msg = `[BankParser] ${status} | id=${emailId} | subject="${subject}"`;
  if (body) console.debug(msg, `| body="${body}"`);
  else console.debug(msg);
}
