import nodemailer from "nodemailer";

let transporter;

export function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST.trim(),
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER.trim(),
        pass: process.env.SMTP_PASS.trim()
      }
    });
  }
  return transporter;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ to: string; transfer: Record<string, unknown> }} opts
 */
export async function sendTransferConfirmationEmail({ to, transfer }) {
  const mail = getTransporter();
  if (!mail || !to) {
    return { sent: false, reason: "not_configured_or_no_recipient" };
  }

  const from = (process.env.EMAIL_FROM || process.env.SMTP_USER).trim();
  const appUrl = (process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");
  const destAmt = transfer.destinationAmount;
  const destCur = transfer.destinationCurrency;
  const usd = transfer.usdAmount;
  const hash = transfer.txHash;
  const recipient = transfer.recipientName;
  const country = transfer.destinationCountry;
  const trackPath = `/track?tx=${encodeURIComponent(String(hash))}`;
  const trackUrl = appUrl ? `${appUrl}${trackPath}` : null;

  const subject = `Remit — your transfer to ${country} was submitted`;

  const text = [
    `Hi ${transfer.senderName || "there"},`,
    ``,
    `Your international send was submitted.`,
    ``,
    `Amount: $${usd} USD → ~${destAmt} ${destCur}`,
    `Recipient: ${recipient}`,
    `Destination: ${country}`,
    ``,
    `Tracking reference: ${hash}`,
    trackUrl ? `Track: ${trackUrl}` : `Track path: ${trackPath}`,
    ``,
    `This is an automated message from Remit.`,
    ``
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;max-width:560px">
  <p>Hi ${escapeHtml(transfer.senderName || "there")},</p>
  <p>Your international send was <strong>submitted</strong>.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 12px 4px 0;color:#555">Amount</td><td><strong>$${escapeHtml(usd)} USD</strong> → ~${escapeHtml(destAmt)} ${escapeHtml(destCur)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#555">Recipient</td><td>${escapeHtml(recipient)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#555">Destination</td><td>${escapeHtml(country)}</td></tr>
  </table>
  <p style="word-break:break-all;font-family:ui-monospace,monospace;font-size:13px"><strong>Tracking reference</strong><br>${escapeHtml(hash)}</p>
  ${
    trackUrl
      ? `<p><a href="${escapeHtml(trackUrl)}">Open Track</a></p>`
      : `<p>Open Track in the app: <code>${escapeHtml(trackPath)}</code></p>`
  }
  <p style="font-size:12px;color:#666">Automated message from Remit.</p>
</body>
</html>`.trim();

  await mail.sendMail({ from, to, subject, text, html });
  return { sent: true };
}
