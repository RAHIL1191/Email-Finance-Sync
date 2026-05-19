import { parseDollarAmount, parseFrenchAmount, cleanMerchant } from "./utils.js";
import type { TransactionType, TransactionDirection } from "./types.js";

export interface ExtractedTx {
  amount: number;
  currency: string;
  merchant: string;
  direction: TransactionDirection;
  type: TransactionType;
  matchedPattern: string;
}

// ── Named extractors ──────────────────────────────────────────────────────────
// Each returns ExtractedTx | null. Listed most-specific → least-specific.

// "A $52.49 purchase was made at Tim Hortons"
// "A $89.99 CAD transaction was processed at Loblaws"
function bankCardPurchase(text: string): ExtractedTx | null {
  const m = text.match(
    /[Aa]\s+\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD))?\s+(?:purchase|transaction|payment|charge)\s+(?:was\s+)?(?:made|processed|charged|posted)\s+(?:at|to|from|chez)\s+([^.<\n\r]{2,60})/i
  );
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) return null;
  return { amount, currency: m[2]?.toUpperCase() ?? "CAD", merchant: cleanMerchant(m[3]), direction: "expense", type: "purchase", matchedPattern: "bank_card_purchase" };
}

// "A purchase of $52.49 at Tim Hortons" / "A charge of $99 to Rogers"
function purchaseOf(text: string): ExtractedTx | null {
  const m = text.match(
    /[Aa]\s+(?:purchase|charge|transaction|payment)\s+of\s+\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD|EUR))?\s+(?:was\s+)?(?:made\s+)?(?:at|to|from|chez|\u00e0)\s+([^.<\n\r]{2,60})/i
  );
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;
  return { amount, currency: m[2]?.toUpperCase() ?? "CAD", merchant: cleanMerchant(m[3]), direction: "expense", type: "purchase", matchedPattern: "purchase_of" };
}

// "Your card was used for a $72.00 purchase at Shopify"
function cardUsed(text: string): ExtractedTx | null {
  const m = text.match(
    /your\s+(?:\w+\s+)?card\s+was\s+used\s+(?:for\s+a?\s+|to\s+make\s+a?\s+)?\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD))?\s+(?:\w+\s+)?(?:at|to|from)\s+([^.<\n\r]{2,60})/i
  );
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;
  return { amount, currency: m[2]?.toUpperCase() ?? "CAD", merchant: cleanMerchant(m[3]), direction: "expense", type: "purchase", matchedPattern: "card_used" };
}

