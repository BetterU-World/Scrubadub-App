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
/**
 * Send a "job assigned" email to a cleaner.
 */
export async function sendJobAssignedEmail(
  email: string,
  propertyName: string,
  scheduledDate: string,
  startTime?: string
): Promise<boolean> {
  const resend = getResendClient();
  const appUrl = getAppUrl();
  const timeInfo = startTime ? ` at ${startTime}` : "";

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "New Cleaning Job Assigned",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${appUrl}/favicon-96x96.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
          </div>
          <h2 style="text-align: center; color: #111; font-size: 22px; margin: 0 0 16px;">New Cleaning Job Assigned</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">You've been assigned a new cleaning job:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="color: #6b7280; font-size: 14px; padding: 6px 0;">Property</td><td style="color: #111; font-size: 14px; padding: 6px 0; text-align: right; font-weight: 500;">${propertyName}</td></tr>
            <tr><td style="color: #6b7280; font-size: 14px; padding: 6px 0;">Date</td><td style="color: #111; font-size: 14px; padding: 6px 0; text-align: right; font-weight: 500;">${scheduledDate}${timeInfo}</td></tr>
          </table>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${appUrl}" style="background-color: #111; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 15px; font-weight: 500;">
              Open SCRUB
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">Log in to SCRUB to view job details and get started.</p>
        </div>
      `,
    });

    if (error) {
      console.error("[email] Failed to send job assigned email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error sending job assigned email:", err);
    return false;
  }
}

/**
 * Send a "job completed" email to the owner.
 */
export async function sendJobCompletedEmail(
  email: string,
  propertyName: string,
  cleanerName: string,
  completedAt: number
): Promise<boolean> {
  const resend = getResendClient();
  const appUrl = getAppUrl();
  const completionTime = new Date(completedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Cleaning Job Completed",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${appUrl}/favicon-96x96.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
          </div>
          <h2 style="text-align: center; color: #111; font-size: 22px; margin: 0 0 16px;">Cleaning Job Completed</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">A cleaning job has been completed and is ready for your review.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="color: #6b7280; font-size: 14px; padding: 6px 0;">Property</td><td style="color: #111; font-size: 14px; padding: 6px 0; text-align: right; font-weight: 500;">${propertyName}</td></tr>
            <tr><td style="color: #6b7280; font-size: 14px; padding: 6px 0;">Cleaner</td><td style="color: #111; font-size: 14px; padding: 6px 0; text-align: right; font-weight: 500;">${cleanerName}</td></tr>
            <tr><td style="color: #6b7280; font-size: 14px; padding: 6px 0;">Completed</td><td style="color: #111; font-size: 14px; padding: 6px 0; text-align: right; font-weight: 500;">${completionTime}</td></tr>
          </table>
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">Photos and checklist details are available in SCRUB.</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${appUrl}" style="background-color: #111; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 15px; font-weight: 500;">
              Review in SCRUB
            </a>
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("[email] Failed to send job completed email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error sending job completed email:", err);
    return false;
  }
}

/**
 * Send a "job approved" email to the cleaner.
 */
export async function sendJobApprovedEmail(
  email: string,
  propertyName: string
): Promise<boolean> {
  const resend = getResendClient();
  const appUrl = getAppUrl();

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Cleaning Job Approved",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${appUrl}/favicon-96x96.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
          </div>
          <h2 style="text-align: center; color: #111; font-size: 22px; margin: 0 0 16px;">Cleaning Job Approved</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">Great work! Your cleaning job at <strong>${propertyName}</strong> has been reviewed and approved by the owner.</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${appUrl}" style="background-color: #111; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 15px; font-weight: 500;">
              Open SCRUB
            </a>
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("[email] Failed to send job approved email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error sending job approved email:", err);
    return false;
  }
}

/**
 * Send a "connect to Stripe" invite email to a cleaner on behalf of the owner.
 */
export async function sendStripeConnectInviteEmail(
  email: string,
  ownerName?: string
): Promise<boolean> {
  const resend = getResendClient();
  const appUrl = getAppUrl();

  const from = ownerName ? `Your employer (${ownerName})` : "Your employer";

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Connect Stripe to receive payments via SCRUB",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${appUrl}/favicon-96x96.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
          </div>
          <h2 style="text-align: center; color: #111; font-size: 22px; margin: 0 0 16px;">Connect Stripe to Get Paid</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">${from} wants to pay you for jobs through SCRUB. To receive payments, connect your Stripe account:</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${appUrl}" style="background-color: #111; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 15px; font-weight: 500;">
              Open SCRUB &amp; Connect Stripe
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">Log in to SCRUB and go to Settings &rarr; Get Paid to connect your Stripe account.</p>
        </div>
      `,
    });

    if (error) {
      console.error("[email] Failed to send Stripe connect invite:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error sending Stripe connect invite:", err);
    return false;
  }
}

const SUPPORT_DESTINATION_EMAIL =
  process.env.SUPPORT_DESTINATION_EMAIL || "scrubadubsolutionsllc@gmail.com";

/**
 * Send a support/contact form message via Resend.
 * Delivers to the support destination mailbox.
 */
export async function sendSupportEmail(
  name: string,
  email: string,
  subject: string,
  message: string
): Promise<boolean> {
  const resend = getResendClient();

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: SUPPORT_DESTINATION_EMAIL,
      replyTo: email,
      subject: `[Contact Form] ${subject}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <h2 style="color: #111; font-size: 22px; margin: 0 0 16px;">New Contact Form Submission</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="color: #6b7280; font-size: 14px; padding: 6px 0;">Name</td><td style="color: #111; font-size: 14px; padding: 6px 0; text-align: right; font-weight: 500;">${name}</td></tr>
            <tr><td style="color: #6b7280; font-size: 14px; padding: 6px 0;">Email</td><td style="color: #111; font-size: 14px; padding: 6px 0; text-align: right; font-weight: 500;">${email}</td></tr>
            <tr><td style="color: #6b7280; font-size: 14px; padding: 6px 0;">Subject</td><td style="color: #111; font-size: 14px; padding: 6px 0; text-align: right; font-weight: 500;">${subject}</td></tr>
          </table>
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${message}</p>
          </div>
          <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">Reply directly to this email to respond to ${name} at ${email}.</p>
        </div>
      `,
    });

    if (error) {
      console.error("[email] Failed to send support email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error sending support email:", err);
    return false;
  }
}

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
