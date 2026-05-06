import { Router } from "express";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { parseEmailContent } from "../lib/emailParser.js";

const router = Router();

interface SyncRequest {
  email: string;
  appPassword: string;
  daysBack?: number;
}

router.post("/email/sync", async (req, res) => {
  const { email, appPassword, daysBack = 90 } = req.body as SyncRequest;

  if (!email || !appPassword) {
    res.status(400).json({ error: "email and appPassword are required" });
    return;
  }

  // Determine IMAP settings based on email domain
  const domain = email.split("@")[1]?.toLowerCase() || "";
  let imapHost = "imap.gmail.com";
  let imapPort = 993;

  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) {
    imapHost = "outlook.office365.com";
    imapPort = 993;
  } else if (domain.includes("yahoo")) {
    imapHost = "imap.mail.yahoo.com";
    imapPort = 993;
  } else if (domain.includes("icloud") || domain.includes("me.com")) {
    imapHost = "imap.mail.me.com";
    imapPort = 993;
  }

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
    tls: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const transactions: ReturnType<typeof parseEmailContent>[] = [];
    const seen = new Set<string>();

    // Search for emails from known banks or with financial keywords.
    // Forwarded emails arrive with the user's own address as the sender, so
    // the subject-based criteria (including "fwd") is critical to catch them.
    const searchCriteria = {
      since,
      or: [
        // ── US banks ──────────────────────────────────────────
        { from: "chase.com" },
        { from: "bankofamerica.com" },
        { from: "americanexpress.com" },
        { from: "wellsfargo.com" },
        { from: "capitalone.com" },
        { from: "citi.com" },
        { from: "citibank.com" },
        { from: "discover.com" },
        { from: "usbank.com" },
        { from: "ally.com" },
        // ── Canadian banks ────────────────────────────────────
        { from: "td.com" },
        { from: "tdbank.com" },
        { from: "rbc.com" },
        { from: "royalbank.com" },
        { from: "scotiabank.com" },
        { from: "scotiabankmessages.com" },
        { from: "bmo.com" },
        { from: "cibc.com" },
        { from: "tangerine.ca" },
        { from: "nbc.ca" },
        { from: "bnc.ca" },
        { from: "desjardins.com" },
        { from: "eqbank.ca" },
        { from: "hsbc.ca" },
        { from: "hsbc.com" },
        // ── Generic alert senders ─────────────────────────────
        { from: "alert" },
        { from: "notify" },
        { from: "notification" },
        { from: "noreply" },
        { from: "no-reply" },
        // ── Subject keywords (EN + FR) ────────────────────────
        // "Fwd:" prefix is critical for forwarded bank emails
        { subject: "fwd" },
        { subject: "fw:" },
        { subject: "transaction" },
        { subject: "purchase" },
        { subject: "charge" },
        { subject: "payment" },
        { subject: "alert" },
        { subject: "alerte" },
        { subject: "debit" },
        { subject: "deposit" },
        { subject: "statement" },
        { subject: "banking" },
        { subject: "achat" },
        { subject: "point of sale" },
        { subject: "card used" },
        { subject: "card alert" },
        { subject: "account activity" },
        { subject: "e-transfer" },
        { subject: "interac" },
      ],
    } as any;

    let emailCount = 0;
    for await (const message of client.fetch(searchCriteria, {
      source: true,
      envelope: true,
    })) {
      if (emailCount >= 100) break; // Limit to last 100 matching emails
      emailCount++;

      try {
        if (!message.source) continue;
        const parsed = await (simpleParser(message.source) as unknown as Promise<any>);
        const from = parsed.from?.text || "";
        const subject = parsed.subject || "";
        const text = parsed.text || "";
        const html = (typeof parsed.html === "string" ? parsed.html : "") || "";
        const date = parsed.date || new Date();

        const tx = parseEmailContent(from, subject, text, html, date);
        if (tx) {
          // Deduplicate by amount + merchant + date (same day)
          const dedupKey = `${tx.amount}-${tx.title}-${tx.date.slice(0, 10)}`;
          if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            transactions.push(tx);
          }
        }
      } catch {
        // Skip unparseable emails
      }
    }

    await client.logout();

    res.json({
      success: true,
      transactions,
      parsed: transactions.map((t) => ({
        title: t.title,
        merchant: t.merchant,
        amount: t.amount,
        type: t.type,
        bank: t.bank,
        rawSubject: t.rawSubject,
        lastFour: t.lastFour,
      })),
      emailsScanned: emailCount,
      transactionsFound: transactions.length,
    });
  } catch (err: any) {
    let message = "Failed to connect to email server.";
    const errMsg = err?.message || "";

    if (errMsg.includes("Invalid credentials") || errMsg.includes("AUTHENTICATIONFAILED") || errMsg.includes("535")) {
      message =
        "Invalid credentials. For Gmail, use an App Password (not your regular password). Go to myaccount.google.com → Security → App passwords.";
    } else if (errMsg.includes("ECONNREFUSED") || errMsg.includes("ENOTFOUND")) {
      message = "Could not connect to email server. Check your internet connection.";
    } else if (errMsg.includes("timeout") || errMsg.includes("ETIMEDOUT")) {
      message = "Connection timed out. Try again.";
    } else if (errMsg.includes("LOGIN") || errMsg.includes("authentication")) {
      message = "Authentication failed. Make sure IMAP is enabled in your email settings.";
    }

    res.status(400).json({ error: message, detail: errMsg });
  }
});

// Test endpoint to verify email credentials
router.post("/email/test", async (req, res) => {
  const { email, appPassword } = req.body as Pick<SyncRequest, "email" | "appPassword">;

  if (!email || !appPassword) {
    res.status(400).json({ error: "email and appPassword are required" });
    return;
  }

  const domain = email.split("@")[1]?.toLowerCase() || "";
  let imapHost = "imap.gmail.com";
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) {
    imapHost = "outlook.office365.com";
  } else if (domain.includes("yahoo")) {
    imapHost = "imap.mail.yahoo.com";
  } else if (domain.includes("icloud") || domain.includes("me.com")) {
    imapHost = "imap.mail.me.com";
  }

  const client = new ImapFlow({
    host: imapHost,
    port: 993,
    secure: true,
    auth: { user: email, pass: appPassword },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.logout();
    res.json({ success: true, message: "Email connected successfully" });
  } catch (err: any) {
    const errMsg = err?.message || "";
    let message = "Connection failed.";
    if (errMsg.includes("Invalid credentials") || errMsg.includes("535")) {
      message = "Invalid credentials. For Gmail, use an App Password.";
    }
    res.status(400).json({ error: message });
  }
});

export default router;
