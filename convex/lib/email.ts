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

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphHtml(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function detailRow(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `
    <tr>
      <td style="color: #6b7280; font-size: 14px; padding: 8px 0; vertical-align: top;">${escapeHtml(label)}</td>
      <td style="color: #111827; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">${escapeHtml(value)}</td>
    </tr>
  `;
}

type ProposalEmailArgs = {
  email: string;
  viewUrl: string;
  companyName: string;
  companyLogoUrl?: string;
  companyEmail?: string;
  companyPhone?: string;
  clientName: string;
  proposal: {
    title: string;
    businessName?: string | null;
    propertyAddress?: string | null;
    requestedDate?: string | null;
    serviceFrequencyLabel?: string | null;
    serviceFrequencyNotes?: string | null;
    scopeOfWork?: string | null;
    notes?: string | null;
    monthlyPriceLabel?: string | null;
    oneTimePriceLabel?: string | null;
  };
  walkthroughSummary?: {
    squareFootage?: number | null;
    estimatedHours?: number | null;
    serviceFrequencyRecommendation?: string | null;
    proposalNotes?: string | null;
  };
};

export async function sendProposalEmail(args: ProposalEmailArgs): Promise<boolean> {
  const resend = getResendClient();
  const appUrl = getAppUrl();
  const logoUrl = args.companyLogoUrl || `${appUrl}/logo-icon.png`;
  const proposal = args.proposal;
  const estimateParts = [
    proposal.monthlyPriceLabel ? `${proposal.monthlyPriceLabel} per month` : null,
    proposal.oneTimePriceLabel ? `${proposal.oneTimePriceLabel} one-time` : null,
  ].filter(Boolean);
  const estimate = estimateParts.length ? estimateParts.join(" + ") : null;
  const walkthrough = args.walkthroughSummary;
  const walkthroughDetails = walkthrough
    ? [
        walkthrough.squareFootage ? `${walkthrough.squareFootage.toLocaleString()} sq ft` : null,
        walkthrough.estimatedHours ? `${walkthrough.estimatedHours} estimated hours` : null,
        walkthrough.serviceFrequencyRecommendation ?? null,
      ].filter(Boolean)
    : [];

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: args.email,
      subject: `${args.companyName} sent your cleaning proposal`,
      html: `
        <div style="margin:0; padding:0; background:#f3f4f6;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; max-width:640px; margin:0 auto; padding:32px 16px;">
            <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
              <div style="padding:28px 28px 20px; border-bottom:1px solid #eef2f7;">
                <div style="display:flex; align-items:center; gap:12px;">
                  <img src="${escapeHtml(logoUrl)}" alt="" width="44" height="44" style="border-radius:10px; object-fit:cover;" />
                  <div>
                    <p style="margin:0; color:#6b7280; font-size:13px;">Proposal from</p>
                    <h1 style="margin:2px 0 0; color:#111827; font-size:22px; line-height:1.25;">${escapeHtml(args.companyName)}</h1>
                  </div>
                </div>
              </div>

              <div style="padding:28px;">
                <p style="margin:0 0 16px; color:#111827; font-size:17px; line-height:1.5;">Hi ${escapeHtml(args.clientName)},</p>
                <p style="margin:0 0 22px; color:#374151; font-size:15px; line-height:1.7;">
                  ${escapeHtml(args.companyName)} prepared a cleaning proposal for your review. You can view the full proposal and accept or decline securely through SCRUB.
                </p>

                <div style="border:1px solid #e5e7eb; border-radius:10px; padding:18px; background:#fafafa; margin:0 0 22px;">
                  <p style="margin:0 0 4px; color:#6b7280; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Proposal</p>
                  <h2 style="margin:0 0 14px; color:#111827; font-size:20px; line-height:1.3;">${escapeHtml(proposal.title)}</h2>
                  <table style="width:100%; border-collapse:collapse;">
                    ${detailRow("Business / property", proposal.businessName || proposal.propertyAddress || null)}
                    ${detailRow("Address", proposal.businessName ? proposal.propertyAddress : null)}
                    ${detailRow("Service frequency", proposal.serviceFrequencyLabel)}
                    ${detailRow("Recommended schedule", proposal.serviceFrequencyNotes || proposal.requestedDate || null)}
                    ${detailRow("Estimated value", estimate)}
                  </table>
                </div>

                ${proposal.scopeOfWork ? `
                  <div style="margin:0 0 20px;">
                    <p style="margin:0 0 6px; color:#111827; font-size:14px; font-weight:700;">Scope summary</p>
                    <p style="margin:0; color:#374151; font-size:14px; line-height:1.7;">${paragraphHtml(proposal.scopeOfWork)}</p>
                  </div>
                ` : ""}

                ${proposal.notes ? `
                  <div style="margin:0 0 20px;">
                    <p style="margin:0 0 6px; color:#111827; font-size:14px; font-weight:700;">Notes</p>
                    <p style="margin:0; color:#374151; font-size:14px; line-height:1.7;">${paragraphHtml(proposal.notes)}</p>
                  </div>
                ` : ""}

                ${walkthroughDetails.length || walkthrough?.proposalNotes ? `
                  <div style="border-left:3px solid #111827; padding-left:14px; margin:0 0 24px;">
                    <p style="margin:0 0 6px; color:#111827; font-size:14px; font-weight:700;">Walkthrough summary</p>
                    ${walkthroughDetails.length ? `<p style="margin:0 0 6px; color:#374151; font-size:14px; line-height:1.7;">${escapeHtml(walkthroughDetails.join(" - "))}</p>` : ""}
                    ${walkthrough?.proposalNotes ? `<p style="margin:0; color:#374151; font-size:14px; line-height:1.7;">${paragraphHtml(walkthrough.proposalNotes)}</p>` : ""}
                  </div>
                ` : ""}

                <p style="text-align:center; margin:30px 0 16px;">
                  <a href="${escapeHtml(args.viewUrl)}" style="background-color:#111827; color:#ffffff; padding:13px 22px; border-radius:7px; text-decoration:none; display:inline-block; font-size:15px; font-weight:700;">
                    View Proposal
                  </a>
                </p>
                <p style="margin:0; color:#6b7280; font-size:13px; line-height:1.6; text-align:center;">
                  After reviewing, you can accept or decline the proposal securely in SCRUB.
                </p>
              </div>

              <div style="padding:18px 28px; background:#f9fafb; border-top:1px solid #eef2f7;">
                <p style="margin:0; color:#6b7280; font-size:12px; line-height:1.6;">
                  Sent by ${escapeHtml(args.companyName)} through SCRUB.
                  ${args.companyEmail ? ` Contact: ${escapeHtml(args.companyEmail)}.` : ""}
                  ${args.companyPhone ? ` ${escapeHtml(args.companyPhone)}.` : ""}
                </p>
              </div>
            </div>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("[email] Failed to send proposal email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error sending proposal email:", err);
    return false;
  }
}

type ServiceAgreementEmailArgs = {
  email: string;
  viewUrl: string;
  companyName: string;
  companyLogoUrl?: string;
  companyEmail?: string;
  companyPhone?: string;
  clientName: string;
  agreement: {
    title: string;
    propertyAddress?: string | null;
    serviceFrequencyLabel?: string | null;
    priceSummary?: string | null;
    billingSchedule?: string | null;
    effectiveStartDate?: string | null;
  };
};

export async function sendServiceAgreementEmail(
  args: ServiceAgreementEmailArgs
): Promise<boolean> {
  const resend = getResendClient();
  const appUrl = getAppUrl();
  const logoUrl = args.companyLogoUrl || `${appUrl}/logo-icon.png`;

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: args.email,
      subject: "Your service agreement is ready",
      html: `
        <div style="margin:0; padding:0; background:#f3f4f6;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; max-width:640px; margin:0 auto; padding:32px 16px;">
            <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
              <div style="padding:28px 28px 20px; border-bottom:1px solid #eef2f7;">
                <div style="display:flex; align-items:center; gap:12px;">
                  <img src="${escapeHtml(logoUrl)}" alt="" width="44" height="44" style="border-radius:10px; object-fit:cover;" />
                  <div>
                    <p style="margin:0; color:#6b7280; font-size:13px;">Service agreement from</p>
                    <h1 style="margin:2px 0 0; color:#111827; font-size:22px; line-height:1.25;">${escapeHtml(args.companyName)}</h1>
                  </div>
                </div>
              </div>

              <div style="padding:28px;">
                <p style="margin:0 0 16px; color:#111827; font-size:17px; line-height:1.5;">Hi ${escapeHtml(args.clientName)},</p>
                <p style="margin:0 0 22px; color:#374151; font-size:15px; line-height:1.7;">
                  ${escapeHtml(args.companyName)} prepared your service agreement for review. Sign in to your SCRUB client portal to accept or decline it.
                </p>

                <div style="border:1px solid #e5e7eb; border-radius:10px; padding:18px; background:#fafafa; margin:0 0 22px;">
                  <p style="margin:0 0 4px; color:#6b7280; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.04em;">Agreement</p>
                  <h2 style="margin:0 0 14px; color:#111827; font-size:20px; line-height:1.3;">${escapeHtml(args.agreement.title)}</h2>
                  <table style="width:100%; border-collapse:collapse;">
                    ${detailRow("Address", args.agreement.propertyAddress)}
                    ${detailRow("Service frequency", args.agreement.serviceFrequencyLabel)}
                    ${detailRow("Price", args.agreement.priceSummary)}
                    ${detailRow("Billing schedule", args.agreement.billingSchedule)}
                    ${detailRow("Start date", args.agreement.effectiveStartDate)}
                  </table>
                </div>

                <p style="text-align:center; margin:30px 0 16px;">
                  <a href="${escapeHtml(args.viewUrl)}" style="background-color:#111827; color:#ffffff; padding:13px 22px; border-radius:7px; text-decoration:none; display:inline-block; font-size:15px; font-weight:700;">
                    View Agreement
                  </a>
                </p>
                <p style="margin:0; color:#6b7280; font-size:13px; line-height:1.6; text-align:center;">
                  This link opens your authenticated SCRUB client portal.
                </p>
              </div>

              <div style="padding:18px 28px; background:#f9fafb; border-top:1px solid #eef2f7;">
                <p style="margin:0; color:#6b7280; font-size:12px; line-height:1.6;">
                  Sent by ${escapeHtml(args.companyName)} through SCRUB.
                  ${args.companyEmail ? ` Contact: ${escapeHtml(args.companyEmail)}.` : ""}
                  ${args.companyPhone ? ` ${escapeHtml(args.companyPhone)}.` : ""}
                </p>
              </div>
            </div>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("[email] Failed to send service agreement email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error sending service agreement email:", err);
    return false;
  }
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
            <img src="${getAppUrl()}/logo-icon.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
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

export async function sendClientPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const resend = getResendClient();
  const resetLink = `${getAppUrl()}/client/reset-password/${token}`;
  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Reset your SCRUB Client Portal password",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <h2 style="text-align: center; color: #111;">Reset your Client Portal password</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">Use the secure link below to reset the password for your SCRUB Client Portal access.</p>
          <p style="text-align: center; margin: 28px 0;"><a href="${resetLink}" style="background-color: #111; color: #fff; padding: 12px 18px; border-radius: 6px; text-decoration: none;">Reset Client Portal Password</a></p>
          <p style="color: #9ca3af; font-size: 13px;">This link expires in 1 hour. If you did not request it, you can safely ignore this email.</p>
        </div>`,
    });
    if (error) {
      console.error("[email] Failed to send client password reset email");
      return false;
    }
    return true;
  } catch {
    console.error("[email] Error sending client password reset email");
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
            <img src="${appUrl}/logo-icon.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
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
            <img src="${appUrl}/logo-icon.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
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
            <img src="${appUrl}/logo-icon.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
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
            <img src="${appUrl}/logo-icon.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
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

/**
 * Send an affiliate program invite email.
 * Separate from the employee invite — different subject, copy, and expiry note.
 * Returns true if sent successfully, false otherwise.
 */
export async function sendAffiliateInviteEmail(
  email: string,
  inviteToken: string,
  name?: string
): Promise<boolean> {
  const resend = getResendClient();
  const inviteLink = `${getAppUrl()}/invite/${inviteToken}`;

  const greeting = name ? `Hi ${name}, you've` : "You've";

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "You've been invited to the SCRUB Affiliate Program",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${getAppUrl()}/logo-icon.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
          </div>
          <h2 style="text-align: center; color: #111; font-size: 22px; margin: 0 0 16px;">SCRUB Affiliate Program</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">${greeting} been invited to join the SCRUB Affiliate Program. Set up your affiliate account to start earning referral commissions.</p>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">No subscription or payment required.</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${inviteLink}" style="background-color: #111; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 15px; font-weight: 500;">
              Accept Invite
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">This link expires in 7 days. If you weren't expecting this invite, you can safely ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      console.error("[email] Failed to send affiliate invite email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error sending affiliate invite email:", err);
    return false;
  }
}

