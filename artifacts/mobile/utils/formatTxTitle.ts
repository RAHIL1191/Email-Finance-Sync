/**
 * Format and sanitize transaction titles across the application:
 * 1. Omit all long numbers, store numbers, phone numbers, reference IDs, and alphanumeric hashes
 * 2. Strip payment aggregator prefixes (SQ*, TST*, PAYPAL*, AMZN*, etc.)
 * 3. Keep ONLY words (no numbers or dirty codes)
 * 4. Keep up to 3 clean, descriptive words to properly recognize the transaction
 * 5. Format in clean Title Case
 */

// Common state/province/country codes to omit when following city names
const LOCATION_CODES = new Set([
  "ca", "us", "usa", "tx", "ny", "fl", "on", "bc", "qc", "ab", "wa", "il", "ga",
  "pa", "nc", "oh", "mi", "nj", "va", "az", "ma", "tn", "in", "mo", "md", "wi",
  "co", "mn", "sc", "al", "la", "ky", "or", "ok", "ct", "ut", "ia", "nv", "ar",
  "ms", "ks", "nm", "ne", "wv", "id", "hi", "nh", "me", "ri", "mt", "de", "sd",
  "nd", "ak", "dc", "vt", "wy",
]);

// Normalization dictionary for common banking abbreviations
const WORD_MAP: Record<string, string> = {
  whsle: "Wholesale",
  whlse: "Wholesale",
  mktp: "Market",
  mkt: "Market",
  crd: "Card",
  stn: "Station",
  ctr: "Center",
  cntr: "Center",
  supr: "Super",
  dep: "Deposit",
  amzn: "Amazon",
  wmt: "Walmart",
  wal: "Walmart",
  mart: "Mart",
};

// Known business acronyms to preserve in all-caps
const ACRONYMS = new Set([
  "td", "rbc", "bmo", "cibc", "atm", "ai", "llc", "dvd", "tv", "hbo", "mta", "cvs",
]);

function cleanToken(token: string): string {
  const lower = token.toLowerCase().replace(/[^a-z]/g, "");
  if (WORD_MAP[lower]) return WORD_MAP[lower];
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  if (lower.startsWith("mc") && lower.length > 2) {
    return "Mc" + lower.charAt(2).toUpperCase() + lower.slice(3);
  }
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function normalizeKey(w: string): string {
  const c = cleanToken(w);
  return c.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sanitizeText(raw?: string | null): string {
  let text = (raw || "").trim();

  // Strip payment processor / gateway prefixes
  text = text.replace(
    /^(SQ\s*\*|SQR\*|TST\*|SP\s*\*|PAYPAL\s*\*|PP\*|PYPL\s*\*|APL\*|AMZN\*|AMZ\*|GOOGLE\s*\*|VENMO\s*\*|STRIPE\s*\*|KLARNA\s*\*|CHECK\s*#?)\s*/i,
    ""
  );

  // Strip bracket prefix codes e.g. [CW], [TF], [IN]
  text = text.replace(/^\[[A-Z0-9]{1,4}\]\s*/i, "");

  // Strip phone numbers e.g. 800-925-6278, 1-800-123-4567
  text = text.replace(/\b1?[-.\s]?(8\d{2}|\d{3})[-.\s]\d{3}[-.\s]\d{4}\b/g, " ");

  // Strip URLs e.g. AMZN.COM/BILL, NETFLIX.COM, APPLE.COM/BILL
  text = text.replace(/\b([a-zA-Z0-9-]+\.)+(com|ca|org|net|io|co|us|gov|app)(\/[^\s]*)?/gi, (match) => {
    const p = match.split("/")[0].split(".");
    return p[0].length >= 3 ? p[0] : " ";
  });

  // Strip store markers and number tags e.g. Store #14092, Loc 12, #3928
  text = text.replace(/#\s*[\w\d-]+/g, " ");
  text = text.replace(/\b(store|loc|st|branch|terminal|term|pos|auth|ref|trans|id)\s*#?\s*\d+\b/gi, " ");

  // Replace special characters with spaces
  text = text.replace(/[*_~^+\\/|&@$%=;:,]/g, " ");

  return text;
}

function extractWords(text: string): string[] {
  const tokens = text.split(/\s+/);
  const words: string[] = [];

  for (const raw of tokens) {
    let t = raw.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
    if (!t) continue;
    // Strict: must not contain numbers
    if (/\d/.test(t)) continue;
    // Discard single letters except 'A'
    if (t.length === 1 && t.toLowerCase() !== "a") continue;
    words.push(t);
  }

  return words;
}

/**
 * Sanitizes and extracts up to 3 recognizable, meaningful words from transaction title and merchant.
 */
export function formatTxCleanTitle(rawTitle?: string | null, rawMerchant?: string | null): string {
  const merchantText = sanitizeText(rawMerchant);
  const titleText = sanitizeText(rawTitle);

  const merchantWords = extractWords(merchantText);
  const titleWords = extractWords(titleText);

  const seen = new Set<string>();
  const collected: string[] = [];

  function addWord(w: string) {
    const key = normalizeKey(w);
    if (!key || seen.has(key)) return;
    seen.add(key);
    collected.push(cleanToken(w));
  }

  // 1. Add words from merchant first
  for (const w of merchantWords) {
    if (collected.length < 3) addWord(w);
  }

  // 2. Supplement with descriptive words from the raw title to reach up to 3 recognizable words
  for (const w of titleWords) {
    if (collected.length >= 3) break;
    const key = normalizeKey(w);
    // Ignore isolated state codes if we already have at least 2 words
    if (collected.length >= 2 && LOCATION_CODES.has(key)) continue;
    addWord(w);
  }

  // 3. Remove trailing isolated state code if it got added at the end
  if (collected.length > 0 && LOCATION_CODES.has(normalizeKey(collected[collected.length - 1]))) {
    if (collected.length > 1) collected.pop();
  }

  if (collected.length === 0) return "Transaction";
  return collected.slice(0, 3).join(" ");
}

export default formatTxCleanTitle;