// CIBC-style: "Amount of Purchase: $52.49" + "Merchant: TIM HORTONS"
// Must match BEFORE generic structuredFields to avoid grabbing "Threshold Amount"
function cibcStructured(text: string): ExtractedTx | null {
  const amtM = text.match(/amount\s+of\s+(?:purchase|transaction)[\s:]+\$?\s*([\d,]+\.?\d*)\s*(?:(CAD|USD|EUR))?/i);
  if (!amtM) return null;
  const amount = parseFloat(amtM[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;
  const idx = amtM.index ?? 0;
  const window = text.slice(Math.max(0, idx - 300), idx + 500);
  const mM = window.match(/(?:merchant|retailer|location|store|payee|vendor)[\s:]+([^<\n\r|$]{2,60})/i);
  if (!mM) return null;
  return { amount, currency: amtM[2]?.toUpperCase() ?? "CAD", merchant: cleanMerchant(mM[1]), direction: "expense", type: "purchase", matchedPattern: "cibc_structured" };
}

// "Amount: $52.49 CAD  Merchant: Tim Hortons" (structured multi-line)
// Skips "Threshold Amount" lines to avoid grabbing the wrong value
function structuredFields(text: string): ExtractedTx | null {
  // Try "purchase amount" first, then generic "amount" — but skip "threshold amount"
  const amtM =
    text.match(/purchase\s+amount[\s:]+\$?\s*([\d,]+\.?\d*)\s*(?:(CAD|USD|EUR))?/i) ||
    text.match(/(?<!threshold\s)amount[\s:]+\$?\s*([\d,]+\.?\d*)\s*(?:(CAD|USD|EUR))?/i);
  if (!amtM) return null;
  const amount = parseFloat(amtM[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;
  const idx = amtM.index ?? 0;
  const window = text.slice(Math.max(0, idx - 300), idx + 300);
  const mM = window.match(/(?:merchant|retailer|location|store|payee|at|to|vendor)[\s:]+([^<\n\r|$]{2,60})/i);
  if (!mM) return null;
  return { amount, currency: amtM[2]?.toUpperCase() ?? "CAD", merchant: cleanMerchant(mM[1]), direction: "expense", type: "purchase", matchedPattern: "structured_fields" };
}

// TD/Scotiabank plain-text block: "Point of Sale Purchase\nMERCHANT\n$52.49"
function blockFormat(text: string): ExtractedTx | null {
  const m = text.match(
    /(?:Point\s+of\s+Sale\s+Purchase|Debit\s+Card\s+Purchase|Card\s+Purchase|Visa\s+Purchase)\s*\n+\s*([A-Z][^\n$]{2,50})\s*\n+\s*\$\s*([\d,]+\.?\d*)/i
  );
  if (!m) return null;
  const amount = parseFloat(m[2].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;
  return { amount, currency: "CAD", merchant: cleanMerchant(m[1]), direction: "expense", type: "purchase", matchedPattern: "block_format" };
}

// Interac e-Transfer received: "$250 from John" / "John sent you $250"
function interacReceived(text: string): ExtractedTx | null {
  const patterns = [
    /received\s+(?:an?\s+)?(?:interac\s+)?e-?transfer\s+of\s+\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD))?\s+from\s+([^.<\n\r,]{2,50})/i,
    /([A-Z][A-Za-z\s]{2,40})\s+sent\s+you\s+\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD))?/i,
    /\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD))?\s+(?:was\s+)?deposited[^.]*?from\s+([^.<\n\r,]{2,50})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let amount: number, currency: string, sender: string;
    if (re.source.startsWith("([A-Z]")) {
      sender = m[1].trim(); amount = parseFloat(m[2].replace(/,/g, "")); currency = m[3]?.toUpperCase() ?? "CAD";
    } else {
      amount = parseFloat(m[1].replace(/,/g, "")); currency = m[2]?.toUpperCase() ?? "CAD"; sender = m[3]?.trim() ?? "Unknown";
    }
    if (!amount || amount <= 0) continue;
    return { amount, currency, merchant: cleanMerchant(sender), direction: "income", type: "transfer", matchedPattern: "interac_received" };
  }
  return null;
}

// "A direct deposit of $2,500.00 has been credited"
function directDeposit(text: string): ExtractedTx | null {
  const m = text.match(
    /(?:direct\s+deposit|payroll\s+deposit|payroll)\s+of\s+\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD))?\s+(?:has\s+been\s+|was\s+)?(?:received|credited|posted|deposited)/i
  );
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;
  return { amount, currency: m[2]?.toUpperCase() ?? "CAD", merchant: "Direct Deposit", direction: "income", type: "deposit", matchedPattern: "direct_deposit" };
}

// "Pre-authorized payment of $59.99 to Netflix"
function preAuthorized(text: string): ExtractedTx | null {
  const m = text.match(
    /pre[\s-]?authorized?\s+(?:payment|debit|charge|withdrawal)\s+of\s+\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD))?\s+(?:to|from|at)\s+([^.<\n\r,]{2,60})/i
  );
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;
  return { amount, currency: m[2]?.toUpperCase() ?? "CAD", merchant: cleanMerchant(m[3]), direction: "expense", type: "pre_authorization", matchedPattern: "pre_authorized" };
}

// "ATM withdrawal of $200.00" / "withdrawal of $500"
// Merchant is empty for withdrawals since they are from account, not at a merchant
function atmWithdrawal(text: string): ExtractedTx | null {
  const m = text.match(
    /(?:atm|cash|account)?\s*withdrawal\s+(?:of\s+)?\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD))?/i
  );
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;
  return { amount, currency: m[2]?.toUpperCase() ?? "CAD", merchant: "", direction: "expense", type: "withdrawal", matchedPattern: "atm_withdrawal" };
}

// "A refund of $25.00 from Amazon"
function refund(text: string): ExtractedTx | null {
  const m = text.match(
    /refund\s+of\s+\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD))?(?:\s+(?:from|by|at)\s+([^.<\n\r,]{2,50}))?/i
  );
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;
  return { amount, currency: m[2]?.toUpperCase() ?? "CAD", merchant: m[3] ? cleanMerchant(m[3]) : "Refund", direction: "income", type: "refund", matchedPattern: "refund" };
}

