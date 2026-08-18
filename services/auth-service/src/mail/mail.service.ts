import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const PLATFORM_NAME = 'Customer Support Portal';
const BRAND_COLOR = '#111827';

/**
 * Wraps a template's inner content in a consistent, branded HTML shell:
 * platform name header, styled CTA button (when a link is present), and a
 * footer. Every template below builds its `bodyHtml` with this helper so a
 * recipient sees one consistent look across every email the platform sends.
 */
function wrapTemplate(preheader: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none;font-size:1px;color:#f3f4f6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:${BRAND_COLOR};padding:20px 32px;">
                <span style="color:#ffffff;font-size:16px;font-weight:600;">${PLATFORM_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">
                This is an automated message from ${PLATFORM_NAME}. If you weren't expecting it, you can safely ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:6px;background-color:${BRAND_COLOR};">
        <a href="${url}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">${label}</a>
      </td>
    </tr>
  </table>
  <p style="color:#6b7280;font-size:13px;word-break:break-all;">If the button doesn't work, copy and paste this link into your browser:<br /><a href="${url}" style="color:${BRAND_COLOR};">${url}</a></p>`;
}

function greeting(recipientName?: string): string {
  return recipientName ? `Hi ${recipientName},` : 'Hi,';
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    this.from = this.config.get<string>('SMTP_FROM') ?? 'Customer Support Portal <no-reply@example.com>';

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT') ?? 587,
        auth: this.config.get<string>('SMTP_USER')
          ? {
              user: this.config.get<string>('SMTP_USER'),
              pass: this.config.get<string>('SMTP_PASS'),
            }
          : undefined,
      });
    } else {
      // No SMTP configured: fall back to a development-safe mechanism that
      // logs the email instead of silently pretending it was delivered.
      this.transporter = null;
    }
  }

  /**
   * Startup visibility only (Step 2/18: never fail silently on a
   * misconfiguration). Does not throw/crash boot — mail is an intentionally
   * best-effort side channel (see sendMail below) — this only makes an
   * obviously-broken config loud instead of silently falling back to the
   * dev-log path in what looks like a real deployment.
   */
  onModuleInit(): void {
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) {
      if ((this.config.get<string>('NODE_ENV') ?? 'development') === 'production') {
        this.logger.warn(
          'SMTP_HOST is not set. Emails will only be logged, never delivered. ' +
            'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM to enable real email delivery.',
        );
      }
      return;
    }
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    if (user && !pass) {
      this.logger.warn('SMTP_USER is set but SMTP_PASS is missing — SMTP authentication will fail.');
    }
    if (!this.config.get<string>('SMTP_FROM')) {
      this.logger.warn('SMTP_FROM is not set — falling back to a generic sender address.');
    }
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `[DEV EMAIL - SMTP not configured] To: ${options.to} | Subject: ${options.subject}\n${options.text}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
    } catch (err) {
      // Email is a best-effort side channel: the account/token/etc. that
      // triggered this send has already been committed to the database by
      // the caller, so a transient SMTP failure must not fail the request
      // and strand the record with no way to retry (e.g. a repeat
      // registration attempt would just hit "email already exists"). The
      // failure is still fully visible in logs (Step 2), just not surfaced
      // as an HTTP error to the caller.
      this.logger.error(`Failed to send email to ${options.to}: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  /**
   * Registration OTP. `organizationName` is passed only for customer
   * self-signup into an existing tenant (RegisterCustomerDto flow) — it
   * doubles as the "customer organization join" notification email, so the
   * customer sees which organization they're joining right in the same
   * message that carries their verification code, without a second,
   * duplicate send path.
   */
  async sendOtpEmail(to: string, otp: string, options?: { recipientName?: string; organizationName?: string }): Promise<void> {
    const orgLine = options?.organizationName
      ? `<p>You're verifying your account to join <strong>${options.organizationName}</strong>'s support portal.</p>`
      : '';
    const orgText = options?.organizationName ? `You're verifying your account to join ${options.organizationName}'s support portal.\n` : '';

    await this.sendMail({
      to,
      subject: 'Your verification code',
      text: `${greeting(options?.recipientName)}\n\n${orgText}Your verification code is ${otp}. It expires in 10 minutes and can only be used once.\n\nIf you didn't request this, you can ignore this email.`,
      html: wrapTemplate(
        `Your verification code is ${otp}`,
        `<p>${greeting(options?.recipientName)}</p>
         ${orgLine}
         <p>Your verification code is:</p>
         <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:${BRAND_COLOR};margin:16px 0;">${otp}</p>
         <p style="color:#6b7280;font-size:13px;">This code expires in 10 minutes and can only be used once. If you didn't request this, you can safely ignore this email.</p>`,
      ),
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.sendMail({
      to,
      subject: 'Reset your password',
      text: `We received a request to reset your password. Visit: ${resetUrl}\nThis link will expire soon. If you did not request this, you can ignore this email.`,
      html: wrapTemplate(
        'Reset your password',
        `<p>Hi,</p>
         <p>We received a request to reset your password. Click the button below to choose a new one.</p>
         ${ctaButton(resetUrl, 'Reset password')}
         <p style="color:#6b7280;font-size:13px;">This link will expire soon. If you didn't request a password reset, you can safely ignore this email — your password won't change.</p>`,
      ),
    });
  }

  async sendInvitationEmail(
    to: string,
    organizationName: string,
    role: string,
    inviteUrl: string,
    options?: { recipientName?: string },
  ): Promise<void> {
    const roleLabel = role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    await this.sendMail({
      to,
      subject: `You've been invited to join ${organizationName}`,
      text: `${greeting(options?.recipientName)}\n\nYou've been invited to join ${organizationName} as a ${roleLabel}. Accept your invitation: ${inviteUrl}\nThis link will expire, and can only be used once.`,
      html: wrapTemplate(
        `You've been invited to join ${organizationName}`,
        `<p>${greeting(options?.recipientName)}</p>
         <p>You've been invited to join <strong>${organizationName}</strong> as a <strong>${roleLabel}</strong>.</p>
         ${ctaButton(inviteUrl, 'Accept invitation')}
         <p style="color:#6b7280;font-size:13px;">This invitation link will expire, and can only be used once. If you weren't expecting this, you can safely ignore this email.</p>`,
      ),
    });
  }
}
