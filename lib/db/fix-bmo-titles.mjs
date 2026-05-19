/**
 * fix-bmo-titles.mjs
 * Cleans up garbled BMO transaction titles already in the DB.
 */
import pg from "pg";
const { Client } = pg;

const TARGET = "postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// ── Cleaning helpers ──────────────────────────────────────────────────────────

const LOWERCASE_WORDS = new Set(["from","to","and","or","of","in","at","by","for","the","a","an"]);
function titleCase(str) {
  return str
    .trim()
    .replace(/\b\w+/g, (w, offset) => {
      const lower = w.toLowerCase();
      if (offset > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .replace(/\b(Bmo|Cibc|Hsbc|Rbc|Td|Atm|Pos|Rrsp|Tfsa|Gic|Msf)\b/gi, (m) => m.toUpperCase());
}

function cleanBmoTitle(raw) {
  if (!raw) return "Transaction";

  let s = raw.trim();

  // ── Strip BMO bracket prefix codes [CW], [TF], [IN], [SC], [DS], [PP] ────
  s = s.replace(/^\[[A-Z]{2,3}\]\s*/i, "");

  // ── Interac received ──────────────────────────────────────────────────────
  const interacIn = s.match(/^VIR\s+INTERAC\s+REC[UÇ]?\s+([A-Z][A-Z\s]+?)(?:\s+\d{10,})?$/i);
  if (interacIn) return `Interac from ${titleCase(interacIn[1])}`;

  // ── Interac sent ──────────────────────────────────────────────────────────
  const interacOut = s.match(/^VIR\s+INTERAC\s+ENV[OO]Y[EÉ]?\s+([A-Z][A-Z\s]+?)(?:\s+\d{10,})?$/i);
  if (interacOut) return `Interac to ${titleCase(interacOut[1])}`;

  // ── Standalone interest code ─────────────────────────────────────────────
  if (/^$/.test(s) || s.toUpperCase() === 'IN') return 'Interest';

  // ── Wire / internal transfer ───────────────────────────────────────────────
  if (/^TF[\s#]/i.test(s) || /^VIREMENT/i.test(s)) {
    // Remove ref numbers: "TF 2145#8885-982" → check if anything meaningful left
    const clean = s
      .replace(/^TF\s*/i, "")
      .replace(/\s*#[\d\-]+/g, "")
      .replace(/\b\d+\b/g, "")  // remove pure number tokens
      .replace(/\s+/g, " ")
      .trim();
    if (!clean || clean.length < 3) return "Wire Transfer";
    return titleCase(clean);
  }

  // ── Mortgage / HYP ────────────────────────────────────────────────────────
  if (/MTG|HYP/i.test(s)) return "Mortgage Payment";

  // ── Remove trailing long transaction IDs (15+ digits) ────────────────────
  s = s.replace(/\s+\d{10,}$/, "").trim();

  // ── Remove trailing reference codes like #1234-5678 ──────────────────────
  s = s.replace(/\s+#[\d\-]+$/, "").trim();

  // ── Remove trailing 4-digit store numbers " 1234" ────────────────────────
  s = s.replace(/\s+\d{4}$/, "").trim();

  // ── Clean known Plaid-mangled merchant_name abbreviations for BMO ─────────
  const abbrevMap = {
    "cw tf":          "Wire Transfer",
    "cw vir interac": "Interac Transfer",
    "in":             "Interest",
    "[in]":           "Interest",
    "sc":             "Service Fee",
    "dshydro":        "Hydro",
    "dsws investments inv pla": "Wealthsimple Investments",
    "dsws investments": "Wealthsimple",
    "dscl cad s&y insu": "Sun Life Insurance",
    "dscl cad":       "Canada Life",
    "scsva":          "Service Fee",
    "scprogramme performance": "Programmes & Fees",
    "sc remboursement des frais": "Service Fee Refund",
  };
  const lower = s.toLowerCase();
  for (const [pattern, replacement] of Object.entries(abbrevMap)) {
    if (lower === pattern || lower.startsWith(pattern + " ")) return replacement;
  }

  // ── French service charge patterns ───────────────────────────────────────
  if (/remboursement des frais/i.test(s)) return "Service Fee Refund";
  if (/programme performance/i.test(s))   return "Programme Performance Fee";

  if (!s || s.length < 2) return "Transaction";
  return titleCase(s);
}

// ── Connect & fix ─────────────────────────────────────────────────────────────

const c = new Client({ connectionString: TARGET, ssl: { rejectUnauthorized: false } });
await c.connect();

const rows = await c.query(
  `SELECT id, title FROM transactions WHERE device_id = 'migrate-script'`
);

console.log(`Found ${rows.rows.length} BMO transactions to clean.\n`);

let updated = 0;
for (const row of rows.rows) {
  const cleaned = cleanBmoTitle(row.title);
  if (cleaned !== row.title) {
    console.log(`  "${row.title}"  →  "${cleaned}"`);
    await c.query(`UPDATE transactions SET title = $1, bank = $2 WHERE id = $3`, [cleaned, cleaned, row.id]);
    updated++;
  }
}

// Fix [IN] → Interest entries that were previously saved as "Transaction"
const interestFix = await c.query(
  `UPDATE transactions SET title='Interest', bank='Interest'
   WHERE device_id='migrate-script' AND title='Transaction'`
);
console.log(`  [IN] Interest fix: ${interestFix.rowCount} rows updated`);

await c.end();
console.log(`\n✅  Updated ${updated + interestFix.rowCount} / ${rows.rows.length} titles.`);
