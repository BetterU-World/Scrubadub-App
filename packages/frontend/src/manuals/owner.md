# Owner Manual

Welcome to SCRUB (powered by Scrubadub Solutions)! This manual covers everything you need to manage your cleaning business.

---

## Getting Started

After signing up and creating your company, you'll land on the **Dashboard**. This is your command center showing key metrics at a glance: active jobs, team members, properties, and any open red flags.

## Managing Properties

Navigate to **Properties** to add and manage the locations your team services.

- **Add a property** by clicking "Add Property" and filling in the address, name, and any special notes.
- **Edit or archive** a property from its detail page.
- Each property tracks its job history so you can review past work.

## Managing Employees

Use the **Employees** section to invite and manage your team.

- **Invite a team member** by entering their email. They'll receive an invitation to join your company.
- Assign roles: **Cleaner** or **Maintenance**.
- View each employee's job history and performance metrics.

## Scheduling Jobs

The **Jobs** section is where you create and manage cleaning assignments.

### Creating a Job

1. Click **Schedule Job**.
2. Select a property.
3. Choose the job type: Standard, Deep Clean, Turnover, Move In/Out, or Maintenance.
4. Set the date, start time, and estimated duration.
5. Assign one or more cleaners.

### Job Lifecycle

Jobs move through these statuses:

1. **Scheduled** — Job is created and assigned.
2. **Confirmed** — The assigned cleaner has confirmed they can do the job.
3. **In Progress** — Work has started.
4. **Submitted** — The cleaner has completed and submitted the job for review.
5. **Approved** — You've reviewed and approved the work.
6. **Rework Requested** — You've asked the cleaner to redo part of the job.

You can also **cancel** a scheduled or confirmed job if plans change.

### Reviewing Submitted Jobs

When a cleaner submits a job, it appears in your **Awaiting Approval** count on the dashboard. Open the job detail to review the submitted form, photos, and notes, then choose to **Approve** or **Request Rework**.

## Calendar

The **Calendar** view gives you a visual overview of all scheduled jobs. Use it to spot scheduling gaps or conflicts.

## Red Flags

**Red Flags** highlight issues that need attention — missed items, quality concerns, or client complaints.

- Red flags are created automatically based on job form submissions or can be raised manually.
- Each flag has a **severity** (low, medium, high) and **category**.
- Resolve flags from the Red Flags dashboard once the issue is addressed.

## Performance

The **Performance** page shows metrics for each team member:

- Jobs completed
- Approval rate
- Average rating
- Red flag count

Use this data to identify top performers and areas for coaching.

## Analytics

The **Analytics** section provides company-wide insights:

- Job completion trends
- Revenue tracking
- Property utilization
- Team workload distribution

## Notifications

You'll receive notifications for key events:

- Job confirmations and submissions
- Red flags raised
- Employee invitation responses

Check the **bell icon** or the Notifications page to stay up to date.

## Audit Log

The **Audit Log** records all significant actions in your account for accountability and transparency.

## Shared Jobs (Owner ↔ Owner)

SCRUB lets you share jobs with partner owners so you can collaborate on properties across companies.

### How Sharing Works

1. Open a job you've created and tap **Share**.
2. Select a connected partner from your **Partners** list.
3. The partner receives the job in their **Incoming Shared Jobs** inbox and can **Accept** or **Reject** it.

### Property Snapshot

When you share a job, SCRUB copies a **read-only snapshot** of the property details (name, address, beds, baths, amenities, and notes) into the shared job. This means:

- Your partner sees only the snapshot — they **cannot** access or browse your property records.
- No property data leaks between companies. The snapshot is a one-time copy embedded in the shared job.
- If you later update the original property, the snapshot on the shared job does **not** change.

### Editing a Shared Job

When your partner edits a shared job they received:

- The **property selector is hidden** — the property snapshot is read-only.
- They can change the assigned cleaners, job type, date, time, duration, and notes.
- They cannot reassign the job to a different property.

### Shared Job Statuses

Shared jobs move through: **Pending → Accepted → In Progress → Completed** (or **Rejected**).

- If rejected, you'll be notified and can share the job to another partner or assign it to your own cleaner.
- When the partner completes the job, you can review the completion package (checklist summary, notes, and photos if enabled).

---

## Settlements V2

Settlements track the money owed between you and your partners for shared jobs.

### OPEN vs PAID Tabs

Navigate to **Settlements** to see two tabs:

- **OPEN** — Settlements that still need payment.
- **PAID** — Settlements that have been completed.

Each settlement shows the partner company, associated job, and amount.