/**
 * Send a partner connection invite email.
 * Notifies an existing owner that another company wants to connect.
 */
export async function sendPartnerInviteEmail(
  email: string,
  fromCompanyName: string
): Promise<boolean> {
  const resend = getResendClient();
  const appUrl = getAppUrl();

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: `${fromCompanyName} wants to connect on SCRUB`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${appUrl}/logo-icon.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
          </div>
          <h2 style="text-align: center; color: #111; font-size: 22px; margin: 0 0 16px;">Partner Connection Request</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;"><strong>${fromCompanyName}</strong> wants to connect with you on SCRUB for job sharing. Log in to accept or decline the request.</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${appUrl}/partners" style="background-color: #111; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 15px; font-weight: 500;">
              View Request
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">If you weren't expecting this, you can safely ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      console.error("[email] Failed to send partner invite email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error sending partner invite email:", err);
    return false;
  }
}

export type PartnerSharedJobEmailArgs = {
  email: string;
  fromCompanyName: string;
  toCompanyName: string;
  propertyName: string;
  serviceType: string;
  scheduledDate: string;
  startTime?: string;
  durationMinutes: number;
  notes?: string;
  copiedJobId: string;
  timezone: string;
  language?: "en" | "es";
};

function formatSharedJobTime(startTime: string | undefined, durationMinutes: number): string | undefined {
  if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) return undefined;
  const [hours, minutes] = startTime.split(":").map(Number);
  if (hours > 23 || minutes > 59) return undefined;
  const end = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(end / 60) % 24;
  const endMinutes = end % 60;
  return `${startTime}–${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}

export function renderPartnerSharedJobEmail(args: PartnerSharedJobEmailArgs) {
  const appUrl = getAppUrl();
  const fromCompanyName = escapeHtml(args.fromCompanyName);
  const toCompanyName = escapeHtml(args.toCompanyName);
  const propertyName = escapeHtml(args.propertyName);
  const serviceType = escapeHtml(args.serviceType.replace(/_/g, " "));
  const scheduledDate = escapeHtml(args.scheduledDate);
  const timezone = escapeHtml(args.timezone);
  const time = formatSharedJobTime(args.startTime, args.durationMinutes);
  const notes = args.notes?.trim() ? escapeHtml(args.notes.trim()) : undefined;
  const jobUrl = `${appUrl}/jobs/${encodeURIComponent(args.copiedJobId)}`;
  const spanish = args.language === "es";
  const safeSubjectCompany = args.fromCompanyName.replace(/[\r\n]+/g, " ").trim();

  return {
    subject: spanish ? `Nuevo trabajo compartido de ${safeSubjectCompany}` : `New shared job from ${safeSubjectCompany}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px 12px; color: #111827;">
        <div style="text-align: center; margin-bottom: 24px;"><img src="${appUrl}/logo-icon.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" /></div>
        <h2 style="font-size: 22px; line-height: 1.3; margin: 0 0 16px; text-align: center;">${spanish ? `${fromCompanyName} compartió un trabajo con tu empresa` : `${fromCompanyName} shared a job with your company`}</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #374151;">${spanish ? `${toCompanyName} recibió un trabajo compartido de ${serviceType} en <strong>${propertyName}</strong>. Revisa los detalles y acepta o rechaza el trabajo en SCRUB.` : `${toCompanyName} received a shared ${serviceType} job at <strong>${propertyName}</strong>. Review the details and accept or decline the job in SCRUB.`}</p>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 14px; line-height: 1.7;">
          <div><strong>Location:</strong> ${propertyName}</div>
          <div><strong>Service:</strong> ${serviceType}</div>
          <div><strong>Date:</strong> ${scheduledDate}</div>
          ${time ? `<div><strong>Time:</strong> ${escapeHtml(time)} (${timezone})</div>` : ""}
          ${notes ? `<div style="margin-top: 8px;"><strong>Job notes:</strong><br />${notes.replace(/\r?\n/g, "<br />")}</div>` : ""}
        </div>
        <p style="font-size: 14px; font-weight: 600; color: #991b1b;">${spanish ? "Respuesta requerida" : "Response required"}</p>
        <p style="text-align: center; margin: 28px 0;"><a href="${jobUrl}" style="background-color: #111; color: #fff; padding: 12px 18px; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 15px; font-weight: 600;">${spanish ? "Revisar trabajo compartido" : "Review Shared Job"}</a></p>
        <p style="text-align: center; color: #9ca3af; font-size: 12px;">Powered by SCRUB</p>
      </div>`,
  };
}

export async function sendPartnerSharedJobEmail(args: PartnerSharedJobEmailArgs): Promise<boolean> {
  try {
    const resend = getResendClient();
    const rendered = renderPartnerSharedJobEmail(args);
    const { error } = await resend.emails.send({ from: getFromEmail(), to: args.email, ...rendered });
    if (error) {
      console.error("[email] Failed to send partner shared-job email");
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] Error sending partner shared-job email", error instanceof Error ? error.message : "Unknown error");
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
            <img src="${getAppUrl()}/logo-icon.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
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

export async function sendClientInviteEmail(
  email: string,
  inviteToken: string,
  name?: string
): Promise<boolean> {
  const resend = getResendClient();
  const inviteLink = `${getAppUrl()}/client/accept-invite/${inviteToken}`;
  const greeting = name ? `Hi ${name},` : "Hi,";

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Your SCRUB client access",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${getAppUrl()}/logo-icon.png" alt="SCRUB" width="48" height="48" style="border-radius: 8px;" />
          </div>
          <h2 style="text-align: center; color: #111; font-size: 22px; margin: 0 0 16px;">Set up your SCRUB client access</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">${greeting} you've been invited to view your cleaning service records in SCRUB. Click below to set your password.</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${inviteLink}" style="background-color: #111; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none; display: inline-block; font-size: 15px; font-weight: 500;">
              Accept Invite
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">This free client access link expires in 72 hours. If you weren't expecting this invite, you can safely ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      console.error("[email] Failed to send client invite email:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error sending client invite email:", err);
    return false;
  }
}
