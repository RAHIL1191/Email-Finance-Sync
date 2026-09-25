import { Router } from "express";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { parseEmailContent } from "../lib/emailParser.js";
import { GMAIL_QUERY } from "../lib/parser/index.js";
import { debugParseEmail } from "../lib/parser/debug.js";
import { htmlToText } from "../lib/parser/index.js";

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
  const { email, appPassword, daysBack = 550 } = req.body as SyncRequest;

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

        req.log.info({ from, subject }, "Processing fetched email");

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
      // Use the comprehensive query from the parser constants which covers
      // all known bank domains plus forwarded-email subject patterns.
      const gmailQuery = `newer_than:${daysBack}d (${GMAIL_QUERY})`;

      req.log.info({ gmailQuery }, "Running Gmail native search");
      await runFetch({ gmraw: gmailQuery }, "gmail-native-search");

      // Fallback: if native search returns suspiciously few results (complex Gmail queries
      // can hit limits or be incomplete), fall back to standard IMAP date-range scan.
      // The parser will still filter out non-transaction emails.
      if (seenUids.size < 10) {
        req.log.info(
          { nativeSearchResults: seenUids.size },
          "Gmail native search returned few results, falling back to standard IMAP search"
        );
        await runFetch({ since }, "gmail-fallback-all");
      }
    } else {
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

// Debug endpoint — returns every email with verbose parse info (matched + skipped + reason)
router.post("/email/debug-sync", async (req, res) => {
  const { email, appPassword, daysBack = 30 } = req.body as SyncRequest;

  if (!email || !appPassword) {
    res.status(400).json({ error: "email and appPassword are required" });
    return;
  }

  const { host: imapHost, port: imapPort, isGmail } = getImapConfig(email);
  const client = new ImapFlow({
    host: imapHost, port: imapPort, secure: true,
    auth: { user: email, pass: appPassword },
    logger: false, tls: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    if (isGmail) {
      try { await client.mailboxOpen("[Gmail]/All Mail"); }
      catch { await client.mailboxOpen("INBOX"); }
    } else {
      await client.mailboxOpen("INBOX");
    }

    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const results: any[] = [];
    const seenUids = new Set<string>();
    let uidCounter = 0;

    const processMessage = async (message: any) => {
      if (!message.source) return;
      const uidKey = message.uid != null ? String(message.uid) : `__no_uid_${uidCounter++}`;
      if (seenUids.has(uidKey)) return;
      seenUids.add(uidKey);
      try {
        const parsed = await (simpleParser(message.source) as unknown as Promise<any>);
        const from = parsed.from?.text || "";
        const subject = parsed.subject || "";
        const plainText = parsed.text || "";
        const htmlContent = (typeof parsed.html === "string" ? parsed.html : "") || "";
        const htmlText = htmlContent ? htmlToText(htmlContent) : "";
        const date = parsed.date ? parsed.date.toISOString() : new Date().toISOString();
        const debugResult = debugParseEmail({ emailId: uidKey, from, subject, date, plainText, htmlText });
        results.push(debugResult);
      } catch (e: any) {
        results.push({ from: "?", subject: "?", parseStatus: "failed", rejectReason: e?.message });
      }
    };

    const runFetch = async (criteria: any) => {
      try {
        for await (const message of client.fetch(criteria, { source: true, uid: true })) {
          await processMessage(message);
        }
      } catch {}
    };

    if (isGmail) {
      const gmailQuery = `newer_than:${daysBack}d (${GMAIL_QUERY})`;
      await runFetch({ gmraw: gmailQuery });
      if (seenUids.size < 10) await runFetch({ since });
    } else {
      await runFetch({ since });
    }

    await client.logout();

    const matched = results.filter((r) => r.parseStatus === "matched");
    const skipped = results.filter((r) => r.parseStatus !== "matched");

    res.json({
      emailsScanned: seenUids.size,
      matchedCount: matched.length,
      skippedCount: skipped.length,
      results: results.sort((a, b) => {
        const order = { matched: 0, skipped_no_pattern: 1, skipped_non_transaction: 2, skipped_unknown_bank: 3 };
        return (order[a.parseStatus as keyof typeof order] ?? 4) - (order[b.parseStatus as keyof typeof order] ?? 4);
      }),
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Failed to connect" });
  }
});

function getSmtpConfig(email: string): { host: string; port: number; secure: boolean } {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  if (domain.includes("gmail") || domain.includes("googlemail")) {
    return { host: "smtp.gmail.com", port: 587, secure: false };
  }
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) {
    return { host: "smtp.office365.com", port: 587, secure: false };
  }
  if (domain.includes("yahoo")) {
    return { host: "smtp.mail.yahoo.com", port: 587, secure: false };
  }
  if (domain.includes("icloud") || domain.includes("me.com")) {
    return { host: "smtp.mail.me.com", port: 587, secure: false };
  }
  return { host: "smtp.gmail.com", port: 587, secure: false };
}

interface SendReportRequest {
  senderEmail: string;
  appPassword: string;
  recipientEmail: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  attachmentCsv?: string;
  attachmentFileName?: string;
}

router.post("/email/send-report", async (req, res) => {
  const {
    senderEmail,
    appPassword,
    recipientEmail,
    subject,
    htmlBody,
    textBody,
    attachmentCsv,
    attachmentFileName,
  } = req.body as SendReportRequest;

  if (!senderEmail || !appPassword || !recipientEmail || !subject) {
    res.status(400).json({ error: "senderEmail, appPassword, recipientEmail, and subject are required" });
    return;
  }

  const { host, port, secure } = getSmtpConfig(senderEmail);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: senderEmail,
      pass: appPassword,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 5000, // 5 seconds connection timeout
    greetingTimeout: 5000,   // 5 seconds greeting timeout
  });

  const attachments: any[] = [];
  if (attachmentCsv) {
    attachments.push({
      filename: attachmentFileName || "statement.csv",
      content: attachmentCsv,
      contentType: "text/csv",
    });
  }

  const mailOptions = {
    from: `FinTrack <${senderEmail}>`,
    to: recipientEmail,
    subject,
    text: textBody || "Please find your requested statement attached.",
    html: htmlBody,
    attachments,
  };

  let smtpError: any = null;
  try {
    req.log.info({ senderEmail, recipientEmail, subject }, "Sending email report via SMTP");
    await transporter.sendMail(mailOptions);
    req.log.info("Email report sent successfully via SMTP");
    res.json({ success: true, message: "Email sent successfully" });
    return;
  } catch (err: any) {
    smtpError = err;
    req.log.warn({ err: err?.message }, "SMTP failed, checking if IMAP fallback is possible");
  }

  // Fallback to IMAP if:
  // 1. SMTP failed
  // 2. Sender and Recipient are the same (self-sending)
  if (senderEmail.toLowerCase() === recipientEmail.toLowerCase()) {
    try {
      req.log.info("Attempting IMAP self-delivery fallback...");
      
      // 1. Generate the raw RFC822 message using nodemailer's stream transport
      const streamTransporter = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
      });
      const info = await streamTransporter.sendMail(mailOptions);
      const rawMessage = info.message; // Buffer

      // 2. Connect to the IMAP server
      const { host: imapHost, port: imapPort } = getImapConfig(senderEmail);
      const imapClient = new ImapFlow({
        host: imapHost,
        port: imapPort,
        secure: true,
        auth: { user: senderEmail, pass: appPassword },
        logger: false,
        tls: { rejectUnauthorized: false },
      });

      await imapClient.connect();
      
      // 3. Append to INBOX
      await imapClient.append("INBOX", rawMessage as any);
      await imapClient.logout();

      req.log.info("Email report successfully self-delivered via IMAP append fallback");
      res.json({
        success: true,
        message: "Email self-delivered successfully (via IMAP fallback)",
        fallback: true
      });
      return;
    } catch (imapErr: any) {
      req.log.error({ imapErr }, "IMAP fallback also failed");
      res.status(400).json({
        error: "Failed to deliver email",
        detail: `SMTP Error: ${smtpError?.message || ""}. IMAP Fallback Error: ${imapErr?.message || ""}`
      });
      return;
    }
  }

  // If sender and recipient are not the same, return the SMTP error
  res.status(400).json({
    error: "Failed to send email",
    detail: `SMTP connection failed: ${smtpError?.message || ""}. Note: Outbound SMTP ports are blocked on Render free tier. To bypass this, make sure recipientEmail matches senderEmail to enable automatic IMAP delivery, or upgrade your Render instance.`
  });
});

export default router;
