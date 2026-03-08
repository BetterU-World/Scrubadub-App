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
      subject: "Reset your SCRUB password",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${getAppUrl()}/favicon-96x96.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
          </div>
          <h2 style="text-align: center; color: #111; font-size: 22px; margin: 0 0 16px;">Reset your password</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">You requested a password reset for your SCRUB account. Click the button below to set a new password:</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${resetLink}" style="background-color: #111; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 15px; font-weight: 500;">
              Reset Password
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>
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
  const inviteLink = `${getAppUrl()}/invite/${inviteToken}`;

  const invitedBy = inviterName ? ` by ${inviterName}` : "";

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "You've been invited to SCRUB",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${getAppUrl()}/favicon-96x96.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
          </div>
          <h2 style="text-align: center; color: #111; font-size: 22px; margin: 0 0 16px;">You've been invited to SCRUB</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">You've been invited${invitedBy} to join a team on SCRUB. Click the button below to set up your account:</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${inviteLink}" style="background-color: #111; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 15px; font-weight: 500;">
              Accept Invite
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">This link expires in 72 hours. If you weren't expecting this invite, you can safely ignore this email.</p>
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
