import { env } from "../config/env.js";
import { logger } from "./logger.js";

export type Mail = { to: string; subject: string; text: string };

export type MailClient = {
  isConfigured(): boolean;
  send(mail: Mail): Promise<void>;
};

const RESEND_URL = "https://api.resend.com/emails";

const settings = () => {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.MAIL_FROM ?? "";
  return apiKey && from ? { apiKey, from } : null;
};

export const mailClient: MailClient = {
  isConfigured: () => settings() !== null,

  async send(mail) {
    const config = settings();
    if (!config) throw new Error("email is not configured");

    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    });

    if (!response.ok) throw new Error(`email request failed: ${response.status}`);
  },
};

export const sendPasswordResetEmail = async ({
  to,
  token,
}: {
  to: string;
  token: string;
}) => {
  if (!mailClient.isConfigured()) {
    if (env?.NODE_ENV === "development") {
      logger.info("password reset email (development only)", { to, token });
    } else {
      logger.warn("password reset email not sent: email is not configured", { to });
    }
    return;
  }

  const link = process.env.APP_RESET_URL
    ? `\n\nAtau buka tautan ini:\n${process.env.APP_RESET_URL}?token=${encodeURIComponent(token)}`
    : "";

  try {
    await mailClient.send({
      to,
      subject: "Atur ulang password Financare",
      text:
        `Gunakan kode berikut untuk mengatur ulang password Anda. Kode berlaku 30 menit dan hanya bisa dipakai sekali.\n\n${token}${link}\n\n` +
        "Jika Anda tidak memintanya, abaikan email ini.",
    });
  } catch (error) {
    logger.error("password reset email failed", { to, error: String(error) });
  }
};
