import nodemailer from 'nodemailer';

interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends a transactional email. Falls back to console logging in development.
 */
export async function sendMail(options: MailOptions): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      await transporter.sendMail({
        from: `"Cloud IDE" <no-reply@cloud-ide.com>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      console.log(`[Mailer] Real email successfully sent to: ${options.to}`);
      return;
    } catch (err) {
      console.error('[Mailer] SMTP delivery failed. Falling back to console logging.', err);
    }
  }

  // Fallback: Console Logging
  console.log(`
=============================================================
[MAILER MOCK] transactional email dispatched
-------------------------------------------------------------
TO      : ${options.to}
SUBJECT : ${options.subject}
BODY    : ${options.html.replace(/<[^>]*>/g, ' ').trim()}
=============================================================
  `);
}
