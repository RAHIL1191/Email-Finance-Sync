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

interface BankPattern {
  bankName: string;
  fromPatterns: RegExp[];
  subjectPatterns: RegExp[];
  parsers: Array<(text: string, subject: string) => ParsedTransaction | null>;
}

function categorizeFrom(merchant: string): string {
  const m = merchant.toLowerCase();
  // Shopping
  if (/amazon|ebay|etsy|walmart|target|best buy|costco|shop|store|market|mall|tj maxx|nordstrom|macy|gap|h&m|zara|uniqlo|canadian tire|home depot|rona|winners|sport chek|sail|la vie en rose|reitmans|simons|bay\b|the source/.test(m)) return "Shopping";
  // Food & dining
  if (/uber eats|doordash|grubhub|postmates|instacart|chipotle|mcdonald|starbucks|dunkin|chick|pizza|taco|subway|burger|restaurant|cafe|diner|sushi|thai|chinese|italian|grill|kitchen|bakery|eatery|food|tim hortons|harvey's|swiss chalet|boston pizza|second cup|a&w|dairy queen|wendys|popeyes|poutine|beavertails|kelsey|montana|earls|moxies|joeys|cactus club/.test(m)) return "Food";
  // Groceries (CA + US)
  if (/whole foods|trader joe|kroger|publix|safeway|aldi|wegmans|fresh market|sprouts|grocery|loblaws|sobeys|metro|no frills|freshco|food basics|iga|maxi|provigo|super c|farm boy|co-op|superstore|atlantic superstore|real canadian/.test(m)) return "Groceries";
  // Entertainment
  if (/netflix|spotify|hulu|disney|hbo|apple tv|amazon prime|youtube premium|twitch|gaming|game|xbox|playstation|steam|crave|tubi|apple music|deezer|sportsnet|tsn/.test(m)) return "Entertainment";
  // Transport
  if (/uber|lyft|grab|taxi|transit|metro|subway|bus|train|parking|gas|shell|bp|chevron|exxon|mobil|citgo|delta|united|southwest|american airlines|hotel|airbnb|air canada|westjet|porter|via rail|presto|esso|petro-canada|husky|pioneer/.test(m)) return "Transport";
  // Housing
  if (/rent|mortgage|lease|property|hoa|strata|condo/.test(m)) return "Housing";
  // Utilities (CA + US)
  if (/electric|hydro|gas|water|internet|phone|at&t|verizon|comcast|xfinity|spectrum|t-mobile|sprint|rogers|bell\b|telus|fido|koodo|virgin mobile|shaw|videotron|cogeco|eastlink|sasktel|mts|enbridge|union gas|fortis/.test(m)) return "Utilities";
  // Health
  if (/doctor|hospital|pharmacy|cvs|walgreens|rite aid|health|dental|vision|clinic|medical|care|shoppers drug mart|jean coutu|pharmaprix|rexall|london drugs/.test(m)) return "Health";
  // Insurance
  if (/insurance|geico|progressive|state farm|allstate|liberty mutual|farmers|intact|aviva|desjardins assurance|co-operators|belairdirect|td insurance|rbc insurance/.test(m)) return "Insurance";
  // Income
  if (/salary|payroll|deposit|direct deposit|paycheck|dividend|refund|transfer in|credit from/.test(m)) return "Income";
  return "Other";
}

/** Parse a Canadian French-format amount like "1 234,56 $" or "1234,56$" → 1234.56 */
function parseFrenchAmount(text: string): number | null {
  // French: "1 234,56 $" or "1234,56$"
  const m = text.match(/([\d\s]+),(\d{2})\s*\$/) || text.match(/(\d[\d\s]*),(\d{2})/);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/\s/g, "") + "." + m[2]);
  return isNaN(val) ? null : val;
}

