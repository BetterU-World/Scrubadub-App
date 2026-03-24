"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { sendSupportEmail } from "../lib/email";

/**
 * Public action: submit a contact form message.
 * Sends the message via Resend to the support destination email.
 */
export const submitContactForm = action({
  args: {
    name: v.string(),
    email: v.string(),
    subject: v.string(),
    message: v.string(),
  },
  handler: async (_ctx, args) => {
    const { name, email, subject, message } = args;

    // Basic validation
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      throw new Error("All fields are required.");
    }
    if (name.length > 200 || email.length > 254 || subject.length > 300 || message.length > 5000) {
      throw new Error("One or more fields exceed the maximum length.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Please provide a valid email address.");
    }

    const sent = await sendSupportEmail(name.trim(), email.trim(), subject.trim(), message.trim());
    if (!sent) {
      throw new Error("Failed to send message. Please try again or email us directly.");
    }

    return { success: true };
  },
});
