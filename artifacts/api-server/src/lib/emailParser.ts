export interface ParsedTransaction {
  title: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  bank: string;
  date: string;
  rawSubject: string;
}

interface BankPattern {
  bankName: string;
  fromPatterns: RegExp[];
  subjectPatterns: RegExp[];
  parsers: Array<(text: string, subject: string) => ParsedTransaction | null>;
}

function categorizeFrom(merchant: string): string {
  const m = merchant.toLowerCase();
  if (/amazon|ebay|etsy|walmart|target|best buy|costco|shop|store|market|mall|tj maxx|nordstrom|macy|gap|h&m|zara|uniqlo/.test(m)) return "Shopping";
  if (/uber eats|doordash|grubhub|postmates|instacart|chipotle|mcdonald|starbucks|dunkin|chick|pizza|taco|subway|burger|restaurant|cafe|diner|sushi|thai|chinese|italian|grill|kitchen|bakery|eatery|food/.test(m)) return "Food";
  if (/whole foods|trader joe|kroger|publix|safeway|aldi|wegmans|fresh market|sprouts|grocery/.test(m)) return "Groceries";
  if (/netflix|spotify|hulu|disney|hbo|apple tv|amazon prime|youtube premium|twitch|gaming|game|xbox|playstation|steam/.test(m)) return "Entertainment";
  if (/uber|lyft|grab|taxi|transit|metro|subway|bus|train|parking|gas|shell|bp|chevron|exxon|mobil|citgo|delta|united|southwest|american airlines|hotel|airbnb/.test(m)) return "Transport";
  if (/rent|mortgage|lease|property|hoa/.test(m)) return "Housing";
  if (/electric|gas|water|internet|phone|at&t|verizon|comcast|xfinity|spectrum|t-mobile|sprint/.test(m)) return "Utilities";
  if (/doctor|hospital|pharmacy|cvs|walgreens|rite aid|health|dental|vision|clinic|medical|care/.test(m)) return "Health";
  if (/insurance|geico|progressive|state farm|allstate|liberty mutual|farmers/.test(m)) return "Insurance";
  if (/salary|payroll|deposit|direct deposit|paycheck|dividend|refund|transfer in|credit from/.test(m)) return "Income";
  return "Other";
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

export function parseEmailContent(
  fromAddress: string,
  subject: string,
  textContent: string,
  htmlContent: string,
  emailDate: Date
): ParsedTransaction | null {
  const text = (textContent || htmlContent.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const combined = subject + " " + text;

  for (const bankPattern of BANK_PATTERNS) {
    const fromMatch = bankPattern.fromPatterns.some((p) => p.test(fromAddress));
    const subjectMatch = bankPattern.subjectPatterns.some((p) => p.test(subject));
    if (!fromMatch && !subjectMatch) continue;

    for (const parser of bankPattern.parsers) {
      const result = parser(combined, subject);
      if (result) {
        result.date = emailDate.toISOString();
        result.bank = bankPattern.bankName !== "Bank" ? bankPattern.bankName : result.bank;
        return result;
      }
    }
  }
  return null;
}
