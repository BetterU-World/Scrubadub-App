"use node";

import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const APP_URL = process.env.APP_URL;

function getResendClient(): Resend {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY environment variable is required");
  }
  return new Resend(RESEND_API_KEY);
}

function getFromEmail(): string {
  if (!RESEND_FROM_EMAIL) {
    throw new Error("RESEND_FROM_EMAIL environment variable is required");
  }
  return RESEND_FROM_EMAIL;
}

function getAppUrl(): string {
  if (!APP_URL) {
    throw new Error("APP_URL environment variable is required");
  }
  // Strip trailing slash
  return APP_URL.replace(/\/+$/, "");
}

/**
 * Send a password reset email with a secure reset link.
 * Returns true if sent successfully, false otherwise.
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<boolean> {
  const resend = getResendClient();
  const resetLink = `${getAppUrl()}/reset-password/${token}`;

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Reset your Scrubadub password",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Reset your password</h2>
          <p>We received a request to reset your Scrubadub password. Click the link below to set a new password:</p>
          <p style="margin: 24px 0;">
            <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
              Reset Password
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      console.error("[email] Failed to send password reset email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error sending password reset email:", err);
    return false;
  }
}

/**
 * Send an invite email for cleaner/maintenance onboarding.
 * Returns true if sent successfully, false otherwise.
 */
export async function sendInviteEmail(
  email: string,
  inviteToken: string,
  inviterName?: string
): Promise<boolean> {
  const resend = getResendClient();
  const inviteLink = `${getAppUrl()}/accept-invite/${inviteToken}`;

  const invitedBy = inviterName ? ` by ${inviterName}` : "";

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "You've been invited to Scrubadub",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>You're invited to Scrubadub</h2>
          <p>You've been invited${invitedBy} to join a team on Scrubadub. Click the link below to set up your account:</p>
          <p style="margin: 24px 0;">
            <a href="${inviteLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
              Accept Invite
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">This link expires in 72 hours. If you weren't expecting this invite, you can safely ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      console.error("[email] Failed to send invite email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error sending invite email:", err);
    return false;
  }
}