### Paying a Settlement

You have two options to pay an open settlement:

- **Pay via SCRUB** — Redirects you to a secure Stripe Checkout page. Once payment completes, the settlement automatically flips to **PAID** (no manual step needed). A receipt link will appear on the paid settlement.
- **Mark Paid** — Record an off-platform payment (Zelle, ACH, Cash, etc.). Enter the payment method and an optional note, then confirm.

### After Payment

Once a settlement is paid:

- It moves to the **PAID** tab.
- The settlement shows who paid and when.
- There is **no "owes you" messaging** after payment — the balance is cleared.

---

## Stripe Connect

Stripe Connect lets you receive payments from partners directly through SCRUB.

### Setting Up

1. Go to **Settings** and open the **Billing** section.
2. Click **Set up Stripe Connect** to begin Express onboarding.
3. Stripe will walk you through identity verification and bank account setup.
4. Once complete, your company is ready to receive settlement payments.

### Platform Fee

- A flat **$2.00 platform fee** is charged per settlement payment made via SCRUB.
- The fee is capped at the settlement amount (so a $1.50 settlement would incur only a $1.50 fee, not $2.00).

### Money Flow

When Owner 1 pays a settlement to Owner 2 via SCRUB:

1. Owner 1 pays the full settlement amount at Stripe Checkout.
2. Owner 2 receives the settlement amount **minus** the $2.00 platform fee.
3. The platform fee goes to Scrubadub Solutions.

---

## Cleaner Availability

Your cleaners can set their own availability so the scheduling system respects their working hours.

### Weekly Schedule

Each cleaner sets a recurring weekly schedule with available hours per day. When you schedule a job, the system shows which cleaners are available on that date.

### Day Overrides

Cleaners can mark specific dates as unavailable (for vacations, personal days, etc.) or explicitly available. **Overrides require at least 14 days' notice.** Once the 14-day window passes, the override is locked and cannot be changed.

### How Scheduling Uses Availability

- When you assign cleaners to a job, the system shows each cleaner's availability status for that date.
- Cleaners who have never set availability are treated as available by default.
- Cleaners with a weekly schedule are shown as unavailable only if they have no blocks for that day of the week.
- Day overrides take priority over the weekly schedule.

---

## Affiliate Program

SCRUB includes a built-in affiliate program that lets you earn commission by referring new users.

### Getting Started

Navigate to **Affiliate** in the sidebar to open the Affiliate Portal. When you first visit, a unique referral code is generated for you automatically. Your referral link is displayed on the **Referrals** tab — copy it and share it with anyone who might benefit from SCRUB.

### What Gets Tracked

The Affiliate Portal has four tabs (plus an admin-only tab):

- **Referrals** — Lists everyone who signed up using your referral link. You can also copy a ready-made social caption to share on messaging apps or social media.
- **Revenue** — Shows attributed revenue from your referrals, with lifetime, 30-day, and 7-day summaries. Commission is calculated at a **10% rate** on attributed invoice payments.
- **Ledger** — Breaks down your earnings into monthly or weekly periods. Each period shows attributed revenue, commission earned, and a status: **Open** (still accumulating), **Locked** (finalized and ready for payout), or **Paid** (commission distributed).
- **Payouts** — Connect your Stripe account to receive payouts electronically. Click **Connect Stripe for Affiliate Payouts** to begin Express onboarding. If your company already has a Stripe Connect account (from Settlements), it may be reused automatically.

### Requesting a Payout

Once one or more ledger periods are **Locked**, you can submit a payout request:

1. Go to the **Ledger** tab and select the locked periods you want to cash out.
2. Click **Request Payout**, add an optional note, and submit.
3. An administrator will review your request and either approve, deny (with a reason), or complete it as a payout batch.

Payouts can be processed via Stripe transfer (if you've connected your account) or recorded manually using Zelle, CashApp, Venmo, Cash, or another method.

### Current Limitations

- Commission rate is fixed at 10% — there are no tiered or custom rates at this time.
- Ledger periods must be locked by an administrator before you can request a payout.
- Stripe payout transfers are initiated by an administrator, not triggered automatically.
- Attribution is tracked only for direct referrals (the person who used your link).

---

## Tips for Success

- **Review submitted jobs promptly** to keep your team moving.
- **Check red flags daily** to catch issues early.
- **Use the calendar** to ensure balanced workloads across your team.
- **Monitor performance metrics** to reward great work and provide support where needed.

---

*Last updated: March 1, 2026*

*Need help? Contact support at scrubadubsolutionsllc@gmail.com*
