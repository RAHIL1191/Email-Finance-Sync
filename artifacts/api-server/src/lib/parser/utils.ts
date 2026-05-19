export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<(br|BR)\s*\/?>/g, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<(p|div|tr|li|h[1-6])[^>]*>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseDollarAmount(
  raw: string
): { amount: number; currency: string } | null {
  const re = /(?:(CAD|USD|EUR|GBP|AUD)\s*)?\$\s*([\d,]+\.?\d*)\s*(?:(CAD|USD|EUR|GBP|AUD))?/i;
  const m = raw.match(re);
  if (!m) return null;
  const amount = parseFloat(m[2].replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) return null;
  return { amount, currency: (m[1] ?? m[3] ?? "CAD").toUpperCase() };
}

export function parseFrenchAmount(
  raw: string
): { amount: number; currency: string } | null {
  const m = raw.match(/([\d\s]+),(\d{2})\s*\$/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/\s/g, "") + "." + m[2]);
  if (isNaN(amount) || amount <= 0) return null;
  return { amount, currency: "CAD" };
}

export function extractLastFour(text: string): string | undefined {
  const patterns = [
    // "ending in 1234" / "ends in 1234"
    /\b(?:ending|ends)\s+in\s+(\d{3,4})\b/i,
    // "****1234" / "••••1234" / "XXXX1234"
    /[*\u2022xX]{3,}\s*(\d{3,4})\b/,
    // "account ending 1234" / "account ending in 1234"
    /\baccount\s+(?:ending\s+(?:in\s+)?|#\s*)(\d{3,4})\b/i,
    // "card ending 1234" / "card ending in 1234"
    /\bcard\s+(?:ending\s+(?:in\s+)?|#\s*)(\d{3,4})\b/i,
    // "Visa/Mastercard ending in 1234" (CIBC/BMO style)
    /\b(?:visa|mastercard|debit|credit)\s+(?:card\s+)?ending\s+(?:in\s+)?(\d{3,4})\b/i,
    // "account *1234" / "account number ...1234"
    /\baccount\s*(?:number|#|no\.?)?[\s:]*(?:[\d*\u2022X.-]+\s*)?(\d{3,4})\b/i,
    // "card number ...1234"
    /\bcard\s*(?:number|#|no\.?)[\s:]*(?:[\dX*\u2022-]+\s+)?(\d{3,4})\b/i,
    // French: "terminant par 1234" / "terminant en 1234"
    /\bterminant\s+(?:par|en)\s+(\d{3,4})\b/i,
    // Generic last digits in context: "(1234)" near card/account
    /\b(?:card|account|carte|compte)[^\n]{0,30}\((\d{3,4})\)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return undefined;
}

export function stripSubjectPrefixes(subject: string): string {
  return subject.replace(/^(Fwd?:|Re:|TR:|R\u00e9f?:|AW:|\[Fwd\]|\[FW\])\s*/gi, "").trim();
}

export function safeParseDate(raw?: string | null): string {
  if (!raw) return new Date().toISOString();
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return new Date().toISOString();
}

export function extractTransactionDate(text: string): string | undefined {
  const patterns = [
    /transaction\s+date[\s:]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /\bdate[\s:]+(\d{4}[-\/]\d{2}[-\/]\d{2})/i,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      try {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime())) return d.toISOString();
      } catch {}
    }
  }
  return undefined;
}

export function cleanMerchant(raw: string): string {
  let s = raw.trim();
  const noiseAt = [
    /\s+on\s+\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/i,
    /\s+dated?\s+\w/i,
    /\s+for\s+\$[\d,.]+/i,
    /\s{2,}/,
  ];
  for (const p of noiseAt) {
    const m = s.match(p);
    if (m?.index !== undefined) s = s.slice(0, m.index).trim();
  }
  s = s.replace(/[.,;:!?*\-]+$/, "").trim();
  // Strip store/location numbers (e.g. "#1234", "STORE 5678", city/province suffixes)
  s = s.replace(/\s*#\d+/g, "").trim();
  s = s.replace(/\s+(?:STORE|STR|LOC|UNIT|STE)\s*\d+.*/i, "").trim();
  // Cap to max 2 words (keeps merchant names concise)
  const words = s.split(/\s+/).slice(0, 2);
  s = words.join(" ");
  // Title-case if ALL CAPS
  if (s === s.toUpperCase() && s.length > 2) {
    s = s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return s || "Unknown Merchant";
}

const CATEGORY_RULES: Array<{ category: string; pattern: RegExp }> = [
  // Groceries — must be BEFORE Shopping so Walmart/Costco/Target match here first
  { category: "Food & Grocery",    pattern: /walmart|wal-mart|costco|target\b|whole foods|trader joe|kroger|publix|safeway|aldi|wegmans|grocery|groceries|loblaws|sobeys|metro\b|no frills|freshco|food basics|iga\b|maxi\b|provigo|super c\b|farm boy|superstore|real canadian|t&t|h mart|food mart|save-?on|price chopper|shoprite|piggly|winn-dixie|meijer|sprouts|natural grocers|giant\b|stop.shop|food lion|harris teeter|bi-lo|commissary|instacart/i },
  // Restaurants & Dining
  { category: "Drink & Dine",      pattern: /uber eats|doordash|grubhub|skip the dishes|postmates|ritual\b|chipotle|mcdonald|starbucks|dunkin|pizza|taco bell|subway\b|burger king|wendy|kfc\b|popeyes|chick-?fil|five guys|shake shack|panera|nando|in-?n-?out|restaurant|cafe|caf[e\u00e9]|diner|sushi|thai\b|grill|kitchen|bakery|bistro|pub\b|bar\b|lounge|pho\b|ramen|wok\b|buffet|catering|tim hortons|timmies|harvey|swiss chalet|boston pizza|second cup|a&w\b|dairy queen|beavertails|earls|moxies|cactus club|milestones|the keg|jack astor|montanas|kelsey|joey\b|white spot|mary brown|st-hubert|la belle|scores\b/i },
  // Shopping — generic retail
  { category: "Shopping",          pattern: /amazon(?!.*prime)|ebay|etsy|best buy|nordstrom|macy|gap\b|h&m|zara\b|uniqlo|canadian tire|home depot|rona\b|winners|sport chek|la vie en rose|reitmans|simons\b|hudson.s bay|the source|ikea|dollarama|marshalls|old navy|tjx|tj maxx|homesense|indigo|chapters|staples|office depot|apple store|microsoft store|wayfair|shein|temu|wish\b|ali ?express|nike\b|adidas|lululemon|sephora|bath.body|shopify|square\b/i },
  // Entertainment
  { category: "Entertainment",     pattern: /netflix|spotify|hulu|disney\+?|hbo|apple tv|amazon prime|youtube premium|twitch|xbox\b|playstation|steam\b|crave\b|tubi\b|apple music|deezer|sportsnet|tsn\b|cineplex|ticketmaster|stubhub|live nation|amc\b|imax\b|regal\b|bowling|golf\b|fitness|gym\b|goodlife|planet fitness|equinox|f45\b/i },
  // Transport & Travel
  { category: "Transport",         pattern: /uber\b(?! eats)|lyft|taxi|cab\b|transit|presto\b|ttc\b|metrolinx|go transit|parking|parkade|impark|indigo park|gas\b|fuel\b|shell\b|esso\b|petro-canada|pioneer\b|ultramar|husky\b|circle k|couche-tard|air canada|westjet|porter air|via rail|delta\b|united airlines|southwest|american air|jetblue|spirit air|hotel|motel|airbnb|expedia|booking\.com|trivago|car rental|enterprise rent|hertz\b|avis\b|budget rent|national car/i },
  // Housing
  { category: "House",             pattern: /rent\b|mortgage|lease\b|property management|hoa\b|strata\b|condo\b|landlord|apartment|tenant/i },
  // Utilities & Telecom
  { category: "Bills & Utilities", pattern: /hydro\b|electric|enbridge|union gas|fortis\b|bc hydro|toronto hydro|hydro-qu[e\u00e9]bec|rogers\b|bell\b|telus\b|fido\b|koodo\b|virgin mobile|shaw\b|videotron|cogeco\b|eastlink\b|sasktel|mts\b|internet|cable\b|phone bill|cell bill|water bill|sewage|waste management|subscription|membership|annual fee|monthly fee|auto-renew|patreon|substack|notion|dropbox|google storage|icloud|adobe|microsoft 365|office 365|canva|zoom\b|slack\b/i },
  // Health & Wellness
  { category: "Health & Fitness",  pattern: /pharmacy|shoppers drug mart|jean coutu|pharmaprix|rexall|london drugs|medical|clinic|dental|dentist|vision|optician|doctor|physician|hospital|health|wellness|physio|chiro|massage|therapy|lab\b|blood|xray|mri\b/i },
  // Insurance
  { category: "Insurance",         pattern: /insurance|intact\b|aviva\b|desjardins assurance|co-operators|belairdirect|td insurance|rbc insurance|manulife|sunlife|sun life|canada life|great-?west|wawanesa|economical/i },
  // Transfer (e-transfer, wire, etc.)
  { category: "Transfer",          pattern: /e-?transfer|wire transfer|money transfer|western union|remittance|sent to|received from/i },
  // ATM / Withdrawal
  { category: "Misc Expenses",     pattern: /atm|withdrawal|cash back|cash advance/i },
];

export function categorize(merchant: string, direction: "income" | "expense"): string {
  if (direction === "income") return "Salary";
  for (const { category, pattern } of CATEGORY_RULES) {
    if (pattern.test(merchant)) return category;
  }
  return "Others";
}