/** Parse a standard dollar amount like "$1,234.56" */
function parseDollarAmount(text: string): number | null {
  const m = text.match(/\$\s*([\d,]+\.?\d*)/);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/,/g, ""));
  return isNaN(val) ? null : val;
}

const BANK_PATTERNS: BankPattern[] = [
  // Chase
  {
    bankName: "Chase",
    fromPatterns: [/@chase\.com/i, /jpmorgan/i],
    subjectPatterns: [/transaction|charge|purchase|alert|activity|deposit|credit/i],
    parsers: [
      (text, subject) => {
        // Chase: "A charge of $89.99 at Amazon has been authorized"
        const chargeMatch = text.match(/(?:charge|purchase|transaction)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:at|from|to)\s+([^<\n\r,\.]+)/i);
        if (chargeMatch) {
          const amount = parseFloat(chargeMatch[1].replace(/,/g, ""));
          const merchant = chargeMatch[2].trim();
          return {
            title: merchant,
            merchant,
            amount,
            type: "expense",
            category: categorizeFrom(merchant),
            bank: "Chase",
            date: new Date().toISOString(),
            rawSubject: subject,
          };
        }
        // Chase deposit
        const depositMatch = text.match(/deposit\s+of\s+\$?([\d,]+\.?\d*)\s+(?:has been made|posted|received)/i);
        if (depositMatch) {
          const amount = parseFloat(depositMatch[1].replace(/,/g, ""));
          return {
            title: "Chase Deposit",
            merchant: "Chase Deposit",
            amount,
            type: "income",
            category: "Income",
            bank: "Chase",
            date: new Date().toISOString(),
            rawSubject: subject,
          };
        }
        return null;
      },
    ],
  },

  // Bank of America
  {
    bankName: "Bank of America",
    fromPatterns: [/@bankofamerica\.com/i, /bofa/i],
    subjectPatterns: [/transaction|charge|purchase|alert|deposit|credit/i],
    parsers: [
      (text, subject) => {
        // BofA: "A $89.99 transaction has been made with your Bank of America"
        const match = text.match(/\$?([\d,]+\.?\d*)\s+(?:transaction|purchase|charge|debit)\s+(?:has been made|was made|posted)\s+(?:with your|at|from)?\s*([^<\n\r,\.]*)/i);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ""));
          const merchant = match[2]?.trim() || subject;
          return {
            title: merchant || "BofA Transaction",
            merchant: merchant || "BofA Transaction",
            amount,
            type: "expense",
            category: categorizeFrom(merchant || ""),
            bank: "Bank of America",
            date: new Date().toISOString(),
            rawSubject: subject,
          };
        }
        return null;
      },
    ],
  },

  // American Express
  {
    bankName: "Amex",
    fromPatterns: [/@americanexpress\.com/i, /american express/i],
    subjectPatterns: [/transaction|charge|purchase|alert|activity/i],
    parsers: [
      (text, subject) => {
        // Amex: "A charge of $XX.XX from MERCHANT"
        const match = text.match(/(?:charge|purchase|transaction)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:at|from|to)\s+([^<\n\r,\.]+)/i);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ""));
          const merchant = match[2].trim();
          return {
            title: merchant,
            merchant,
            amount,
            type: "expense",
            category: categorizeFrom(merchant),
            bank: "Amex",
            date: new Date().toISOString(),
            rawSubject: subject,
          };
        }
        // Amex generic amount extract
        const amountMatch = text.match(/\$\s*([\d,]+\.\d{2})/);
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
          const merchantMatch = text.match(/(?:at|from|to|merchant:)\s+([A-Z][A-Za-z0-9 &'-]{2,30})/);
          const merchant = merchantMatch ? merchantMatch[1].trim() : "Amex Charge";
          return {
            title: merchant,
            merchant,
            amount,
            type: "expense",
            category: categorizeFrom(merchant),
            bank: "Amex",
            date: new Date().toISOString(),
            rawSubject: subject,
          };
        }
        return null;
      },
    ],
  },

  // Wells Fargo
  {
    bankName: "Wells Fargo",
    fromPatterns: [/@wellsfargo\.com/i, /wells fargo/i],
    subjectPatterns: [/transaction|charge|purchase|alert|deposit/i],
    parsers: [
      (text, subject) => {
        const match = text.match(/(?:purchase|transaction|charge)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:at|from|with|to)\s+([^<\n\r,\.]+)/i);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ""));
          const merchant = match[2].trim();
          return {
            title: merchant,
            merchant,
            amount,
            type: "expense",
            category: categorizeFrom(merchant),
            bank: "Wells Fargo",
            date: new Date().toISOString(),
            rawSubject: subject,
          };
        }
        return null;
      },
    ],
  },

  // Capital One
  {
    bankName: "Capital One",
    fromPatterns: [/@capitalone\.com/i, /capital one/i],
    subjectPatterns: [/transaction|charge|purchase|alert/i],
    parsers: [
      (text, subject) => {
        // Capital One: "You made a purchase of $XX.XX at MERCHANT"
        const match = text.match(/(?:purchase|transaction|charge)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:at|from|to)\s+([^<\n\r,\.]+)/i);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ""));
          const merchant = match[2].trim();
          return {
            title: merchant,
            merchant,
            amount,
            type: "expense",
            category: categorizeFrom(merchant),
            bank: "Capital One",
            date: new Date().toISOString(),
            rawSubject: subject,
          };
        }
        return null;
      },
    ],
  },

  // Citi
  {
    bankName: "Citi",
    fromPatterns: [/@citi\.com/i, /citibank/i],
    subjectPatterns: [/transaction|charge|purchase|alert|activity/i],
    parsers: [
      (text, subject) => {
        const match = text.match(/(?:transaction|purchase|charge)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:was made|at|from|to)\s+([^<\n\r,\.]*)/i);
        if (match) {
          const amount = parseFloat(match[1].replace(/,/g, ""));
          const merchant = match[2]?.trim() || "Citi Charge";
          return {
            title: merchant,
            merchant,
            amount,
            type: "expense",
            category: categorizeFrom(merchant),
            bank: "Citi",
            date: new Date().toISOString(),
            rawSubject: subject,
          };
        }
        return null;
      },
    ],
  },

  // ── Canadian Banks ──────────────────────────────────────────────────────────

  // TD Bank (TD Canada Trust)
  {
    bankName: "TD",
    fromPatterns: [/@td\.com/i, /@tdbank\.com/i, /@tdbankgroup\.com/i, /td canada trust/i],
    subjectPatterns: [/transaction|purchase|charge|alert|alerte|achat|dépôt|deposit/i],
    parsers: [
      (text, subject) => {
        // "A purchase of $XX.XX was made at MERCHANT with your TD Card"
        // "Your TD card was used for a $XX.XX purchase at MERCHANT"
        const patterns = [
          /(?:purchase|transaction|charge)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:was made\s+)?(?:at|from|chez)\s+([^<\n\r,\.]+)/i,
          /(?:used for a|made a)\s+\$?([\d,]+\.?\d*)\s+purchase\s+at\s+([^<\n\r,\.]+)/i,
          /TD[^$]*\$\s*([\d,]+\.?\d*)\s+(?:at|chez|from)\s+([^<\n\r,\.]+)/i,
        ];
        for (const pat of patterns) {
          const m = text.match(pat);
          if (m) {
            const amount = parseFloat(m[1].replace(/,/g, ""));
            const merchant = m[2].trim();
            if (amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "TD", date: new Date().toISOString(), rawSubject: subject };
          }
        }
        // French: "Un achat de 1 234,56 $ a été effectué chez MERCHANT"
        const frM = text.match(/(?:achat|transaction)\s+de\s+([\d\s]+,\d{2})\s*\$\s+(?:a été effectué(?:e)?\s+)?(?:chez|à|de)\s+([^<\n\r,\.]+)/i);
        if (frM) {
          const amount = parseFrenchAmount(frM[1] + "," + "00");
          const amount2 = parseFrenchAmount(frM[1]);
          const finalAmt = amount2 ?? amount;
          const merchant = frM[2].trim();
          if (finalAmt && finalAmt > 0) return { title: merchant, amount: finalAmt, type: "expense", category: categorizeFrom(merchant), bank: "TD", date: new Date().toISOString(), rawSubject: subject };
        }
        return null;
      },
    ],
  },

  // RBC (Royal Bank of Canada)
  {
    bankName: "RBC",
    fromPatterns: [/@rbc\.com/i, /@royalbank\.com/i, /royal bank/i],
    subjectPatterns: [/transaction|purchase|charge|alert|alerte|activity|deposit/i],
    parsers: [
      (text, subject) => {
        // "A purchase of $XX.XX was made at MERCHANT on your RBC card"
        // "Your RBC account balance has changed. Amount: $XX.XX  Merchant: MERCHANT"
        const patterns = [
          /(?:purchase|transaction|charge)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:was made\s+)?(?:at|from|on|chez)\s+([^<\n\r,\.]+)/i,
          /amount:\s*\$?([\d,]+\.?\d*).*?merchant:\s+([^<\n\r,\.]+)/is,
          /RBC[^$]*\$\s*([\d,]+\.?\d*)[^A-Z]*([A-Z][A-Za-z0-9 &'*-]{2,35})/,
        ];
        for (const pat of patterns) {
          const m = text.match(pat);
          if (m) {
            const amount = parseFloat(m[1].replace(/,/g, ""));
            const merchant = m[2].trim();
            if (amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "RBC", date: new Date().toISOString(), rawSubject: subject };
          }
        }
        // French
        const frM = text.match(/(?:achat|transaction)\s+de\s+([\d\s]+,\d{2})\s*\$\s+(?:effectué(?:e)?\s+)?(?:chez|à)\s+([^<\n\r,\.]+)/i);
        if (frM) {
          const amount = parseFrenchAmount(frM[1]);
          const merchant = frM[2].trim();
          if (amount && amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "RBC", date: new Date().toISOString(), rawSubject: subject };
        }
        return null;
      },
    ],
  },

  // Scotiabank
  {
    bankName: "Scotiabank",
    fromPatterns: [/@scotiabank\.com/i, /@scotiabankmessages\.com/i, /scotia/i],
    subjectPatterns: [/transaction|purchase|charge|alert|alerte|activity/i],
    parsers: [
      (text, subject) => {
        // "A purchase of $XX.XX was made at MERCHANT on your Scotiabank card"
        // "Transaction Alert: $XX.XX at MERCHANT"
        const patterns = [
          /(?:purchase|transaction|charge)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:was made\s+)?(?:at|from|chez)\s+([^<\n\r,\.]+)/i,
          /Transaction Alert[^$]*\$\s*([\d,]+\.?\d*)\s+(?:at|from)\s+([^<\n\r,\.]+)/i,
          /\$\s*([\d,]+\.?\d*)\s+(?:at|from|purchase at)\s+([A-Z][A-Za-z0-9 &'*#-]{2,40})/,
        ];
        for (const pat of patterns) {
          const m = text.match(pat);
          if (m) {
            const amount = parseFloat(m[1].replace(/,/g, ""));
            const merchant = m[2].trim();
            if (amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "Scotiabank", date: new Date().toISOString(), rawSubject: subject };
          }
        }
        // French
        const frM = text.match(/(?:achat|transaction)\s+de\s+([\d\s]+,\d{2})\s*\$\s+(?:chez|à)\s+([^<\n\r,\.]+)/i);
        if (frM) {
          const amount = parseFrenchAmount(frM[1]);
          const merchant = frM[2].trim();
          if (amount && amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "Scotiabank", date: new Date().toISOString(), rawSubject: subject };
        }
        return null;
      },
    ],
  },

  // BMO (Bank of Montreal)
  {
    bankName: "BMO",
    fromPatterns: [/@bmo\.com/i, /bank of montreal/i, /banque de montréal/i],
    subjectPatterns: [/transaction|purchase|charge|alert|alerte|activity|achat/i],
    parsers: [
      (text, subject) => {
        // "Your BMO card ending in XXXX was used for a $XX.XX purchase at MERCHANT"
        // "A purchase of $XX.XX was made at MERCHANT"
        const patterns = [
          /(?:used for a|for a)\s+\$?([\d,]+\.?\d*)\s+purchase\s+at\s+([^<\n\r,\.]+)/i,
          /(?:purchase|transaction|charge)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:was made\s+)?(?:at|from|chez)\s+([^<\n\r,\.]+)/i,
          /BMO[^$]*\$\s*([\d,]+\.?\d*)[^A-Z]*([A-Z][A-Za-z0-9 &'*-]{2,35})/,
        ];
        for (const pat of patterns) {
          const m = text.match(pat);
          if (m) {
            const amount = parseFloat(m[1].replace(/,/g, ""));
            const merchant = m[2].trim();
            if (amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "BMO", date: new Date().toISOString(), rawSubject: subject };
          }
        }
        // French: "Un achat de 1 234,56 $ a été effectué chez MERCHANT avec votre carte BMO"
        const frM = text.match(/(?:achat|transaction)\s+de\s+([\d\s]+,\d{2})\s*\$\s+(?:a été effectué(?:e)?\s+)?(?:chez|à)\s+([^<\n\r,\.]+)/i);
        if (frM) {
          const amount = parseFrenchAmount(frM[1]);
          const merchant = frM[2].trim();
          if (amount && amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "BMO", date: new Date().toISOString(), rawSubject: subject };
        }
        return null;
      },
    ],
  },

  // CIBC
  {
    bankName: "CIBC",
    fromPatterns: [/@cibc\.com/i, /cibc/i],
    subjectPatterns: [/transaction|purchase|charge|alert|alerte|activity/i],
    parsers: [
      (text, subject) => {
        // "A purchase of $XX.XX was made at MERCHANT on your CIBC card"
        // "CIBC: $XX.XX purchase at MERCHANT"
        const patterns = [
          /(?:purchase|transaction|charge)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:was made\s+)?(?:at|from|chez)\s+([^<\n\r,\.]+)/i,
          /CIBC[^$]*\$\s*([\d,]+\.?\d*)\s+(?:purchase\s+)?(?:at|from)\s+([^<\n\r,\.]+)/i,
          /\$\s*([\d,]+\.?\d*)\s+(?:purchase|transaction)\s+at\s+([^<\n\r,\.]+)/i,
        ];
        for (const pat of patterns) {
          const m = text.match(pat);
          if (m) {
            const amount = parseFloat(m[1].replace(/,/g, ""));
            const merchant = m[2].trim();
            if (amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "CIBC", date: new Date().toISOString(), rawSubject: subject };
          }
        }
        // French
        const frM = text.match(/(?:achat|transaction)\s+de\s+([\d\s]+,\d{2})\s*\$\s+(?:chez|à)\s+([^<\n\r,\.]+)/i);
        if (frM) {
          const amount = parseFrenchAmount(frM[1]);
          const merchant = frM[2].trim();
          if (amount && amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "CIBC", date: new Date().toISOString(), rawSubject: subject };
        }
        return null;
      },
    ],
  },

  // Tangerine
  {
    bankName: "Tangerine",
    fromPatterns: [/@tangerine\.ca/i, /tangerine bank/i],
    subjectPatterns: [/transaction|purchase|charge|alert|activity|deposit/i],
    parsers: [
      (text, subject) => {
        // "You just made a $XX.XX purchase at MERCHANT"
        // "A purchase of $XX.XX at MERCHANT was made on your Tangerine account"
        const patterns = [
          /(?:made a|just made a)\s+\$?([\d,]+\.?\d*)\s+purchase\s+at\s+([^<\n\r,\.]+)/i,
          /(?:purchase|transaction|charge)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:at|from)\s+([^<\n\r,\.]+)/i,
          /\$\s*([\d,]+\.?\d*)\s+(?:purchase|transaction)\s+(?:at|from)\s+([^<\n\r,\.]+)/i,
        ];
        for (const pat of patterns) {
          const m = text.match(pat);
          if (m) {
            const amount = parseFloat(m[1].replace(/,/g, ""));
            const merchant = m[2].trim();
            if (amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "Tangerine", date: new Date().toISOString(), rawSubject: subject };
          }
        }
        return null;
      },
    ],
  },

  // National Bank of Canada (Banque Nationale)
  {
    bankName: "National Bank",
    fromPatterns: [/@nbc\.ca/i, /@bnc\.ca/i, /national bank/i, /banque nationale/i],
    subjectPatterns: [/transaction|purchase|charge|alert|alerte|achat|activité/i],
    parsers: [
      (text, subject) => {
        // English: "A transaction of $XX.XX was made at MERCHANT"
        const enM = text.match(/(?:purchase|transaction|charge)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:was made\s+)?(?:at|from|chez)\s+([^<\n\r,\.]+)/i);
        if (enM) {
          const amount = parseFloat(enM[1].replace(/,/g, ""));
          const merchant = enM[2].trim();
          if (amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "National Bank", date: new Date().toISOString(), rawSubject: subject };
        }
        // French: "Une transaction de 1 234,56 $ a été effectuée chez MERCHANT"
        const frM = text.match(/(?:transaction|achat)\s+de\s+([\d\s]+,\d{2})\s*\$\s+(?:a été effectué(?:e)?\s+)?(?:chez|à|de)\s+([^<\n\r,\.]+)/i);
        if (frM) {
          const amount = parseFrenchAmount(frM[1]);
          const merchant = frM[2].trim();
          if (amount && amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "National Bank", date: new Date().toISOString(), rawSubject: subject };
        }
        return null;
      },
    ],
  },

  // Desjardins (French-first credit union)
  {
    bankName: "Desjardins",
    fromPatterns: [/@desjardins\.com/i, /@caisse\.desjardins\.com/i, /desjardins/i],
    subjectPatterns: [/transaction|achat|alerte|alert|purchase|activité/i],
    parsers: [
      (text, subject) => {
        // French: "Un achat de 1 234,56 $ a été effectué chez MERCHANT avec votre carte Desjardins"
        const frM = text.match(/(?:achat|transaction)\s+de\s+([\d\s]+,\d{2})\s*\$\s+(?:a été effectué(?:e)?\s+)?(?:chez|à|de)\s+([^<\n\r,\.]+)/i);
        if (frM) {
          const amount = parseFrenchAmount(frM[1]);
          const merchant = frM[2].trim();
          if (amount && amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "Desjardins", date: new Date().toISOString(), rawSubject: subject };
        }
        // English fallback
        const enM = text.match(/(?:purchase|transaction|charge)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:at|from|chez)\s+([^<\n\r,\.]+)/i);
        if (enM) {
          const amount = parseFloat(enM[1].replace(/,/g, ""));
          const merchant = enM[2].trim();
          if (amount > 0) return { title: merchant, amount, type: "expense", category: categorizeFrom(merchant), bank: "Desjardins", date: new Date().toISOString(), rawSubject: subject };
        }
        return null;
      },
    ],
  },

  // EQ Bank
  {
    bankName: "EQ Bank",
    fromPatterns: [/@eqbank\.ca/i, /eq bank/i, /equitable bank/i],
    subjectPatterns: [/transaction|transfer|deposit|alert|activity/i],
    parsers: [
      (text, subject) => {
        const m = text.match(/(?:transfer|deposit|transaction)\s+of\s+\$?([\d,]+\.?\d*)\s+(?:was|has been)?\s*(?:made|sent|received|completed)\s*(?:to|from|at)?\s*([^<\n\r,\.]*)/i);
        if (m) {
          const amount = parseFloat(m[1].replace(/,/g, ""));
          const merchant = m[2]?.trim() || "EQ Bank Transfer";
          const isCredit = /deposit|received|credit/i.test(text.slice(0, 200));
          if (amount > 0) return { title: merchant || "EQ Bank Transfer", amount, type: isCredit ? "income" : "expense", category: isCredit ? "Income" : categorizeFrom(merchant), bank: "EQ Bank", date: new Date().toISOString(), rawSubject: subject };
        }
        return null;
      },
    ],
  },

  // ── End Canadian Banks ───────────────────────────────────────────────────────

  // Generic bank alert fallback
  {
    bankName: "Bank",
    fromPatterns: [/alert|notify|notification|noreply/i],
    subjectPatterns: [/transaction|charge|purchase|alert|debit|credit|deposit/i],
    parsers: [
      (text, subject) => {
        // Generic: look for dollar amounts and merchant patterns
        const amountMatch = text.match(/\$\s*([\d,]+\.\d{2})/);
        if (!amountMatch) return null;
        const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
        if (amount <= 0 || amount > 100000) return null;

        // Try to find merchant name
        const merchantPatterns = [
          /(?:at|from|to|merchant:?|vendor:?)\s+([A-Z][A-Za-z0-9 &'*-]{2,40})/,
          /(?:purchase|transaction|charge)\s+(?:at|from)\s+([A-Z][A-Za-z0-9 &'*-]{2,40})/,
        ];
        let merchant = "Transaction";
        for (const pat of merchantPatterns) {
          const m = text.match(pat);
          if (m) { merchant = m[1].trim(); break; }
        }

        // Determine if income or expense
        const isCredit = /credit|deposit|refund|payment received|direct deposit/i.test(subject + " " + text.slice(0, 200));
        const type: "income" | "expense" = isCredit ? "income" : "expense";

        return {
          title: merchant,
          amount,
          type,
          category: isCredit ? "Income" : categorizeFrom(merchant),
          bank: "Bank",
          date: new Date().toISOString(),
          rawSubject: subject,
        };
      },
    ],
  },
];

/**
 * Try to extract the original sender address from a forwarded email body.
 *
 * Gmail plain-text forwarding inserts a header like:
 *   ---------- Forwarded message ---------
 *   From: TD Alerts <alerts@td.com>
 *   Date: ...
 *
 * Outlook / Apple Mail use slightly different wording but the "From:" line is always present.
 */
function extractForwardedFrom(text: string): string {
  // Match the first "From:" line that appears after a forwarding header marker
  const fwdMarkers = [
    /(?:Forwarded message|Begin forwarded message|Original Message|Mensaje reenviado|Message transféré)[^\n]*\n.*?From:\s*([^\n]+)/is,
    // Simpler fallback: any "From:" line in the body that contains an @ symbol
    /\bFrom:\s*([^\n]*@[^\n]+)/i,
  ];
  for (const pat of fwdMarkers) {
    const m = text.match(pat);
    if (m) {
      // Extract just the email address from something like "TD Alerts <alerts@td.com>"
      const emailMatch = m[1].match(/<([^>]+)>/) || m[1].match(/([^\s,]+@[^\s,]+)/);
      if (emailMatch) return emailMatch[1].trim();
    }
  }
  return "";
}

/**
 * Strip common forwarding/reply prefixes from a subject line so pattern matching
 * still works on "Fwd: TD Card Alert" → "TD Card Alert".
 */
function stripSubjectPrefixes(subject: string): string {
  return subject.replace(/^(Fwd?:|Re:|TR:|Réf?:|AW:|\[Fwd\])\s*/gi, "").trim();
}

/**
 * Extract the last 4 digits of a card/account number from email text.
 * Handles patterns like "card ending in 1234", "•••• 1234", "****1234", "account ending in 1234".
 */
function extractLastFour(text: string): string | undefined {
  const patterns = [
    /(?:card|account|carte|compte)\s+ending\s+in\s+(\d{4})\b/i,
    /ending\s+in\s+(\d{4})\b/i,
    /(?:card|account|carte|compte)\s+#\s*\d*(\d{4})\b/i,
    /[*•x]{3,}\s*(\d{4})\b/i,
    /\b(?:no\.?|number:?)\s*[*•x\d]*(\d{4})\b/i,
    /\bcard\s+\d*(\d{4})\b/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[1];
  }
  return undefined;
}

function extractBankHints(text: string): string[] {
  const hints = new Set<string>();
  const matches = text.match(/\b(chase|bank of america|bofa|american express|amex|wells fargo|capital one|citi|citibank|td|rbc|royal bank|scotiabank|bmo|cibc|tangerine|desjardins|eq bank)\b/gi);
  if (matches) {
    matches.forEach((m) => hints.add(m.toLowerCase()));
  }
  return [...hints];
}

export function parseEmailContent(
  fromAddress: string,
  subject: string,
  textContent: string,
  htmlContent: string,
  emailDate: Date
): ParsedTransaction | null {
  const text = (textContent || htmlContent.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const combined = subject + " " + text;

  // --- Forwarding support ------------------------------------------------
  // If the email was forwarded the envelope From is the forwarder's address,
  // not the bank's.  We try to recover the original sender from the body.
  const isForwarded = /fwd:|forwarded message|begin forwarded|original message/i.test(subject + " " + text.slice(0, 300));
  const originalFrom = isForwarded ? extractForwardedFrom(text) : "";

  // Also scan the body for bank domain strings as an additional signal,
  // e.g. the forwarded body will mention "chase.com" or "rbc.com" even when
  // the envelope From is a personal Gmail address.
  const bodyDomainHints = text.slice(0, 2000); // only scan the first portion for speed

  // Normalised subject without "Fwd:" prefix for pattern matching
  const cleanSubject = stripSubjectPrefixes(subject);
  const bankHints = extractBankHints(combined);
  // -----------------------------------------------------------------------

  for (const bankPattern of BANK_PATTERNS) {
    const fromMatch =
      bankPattern.fromPatterns.some((p) => p.test(fromAddress)) ||
      // Check the recovered original sender
      (originalFrom && bankPattern.fromPatterns.some((p) => p.test(originalFrom))) ||
      // Check if the bank's domain appears anywhere in the first 2 KB of the body
      bankPattern.fromPatterns.some((p) => p.test(bodyDomainHints));

    const subjectMatch = bankPattern.subjectPatterns.some(
      (p) => p.test(cleanSubject) || p.test(subject)
    );

    const hintMatch =
      bankHints.some((hint) => bankPattern.bankName === "Bank" || hint.includes(bankPattern.bankName.toLowerCase())) ||
      (bankPattern.bankName === "Bank" && bankHints.length > 0);

    if (!fromMatch && !subjectMatch && !hintMatch) continue;

    for (const parser of bankPattern.parsers) {
      const result = parser(combined, cleanSubject);
      if (result) {
        result.date = emailDate.toISOString();
        result.bank = bankPattern.bankName !== "Bank" ? bankPattern.bankName : result.bank;
        // Extract last 4 digits of the card/account if mentioned in the email
        result.lastFour = extractLastFour(combined);
        // Tag forwarded transactions so the UI can show it if needed
        if (isForwarded) (result as any).forwarded = true;
        return result;
      }
    }
  }
  return null;
}
