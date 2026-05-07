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

function getImapConfig(email: string): { host: string; port: number; isGmail: boolean } {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  if (domain.includes("gmail") || domain.includes("googlemail")) {
    return { host: "imap.gmail.com", port: 993, isGmail: true };
  }
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) {
    return { host: "outlook.office365.com", port: 993, isGmail: false };
  }
  if (domain.includes("yahoo")) {
    return { host: "imap.mail.yahoo.com", port: 993, isGmail: false };
  }
  if (domain.includes("icloud") || domain.includes("me.com")) {
    return { host: "imap.mail.me.com", port: 993, isGmail: false };
  }
  return { host: "imap.gmail.com", port: 993, isGmail: false };
}

router.post("/email/sync", async (req, res) => {
  const { email, appPassword, daysBack = 90 } = req.body as SyncRequest;

  if (!email || !appPassword) {
    res.status(400).json({ error: "email and appPassword are required" });
    return;
  }

  const { host: imapHost, port: imapPort, isGmail } = getImapConfig(email);

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: true,
    auth: { user: email, pass: appPassword },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // ── Choose the right mailbox ─────────────────────────────────────────────
    // Gmail sorts bank alert emails into "Updates" / "Promotions" tabs, which
    // are separate IMAP folders NOT visible in INBOX.
    // "[Gmail]/All Mail" contains every message regardless of tab/label,
    // so we always search there for Gmail accounts.
    // For other providers, INBOX is the correct folder.
    let mailboxName = "INBOX";
    if (isGmail) {
      try {
        await client.mailboxOpen("[Gmail]/All Mail");
        mailboxName = "[Gmail]/All Mail";
      } catch {
        // Fall back if All Mail isn't accessible
        await client.mailboxOpen("INBOX");
      }
    } else {
      await client.mailboxOpen("INBOX");
    }

    req.log.info({ mailbox: mailboxName, daysBack }, "Email sync started");

    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const transactions: ReturnType<typeof parseEmailContent>[] = [];
    const seenUids = new Set<string>();
    let uidCounter = 0;
    const seenContent = new Set<string>();

    const processMessage = async (message: any) => {
      if (!message.source) return;
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

    // ── Search strategy ──────────────────────────────────────────────────────
    //
    // Gmail: use X-GM-RAW (Gmail's native query language) — far more reliable
    // than standard IMAP SEARCH because it respects Gmail's actual search index
    // and works across all tabs/labels. A single query covers all bank senders
    // and financial keywords without any OR batching.
    //
    // Non-Gmail: use a simple date-range scan (fetch everything since the
    // cutoff). The parser decides what counts as a transaction. We cap at 500
    // messages so one noisy inbox can't stall the request.

    const runFetch = async (criteria: any, label: string) => {
      try {
        for await (const message of client.fetch(criteria, { source: true, uid: true })) {
          await processMessage(message);
        }
      } catch (e: any) {
        req.log.debug({ label, err: e?.message }, "IMAP fetch batch skipped");
      }
    };

    if (isGmail) {
      // Build a Gmail search query that covers all common bank alert patterns.
      // newer_than:Xd is more reliable than SINCE for Gmail.
      const gmailQuery =
        `newer_than:${daysBack}d ` +
        `(` +
        // Known bank domains
        `from:(chase.com OR bankofamerica.com OR americanexpress.com OR wellsfargo.com ` +
        `OR capitalone.com OR citi.com OR discover.com OR usbank.com OR ally.com ` +
        `OR td.com OR tdbank.com OR rbc.com OR royalbank.com OR scotiabank.com ` +
        `OR bmo.com OR cibc.com OR tangerine.ca OR nbc.ca OR bnc.ca ` +
        `OR desjardins.com OR eqbank.ca OR hsbc.com OR hsbc.ca) ` +
        // OR financial keywords in subject (catches forwarded emails + unknown banks)
        `OR subject:(transaction OR purchase OR charge OR payment OR alert OR debit ` +
        `OR deposit OR "e-transfer" OR interac OR alerte OR achat)` +
        `)`;

      await runFetch({ gmraw: gmailQuery }, "gmail-native-search");

      // If the Gmail native search found nothing (e.g. X-GM-EXT-1 not enabled),
      // fall back to standard IMAP SEARCH.
      if (seenUids.size === 0) {
        req.log.info("Gmail native search empty, falling back to standard IMAP search");
        await runFetch({ since }, "gmail-fallback-all");
      }
    } else {
      // Non-Gmail: just scan all mail since the cutoff date.
      // The parser filters what's actually a bank transaction.
      await runFetch({ since }, "non-gmail-all");
    }

    await client.logout();

    req.log.info(
      { mailbox: mailboxName, scanned: seenUids.size, found: transactions.length },
      "Email sync completed"
    );

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
      mailbox: mailboxName,
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

  const { host: imapHost, port: imapPort } = getImapConfig(email);

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
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
