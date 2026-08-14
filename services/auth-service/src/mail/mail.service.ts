import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class MailService {
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
      // registration attempt would just hit "email already exists").
      this.logger.error(`Failed to send email to ${options.to}: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  async sendVerificationEmail(to: string, verificationUrl: string): Promise<void> {
    await this.sendMail({
      to,
      subject: 'Verify your email address',
      text: `Welcome! Please verify your email by visiting: ${verificationUrl}`,
      html: `<p>Welcome! Please verify your email by clicking the link below:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p>`,
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.sendMail({
      to,
      subject: 'Reset your password',
      text: `We received a request to reset your password. Visit: ${resetUrl}\nIf you did not request this, you can ignore this email.`,
      html: `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
  }

  async sendInvitationEmail(to: string, organizationName: string, role: string, inviteUrl: string): Promise<void> {
    await this.sendMail({
      to,
      subject: `You've been invited to join ${organizationName}`,
      text: `You've been invited to join ${organizationName} as ${role}. Accept your invitation: ${inviteUrl}\nThis link will expire, and can only be used once.`,
      html: `<p>You've been invited to join <strong>${organizationName}</strong> as <strong>${role}</strong>.</p><p><a href="${inviteUrl}">${inviteUrl}</a></p><p>This link will expire, and can only be used once.</p>`,
    });
  }
}
