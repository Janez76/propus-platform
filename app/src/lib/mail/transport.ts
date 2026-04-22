import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

let cached: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

export function getMailTransport() {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error("SMTP_HOST fehlt — E-Mail-Versand nicht konfiguriert");
  }
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = String(process.env.SMTP_SECURE || "false") === "true";
  cached = nodemailer.createTransport({
    host,
    port,
    secure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return cached;
}

export function getMailFrom(): string {
  return process.env.MAIL_FROM || process.env.OFFICE_EMAIL || "office@propus.ch";
}
