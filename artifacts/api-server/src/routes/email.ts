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
    // Dedup by UID — use a string key so undefined UIDs don't collapse into one slot
    const seenUids = new Set<string>();
    let uidCounter = 0;
    // Dedup by content so the same transaction isn't added twice
    const seenContent = new Set<string>();

    const processMessage = async (message: any) => {
      if (!message.source) return;
      // Build a reliable key: prefer the real UID, fall back to a counter so that
      // messages without UIDs never share a slot and block each other.
      const uidKey = message.uid != null ? String(message.uid) : `__no_uid_${uidCounter++}`;
      if (seenUids.has(uidKey)) return;
      seenUids.add(uidKey);
      try {
        const parsed = await (simpleParser(message.source) as unknown as Promise<any>);
        const from = parsed.from?.text || "";
        const subject = parsed.subject || "";
        const text = parsed.text || "";
        const html = (typeof parsed.html === "string" ? parsed.html : "") || "";
        const date = parsed.date || new Date();

        const tx = parseEmailContent(from, subject, text, html, date);
        if (tx) {
          const contentKey = `${tx.amount}-${tx.title}-${tx.date.slice(0, 10)}`;
          if (!seenContent.has(contentKey)) {
            seenContent.add(contentKey);
            transactions.push(tx);
          }
        }
      } catch (e: any) {
        req.log.debug({ err: e?.message }, "Skipping unparseable email");
      }
    };

    // Helper: chunk an array into groups of size n
    const chunk = <T,>(arr: T[], n: number): T[][] =>
      Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

    // Helper: run a single IMAP fetch criteria and call processMessage for each result
    const runFetch = async (criteria: any, label: string) => {
      try {
        for await (const message of client.fetch(criteria, { source: true, uid: true })) {
          await processMessage(message);
        }
      } catch (e: any) {
        // Some servers reject complex OR — skip this batch gracefully
        req.log?.debug({ label, err: e?.message }, "IMAP fetch batch skipped");
      }
    };

    // ── Fetch 1: bank sender searches, batched in groups of 4 ────────────
    // Sending one massive OR with 24 items often hits IMAP server limits and
    // fails silently. Batching avoids this entirely.
    const bankSenders = [
      "chase.com", "bankofamerica.com", "americanexpress.com",
      "wellsfargo.com", "capitalone.com", "citi.com", "citibank.com",
      "discover.com", "usbank.com", "ally.com",
      "td.com", "tdbank.com", "rbc.com", "royalbank.com",
      "scotiabank.com", "scotiabankmessages.com", "bmo.com", "cibc.com",
      "tangerine.ca", "nbc.ca", "bnc.ca", "desjardins.com", "eqbank.ca",
      "hsbc.ca", "hsbc.com",
    ];
    for (const batch of chunk(bankSenders, 4)) {
      const criteria: any = batch.length === 1
        ? { since, from: batch[0] }
        : { since, or: batch.map((d) => ({ from: d })) };
      await runFetch(criteria, `bank-sender-batch`);
    }

    // ── Fetch 2: subject-keyword search, batched in groups of 3 ──────────
    // Catches forwarded bank emails whose sender won't match bank domains.
    const subjectKeywords = [
      "transaction", "purchase", "charge", "payment",
      "alert", "alerte", "debit", "deposit", "statement",
      "banking", "achat", "interac", "e-transfer", "fwd",
    ];
    for (const batch of chunk(subjectKeywords, 3)) {
      const criteria: any = batch.length === 1
        ? { since, subject: batch[0] }
        : { since, or: batch.map((k) => ({ subject: k })) };
      await runFetch(criteria, `subject-keyword-batch`);
    }

    // ── Fetch 3: catch-all fallback ───────────────────────────────────────
    // If the two searches above returned nothing (server doesn't support OR),
    // scan all messages since the cutoff date and let the parser decide.
    if (seenUids.size === 0) {
      await runFetch({ since }, "catch-all");
    }

    await client.logout();

    res.json({
      success: true,
      transactions,
      parsed: transactions.filter((t) => t !== null).map((t) => ({
        title: t!.title,
        merchant: t!.merchant,
        amount: t!.amount,
        type: t!.type,
        bank: t!.bank,
        rawSubject: t!.rawSubject,
        lastFour: t!.lastFour,
      })),
      emailsScanned: seenUids.size,
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