// "Bill payment of $120.00 to Hydro-Québec"
function billPayment(text: string): ExtractedTx | null {
  const m = text.match(
    /bill\s+payment\s+of\s+\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD))?\s+to\s+([^.<\n\r,]{2,60})/i
  );
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;
  return { amount, currency: m[2]?.toUpperCase() ?? "CAD", merchant: cleanMerchant(m[3]), direction: "expense", type: "payment", matchedPattern: "bill_payment" };
}

// "$52.49 purchase at Tim Hortons"
function amountFirst(text: string): ExtractedTx | null {
  const m = text.match(
    /\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD|EUR))?\s+(?:purchase|transaction|charge|payment|debit)\s+(?:at|from|to|chez)\s+([^.<\n\r]{2,60})/i
  );
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;
  return { amount, currency: m[2]?.toUpperCase() ?? "CAD", merchant: cleanMerchant(m[3]), direction: "expense", type: "purchase", matchedPattern: "amount_first" };
}

// French: "Un achat de 52,49 $ chez Tim Hortons"
function frenchPurchase(text: string): ExtractedTx | null {
  const m = text.match(
    /(?:un\s+achat|une\s+transaction|un\s+paiement)\s+de\s+([\d\s]+,\d{2})\s*\$\s+(?:a\s+[e\u00e9]t[e\u00e9]\s+effectu[e\u00e9]e?\s+)?(?:chez|\u00e0|de|pour)\s+([^.<\n\r,]{2,60})/i
  );
  if (!m) return null;
  const parsed = parseFrenchAmount(m[1]);
  if (!parsed || parsed.amount <= 0) return null;
  return { amount: parsed.amount, currency: "CAD", merchant: cleanMerchant(m[2]), direction: "expense", type: "purchase", matchedPattern: "french_purchase" };
}

// Last resort — any "$XX.XX ... at MERCHANT" in 150-char window
function lastResort(text: string): ExtractedTx | null {
  const amtM = text.match(/\$\s*([\d,]+\.\d{2})\s*(?:(CAD|USD))?/i);
  if (!amtM) return null;
  const amount = parseFloat(amtM[1].replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0 || amount > 100_000) return null;
  const after = text.slice((amtM.index ?? 0) + amtM[0].length, (amtM.index ?? 0) + 150);
  const mM = after.match(/\b(?:at|from|to|chez)\s+([A-Z0-9][A-Za-z0-9\s&'.,-]{2,50})/i);
  if (!mM) return null;
  return { amount, currency: amtM[2]?.toUpperCase() ?? "CAD", merchant: cleanMerchant(mM[1]), direction: "expense", type: "purchase", matchedPattern: "last_resort" };
}

// ── Main extraction cascade ───────────────────────────────────────────────────
export function extractTransaction(
  bodyText: string,
  subjectText: string
): ExtractedTx | null {
  const isWithdrawal = /withdrawal/i.test(subjectText) || /withdrawal\s+alert/i.test(bodyText);

  // If it's a withdrawal, try atmWithdrawal first
  if (isWithdrawal) {
    const wr = atmWithdrawal(bodyText) || atmWithdrawal(subjectText);
    if (wr) return wr;
  }

  const extractors = [
    bankCardPurchase, cardUsed, blockFormat,
    cibcStructured, structuredFields, purchaseOf, billPayment,
    preAuthorized, atmWithdrawal, interacReceived,
    directDeposit, refund, frenchPurchase,
    amountFirst, lastResort,
  ];

  for (const fn of extractors) {
    const r = fn(bodyText);
    if (r) {
      // If subject says withdrawal, override merchant and type
      if (isWithdrawal) {
        return { ...r, merchant: "", type: "withdrawal", matchedPattern: r.matchedPattern + "_withdrawal" };
      }
      return r;
    }
  }
  // Try subject line as fallback (skip last_resort)
  for (const fn of extractors.slice(0, -1)) {
    const r = fn(subjectText);
    if (r) {
      if (isWithdrawal) {
        return { ...r, merchant: "", type: "withdrawal", matchedPattern: r.matchedPattern + "_withdrawal" };
      }
      return r;
    }
  }
  return null;
}
