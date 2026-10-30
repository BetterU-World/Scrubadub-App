# Owner App Guide

Use this guide to run your business in SCRUB. It explains the application, not cleaning procedures, company policies, or legal requirements. Uploaded manuals and company documents are separate resources.

## 1. First Steps and Your First Job

Start with one property and one worker so you can check the whole process.

1. Sign in as Owner. In **Settings**, check company details and your SCRUB subscription; job creation requires active company access.
2. Open **Properties → Add Property**. Save the location, address, access instructions, and service notes.
3. Open **Workers** and invite a Cleaner with their name and email. They accept the invitation and create a password. Verify Active status before assigning work.
4. Open **Jobs → Schedule Job**. Select the property, service type, date, time, duration, and an active individual worker or team. Review whether worker confirmation is required, then save.
5. Open the saved job and verify its location, schedule, assignment, and status. Scheduled work awaiting acceptance differs from work created already Confirmed.
6. The worker starts work, reports required inventory, and submits the cleaning form and job together. Find Submitted work in **Jobs** or the awaiting-approval count on **Overview**.
7. Review the work and choose **Approve** or **Request Rework**. Verify the resulting status. Work approval does not itself approve compensation, create an invoice, or send money.

## 2. Finding Your Way Around SCRUB

**Overview** shows operational counts, upcoming work, and work needing review. **Jobs** is the job list; **Calendar** is a dated view. On a phone, use **More** or the navigation menu for other pages.

- **Requests** holds prospective leads and sales follow-up.
- **Clients** holds company client records and access information.
- **Job Requests** handles service requests from existing clients. A requested appointment is not a confirmed booking.
- **Invoices** concerns customer billing. **Payments** concerns worker and partner compensation. **Financials** reports invoice totals.

Use the language switcher for English or Spanish. Some screens still use English labels. Find this guide under **Manuals → Owner App Guide**; use the [Cleaner App Guide](/manuals/cleaner) for detailed cleaning-form steps.

## 3. Company Settings and Service Add-Ons

1. Open **Settings → Company Identity & Branding** to maintain company identity, contacts, document presentation, and default property-condition checks. Save and reopen to verify changes.
2. Open **Add-Ons** to maintain service extras and prices. Check an item's active status and pricing before using it.
3. Select applicable extras in the supported proposal or job-pricing workflow and review the result. Catalog changes do not automatically add extras to every existing agreement, job, or invoice.

Keep the SCRUB subscription, Stripe setup for client invoice payments, and records of outside payments to workers/partners separate.

## 4. Clients, Contacts, and Client Portal Access

1. Open **Clients** to create or find the company client relationship. Check contact details, status, and linked locations before making duplicates.
2. Open the client record to find linked leads, properties, commercial accounts, proposals, agreements, invoices, and jobs. Follow those links to continue work.
3. Invite the client through the access controls on their record or the supported Request invitation action. Check the recipient email first; creating a client record does not create sign-in credentials.
4. Verify the invitation/access state. The client must accept their invitation before authenticated portal access is ready. Resolve missing email, inactive access, or incorrect links before sending documents that require access.

Client records, property service contacts, and login access are different. An email address alone does not establish portal access or link every document to that client.

## 5. Properties, Inventory, and Condition Checks

### Configure a property

1. Open **Properties → Add Property**, or edit a property. Check type, address, client association, rooms, amenities, access instructions, and notes. Save before scheduling work.
2. Set property-condition checks through the company default or property override. These determine condition-check sections prepared for jobs, not proof of a physical inspection.
3. Use **History** to review past work. Archive locations no longer in active use; restore them through **Settings → Archived Properties** when appropriate.

### Create and maintain an inventory template

**Before you start:** decide which supplies each property should carry and who should restock them. A par level is the target quantity to compare against, not a purchase order.

**Steps**

1. Open **Inventory Templates → New Template**. Enter a template name and choose **Add Item**.
2. For each item, enter its name, category, **Par Level**, whether reporting is **Required**, **Restock By**, and any notes. Categories include Bathroom, Kitchen, Bedroom, General, and Outdoor.
3. Choose **Save Template**. Reopen it to check the items. Use **Edit Template** for changes, **Set as Default** to flag the preferred template, or **Delete** after reading the confirmation.

**Check the result:** the saved template appears with the expected items and Default badge when selected. Apply it explicitly to each property; setting a default does not establish that a new property received its inventory.

**Common blockers:** a name and at least one item are required. Deletion keeps inventory already copied to properties. Editing a template does not automatically update those properties. Template duplication and archiving are not offered.

### Apply a template or maintain property inventory

**Before you start:** review the property's existing inventory and the template's item names.

**Steps**

1. Open **Properties → selected property → Inventory**. Select the template through **Apply Template**.
2. Read the replacement warning, then confirm **Apply Template**. **This replaces the property's item list.** Existing quantities and last-check data survive only for exact-name matches; items absent from the template are removed from this property's inventory.
3. Use **Add Item** or the available item editing/removal controls for property-specific changes. Review names, categories, target quantities, required reporting, and restock responsibility, then save changes.

**Check the result:** inspect the property's resulting list and quantities, including items you expected to retain. A saved template alone does not configure a property.

**Common blockers:** applying another template is another replacement, not an addition to the current list. Review missing items before changing the property again.

### Review job inventory and understand cleaning tasks

**Before you start:** configure property inventory before execution starts. The job's inventory-reporting list is copied when work starts, not when the job is first scheduled.

**Steps**

1. Workers report inventory as **OK**, **Low**, **Out**, or **Restocked**, with quantity and notes where used. Required reporting means supplying a status; it does not mean every item must be sufficiently stocked.
2. Open the job detail inventory report to review items reported, quantities against par levels, and notes. Arrange any needed restocking with the responsible person.
3. Review the separate cleaning form. Its tasks come from built-in templates selected by job type and relevant property type; the form is created when execution starts. There is no general Owner task/checklist builder.
4. Use company/property condition-check settings for the supported condition sections. Standard Mode checks tasks individually; eligible Cleaners deliberately confirm sections in Fast Mode. See Section 7. Review photos and explicitly reported red flags separately; see Section 10.

**Check the result:** verify the job-level report and cleaning form independently. Required inventory and cleaning tasks both matter for submission, but they are different lists.

**Common blockers:** reporting does not automatically update property stock, create purchase orders, or create restock tasks. Property edits after job start do not automatically rewrite the saved report. Photos, red flags, and inventory reports are separate; photos are not universally required and a Low/Out report does not automatically create a red flag. Use the [Cleaner App Guide](/manuals/cleaner) for execution details.

## 6. Workers, Teams, Invitations, and Manager Permissions

1. Open **Workers** to invite a Cleaner, Maintenance worker, or Manager. Check role, email, and invitation status. Expired/revoked links need a usable new invitation; someone who already accepted should sign in.
2. Open Worker Detail for available onboarding, document, work, and performance information. A required PDF, a completion acknowledgment, and Owner review are different records; do not assume a signed file exists.
3. Create a team, add active members, and identify its lead. Assign either a team or individual workers to a job. Members share work, but final team submission requires the lead or an authorized Manager/Owner.
4. Review and save specific Manager permissions. Presets are starting points, not unrestricted Owner access. Delegate job creation, assignment, scheduling, quality review, clients, sales, team operations, documents, invoices, financials, analytics, and operational settings only as needed.
5. Check the saved permissions and active status. Missing controls may reflect missing authority. Manager-permission administration and other Owner-only worker controls remain restricted.

**Manage team operations** permits supported team administration, including Fast Mode eligibility changes. It does not grant all worker-profile, pay, compliance, role, or Owner settings. Maintenance uses different forms and requires a compatible assignment.

## 7. Fast Mode Eligibility

1. In **Workers**, find an active Cleaner and use **Allow Fast Mode**. Owners can also use it on Worker Detail. A Manager needs delegated team-management authority.
2. Verify the change saved. Missing eligibility means unauthorized; experience, assignment, or team membership does not grant it automatically.
3. Cleaners start each form in **Standard Mode**, checking items individually. An eligible cleaner intentionally selects **Fast Mode**, visually inspects every task in a section, then chooses **Confirm [Section] Complete**. Only that section's unfinished items are completed.
4. Revoke eligibility with the same control. Future section confirmations are blocked, and the updated form returns to Standard Mode. Previously completed work and confirmation history remain saved.

Fast Mode is for active Cleaner execution accounts, not Maintenance or Manager roles. It does not bypass required inventory, actual performed-worker confirmation, or final submission. Section confirmation records a worker's confirmation, not proof of physical cleaning quality.

## 8. Creating and Assigning Jobs

1. Open **Jobs → Schedule Job**. Select a property and Standard Clean, Deep Clean, Turnover, Move In/Out, Post-Construction, or Maintenance as appropriate.
2. Set schedule, duration, instructions, individual/team assignment, and Manager where applicable. Choose active workers with roles compatible with the work.
3. Review the worker-confirmation option. Required confirmation starts the job Scheduled; disabling it creates Confirmed work. Confirmed therefore does not always mean personal acceptance by a worker.
4. Save and verify job detail. Use offered editing/reassignment controls when plans change. Read cancellation reasons; **Other** requires an explanation. Submitted and Approved jobs cannot be cancelled normally.

For simple one-time work, open [Quick One-Time Job](/jobs/quick). Choose an existing location or create a permitted new one, add contact/schedule details, and review assignment and customer charge when used. An operational job is not automatically ready for invoicing.

The usual path is Scheduled/Confirmed → In Progress → Submitted → Approved. Rework Requested requires correction and resubmission; Cancelled and Denied are separate outcomes. If assigned to execute cleaning yourself, use **Open Checklist** on job detail and the [Cleaner App Guide](/manuals/cleaner). Owner access alone is not an execution assignment.

## 9. Calendar, Availability, and Property Calendar Feeds

### Use the operational calendar and availability

1. Open **Calendar**, choose month/week/day, and check dates and filters. Open a job for its current details; viewing it does not change its assignment.
2. Check availability when assigning work. Workers maintain weekly hours and day overrides. **Day overrides require at least 14 days' notice**; availability changes do not cancel existing assignments.

Availability is scheduling information, not guaranteed conflict prevention. Unavailable overrides take priority in the current assignment display; an Available override may still show unavailable when that weekly day is unavailable. Check hours and commitments directly.

### Connect an Airbnb, Vrbo, or other iCal feed

**Before you start:** have the property saved, applicable subscription access, and the listing's iCal export URL. This imports a calendar feed; it is not a direct Airbnb API connection or general two-way Google/Outlook synchronization.

**Steps**

1. In the booking provider, copy the listing's calendar export URL. For Airbnb, follow its [official calendar-export instructions](https://www.airbnb.com/help/article/99): open the listing calendar, then Availability → Connect calendars → Connect to another website, and copy the link.
2. Open **Properties → selected property → Calendar**. In **Calendar Feed**, choose Airbnb, Vrbo, or Other, enter **iCal Feed URL** and an optional label, then choose **Connect Feed**.
3. In **Job Automation**, choose **Configure** (or **Edit** for an existing rule), enable job creation as needed, and choose **Save Rules**. A saved enabled rule is required. New-rule defaults are Turnover, 180 minutes, and 16:00; review the offered custom-time or unset-time choices.
4. Choose **Sync Now**, or wait for background synchronization. Saving a feed does not immediately fetch it. Background checks run about every 15 minutes; after a successful sync, ordinary eligibility is about 60 minutes later. Updates are not real time.
5. Check connection status and **Synced Reservations**. Inspect dates and resulting work in **Jobs**, then assign a compatible worker or team. Generated jobs have no automatically selected worker/team.

**Check the result:** verify five separate milestones: feed saved, synchronization succeeded, reservation imported, job generated, and worker assigned. A connection or imported reservation alone does not prove work is ready.

**Common blockers:** the event end date is used as checkout/service date. Reservations can be imported without generating jobs: checkout dates on or before the connection-creation date are excluded by its historical cutoff, and past checkouts are skipped. Duplicate protection covers non-cancelled calendar-generated jobs for the same property/date, not independently created manual jobs. Review feed events before relying on them; availability blocks may also appear as cleaning candidates.

### Reconcile changes, errors, and disconnection

**Before you start:** compare the provider's booking information with the reservation and job already saved in SCRUB.

**Steps**

1. Review **Dates changed** and **Review needed** flags. Changed checkout dates flag linked reservations rather than automatically rescheduling jobs. Missing/cancelled reservations flag linked work for review rather than automatically cancelling jobs.
2. Inspect the existing job and decide whether its schedule or cancellation needs changing. Keep manual job edits in mind. The reservation's **View job** control opens the general jobs list; locate the matching property/date there.
3. For **Sync error**, read the connection error, correct the export URL through **Update Feed**, and retry **Sync Now**. If disabled after three consecutive unsuccessful attempts, explicitly re-enable the connection after correcting the problem. Busy/cooldown messages mean an attempt is underway or a short wait is required.
4. Use **Remove feed** to disconnect after reviewing existing work. Removal stops this connection's synchronization; it does not delete existing jobs/history.

**Check the result:** verify the latest sync result and the actual job schedule/assignment after reconciliation. If multiple feeds exist, this screen manages the primary connection; other connections can continue syncing.

**Common blockers:** no jobs may mean no saved enabled rule, a cutoff/past checkout, a duplicate generated job, or a failed/disabled feed. Do not repeatedly create manual work without checking for an existing generated job.

## 10. Reviewing Work, Inspections, Red Flags, and Rework

1. Open a Submitted job from **Jobs** or **Overview**. Review checklist entries, notes, attached photos when present, performed workers, and available Manager inspections.
2. Choose **Approve** or **Request Rework** with clear correction notes. Verify the new job status.
3. For rework, the worker starts the correction round, updates work, checks required inventory again, and resubmits. Review the new Submitted work before approval.
4. Open **Red Flags** for explicitly reported problems. Review category, description, and severity: Low, Medium, High, or Critical. Update status when addressed; create and verify a Maintenance assignment where appropriate.

Ordinary submission does not automatically report every problem as a red flag. Photos are not universally mandatory. Work approval, inspection, issue resolution, compensation approval, and customer payment are separate milestones. Use inspection/reinspection controls only when offered for the current job state.

## 11. Handling Existing-Client Job Requests

### Decide and verify an existing client's service request

**Before you start:** use **Job Requests** for authenticated existing-client requests; **Requests** handles public inquiries and sales follow-up. An active client relationship, available linked service location, and valid non-past schedule are required. Managers need scheduling authority.

**Steps**

1. Open **Job Requests** and select the request. Check client, location, service, preferred schedule, notes, add-ons, and pricing. The preferred appointment is not a confirmed booking.
2. To accept, enter the final date/time, service, and duration, choose **Accept and schedule**, then review and confirm **Create scheduled job**.
3. For another schedule, choose **Propose another time**, enter date, start time, duration, service, and any client-facing note, then **Send proposed time**. Check that it awaits the client's response; the client can accept or decline. Acceptance creates the linked job.
4. While a proposal is pending, use **Replace proposal** to offer a new schedule or **Withdraw proposal** to remove that offer. Withdrawal does not decline the underlying request.
5. If service cannot be provided, choose **Decline request**, add a client-facing explanation when helpful, and confirm **Confirm decline**. Internal notes are separate from that explanation.
6. Verify the final schedule and **View linked job**. Open that job and check or add the worker/team assignment. Scheduling does not establish accepted pricing or an assigned cleaner.

**Check the result:** an accepted schedule has a linked real job with the correct date/time. A pending proposal is still awaiting the client, not scheduled work.

**Common blockers:** resolve inactive/missing clients or locations, invalid dates/times, and unsupported duration/service before retrying. Use advanced sales tools only when needed; a proposal or agreement does not replace the Job Request scheduling decision.

## 12. Leads, Walkthroughs, and Proposals

### Bring an inquiry into Requests and organize follow-up

**Before you start:** public forms and My Site inquiries create sales leads, not confirmed jobs or authenticated client accounts. Review existing records before creating duplicates.

**Steps**

1. Open **Requests → List View** for public inquiries and manual leads. To enter one yourself, choose **New Lead**, enter contact/location and service details, select a lead type, and choose **Create Lead**.
2. Open the lead and review **Lead details**. Types include Booking Request, Residential, STR/Airbnb, Commercial, Move Out, Post Construction, and Other. Save changes with **Save Lead Details**; use **Mark Contacted** after contacting the prospect.
3. Use **Pipeline View** to see New → Qualification → Walkthrough → Proposal → Decision → Agreement → Onboarding → Converted, plus Closed for closed outcomes. Positions are computed from the request and linked records. Open a card's **Next action** to continue; this is not a drag-and-drop board.
4. Search by name, email, company, or address; filter by lead type or attention and sort by attention, newest, or oldest. Overdue means a follow-up date has passed; stale means seven days without recognized activity.
5. In request detail, expand **Lead Pipeline**, enter **Lead Notes (internal)** and **Save Notes**, then set/save **Next Follow-up**. Keep client-facing communication separate from internal notes.

**Check the result:** reopen the lead to verify saved details, notes, follow-up date, linked records, and the pipeline's current next action.

**Common blockers:** a follow-up date does not promise an automatic reminder. Public/manual submissions are not automatically merged just because contact details match. Pipeline position is not proof of a scheduled, assigned job.

### Schedule and complete a walkthrough when needed

**Before you start:** open the correct Request and have its contact/location details. A walkthrough is optional for some proposals, but a proposal sourced from a walkthrough requires that assessment to be completed.

**Steps**

1. In the Request's **Walkthrough** section, choose **Schedule Walkthrough**. Enter the date and start time, optional end time, eligible active same-company Owner/Manager assignee, and scheduling notes; save the appointment.
2. Record the supported property facts, rooms, service/scope findings, estimated effort, staffing/frequency recommendations, and pricing information. Review any linked-property changes before saving.
3. Save findings, then choose **Mark Completed** when the assessment is finished. Explicitly create the proposal afterward; completion does not send one.
4. To reschedule, edit and save the appointment. To cancel the appointment, change its appointment status to Cancelled and save. Archiving the assessment is a separate action.

**Check the result:** verify the saved appointment/assignee, completed assessment, and any proposal link. Check calendar visibility for a scheduled visit.

**Common blockers:** scheduled appointments need a date/start time and an eligible assignee when assigned. Use the existing linked proposal rather than creating another from the same walkthrough.

### Create, review, send, and revise a proposal

**Before you start:** use the correct lead or completed walkthrough. Check contact information and any client/location links.

**Steps**

1. Choose **Create Proposal** from the lead or completed walkthrough. Review scope, frequency, price, recipient, and requested/catalog/custom add-ons. Save each add-on line and finalize prices before sending.
2. Choose **Save Proposal** and use **Review Proposal** to inspect the saved content. Confirm what the client will receive.
3. Choose **Send Proposal** to initiate SCRUB email delivery, or **Mark Sent Without Email** only to record sending outside SCRUB. Check delivery information separately from proposal status.
4. The client can accept/decline through the supported client-facing response. Use **Mark Accepted Outside** or **Mark Declined Outside** only to record an actual external response.
5. For a sent proposal that needs revision, use **Make changes** to return it to draft before editing. Save/review and send the revision; the previous client link is no longer valid. Check issue history for previously sent content.

**Check the result:** verify saved content, delivery evidence, and Draft/Sent/Accepted/Declined state. Acceptance does not automatically schedule a job; continue with Section 13.

**Common blockers:** pending delivery, missing recipient details, incomplete pricing, and finalized states restrict editing/sending. Accepted/declined proposals are not ordinary editable drafts. Do not use an outside-response control to imply that SCRUB delivered or verified that response.

## 13. Service Agreements and Converting Sales into Work

### Prepare and deliver a service agreement

**Before you start:** open an accepted proposal and decide whether an agreement is needed. Check client/location links and recipient details; set up required Client Portal access separately through the invitation controls.

**Steps**

1. Choose **Create Service Agreement**. Open the resulting draft; if one already exists for this proposal, continue with it. Review template, client/location, scope, service schedule, price, and terms.
2. Choose **Save Agreement** and review the saved document/client preview. Use **Mark Ready** where offered, then the available issue/email action or **Send Service Agreement**. Use **Record outside-SCRUB send** only for delivery arranged outside SCRUB.
3. Check issue history, current status, and delivery information. Documents Hub under **Settings → Documents → Client Documents** lists the document; return to its original Request or Commercial Account to continue the workflow. Templates there do not automatically rewrite existing documents.
4. Review the client's acknowledgment/decline. Acknowledgment is not an electronic signature. Clients sign and return copies outside SCRUB; use **Mark as Signed Outside SCRUB** only after receiving the signed copy. Distinguish **Acknowledged** from **Signed Copy Received**.

**Check the result:** verify the saved/issued version, delivery state, response, and any outside signed-copy record. An emailed agreement, client acknowledgment, and received signed copy are different milestones.

**Common blockers:** missing email, client links, required portal access, pending delivery, or document state can restrict actions. Recording outside delivery does not verify receipt. An agreement alone does not create a scheduled job.

### Choose the correct service setup path

**Before you start:** decide whether this is residential/one-time service or an eligible commercial account. Walkthroughs and agreements are optional stages where appropriate, not a guaranteed automatic funnel.

**Steps**

1. For residential/one-time work, check the Request's client relationship; use **Create Client Relationship** if needed. Classify the lead and add a valid address before **Create Property** when needed. Confirm the saved client/location links.
2. Explicitly schedule the service through the offered scheduling controls, enter the final service/date/time/duration, and confirm creation. Open the linked job to verify assignment. For authenticated existing-client Job Requests, follow Section 11.
3. For eligible commercial work from an accepted proposal, create the linked commercial account, review its client/location classification, then configure its schedule and explicitly generate jobs as described in Section 14.
4. Use **Invite Client** separately when portal access is needed. Verify invitation/access state; a client relationship is not a sign-in account.

**Check the result:** inspect the actual client, property/account, job dates, and worker assignments. A **Converted** pipeline position does not guarantee a scheduled, assigned job.

**Common blockers:** resolve missing/inactive records and incorrect residential/commercial classification before conversion. Follow existing linked records rather than creating duplicates. Work approval, invoicing, and payment remain later separate actions.

## 14. Commercial Accounts and Recurring Schedules

1. Open **Commercial Accounts** to create/open the right account, including supported conversion from accepted sales records. Check client/location links, status, terms, and assignments. Linked location classification matters; do not relabel residential work just to obtain commercial billing.
2. In **Schedule**, configure recurrence, dates, service details, individual/team assignment, and Manager where applicable. Save and verify status.
3. Explicitly generate jobs for a date range. **Each generation range is limited to 90 days** and requires an active account and schedule.
4. Review the result and generated jobs. Use offered pause/resume/end controls for service changes, then inspect already-created work separately.

### Verify the commercial setup branch

Create the account from the accepted proposal only when the linked service is eligible for commercial treatment. Check the client/account links, save the schedule, generate a bounded date range, and inspect actual generated jobs and assignments. Proposal acceptance and an agreement alone do not perform these steps.

A recurrence rule does not populate an unlimited future calendar. Generation and execution are separate. Use account billing for commercial work, not a duplicate job invoice.

## 15. Invoices and Client Payments

1. On an eligible approved non-commercial job, open its billing panel to create a draft. Check active client links and accepted pricing. For commercial work, use the account's invoice section and eligible work/billing period.
2. Review included jobs, prices, extras, totals, notes, and due terms. Save draft changes, issue the invoice, and verify Draft changed to Issued.
3. Send the issued invoice when recipient email and required portal access are ready. Issuing, emailing, and receiving payment are different events.
4. For online payments, complete Stripe setup through **Settings**, under client payments and payouts, and check readiness. Clients use supported invoice Checkout without needing their own Stripe account.
5. Inspect payment status and evidence. Where an outside-payment action is offered, use it only for an actual payment received and verify the result; emailing an invoice does not make it paid.

Missing accepted pricing, inactive clients, incomplete payment setup, or work already invoiced can block billing. Only drafts are editable; paid invoices cannot normally be voided. Do not recreate invoices/payments while confirmation is processing. Client payments are separate from worker/partner compensation.

## 16. Worker and Partner Compensation

1. Open the approved job's compensation section and review the confirmed performed workers. Explicitly approve supported amounts, or record the supported no-compensation decision and explanation. Assignment/completion alone does not establish an approved amount owed.
2. Open **Payments** for worker balances, approved amounts, recorded payments, outstanding items, and history. Select the worker/item to continue.
3. For shared work, review partner terms, the other company's response, and required financial approval. Operational sharing and accepted compensation terms are different records.
4. Record an outside payment through the available action only after paying outside SCRUB. Verify the record and remaining balance. Use supported corrections/adjustments rather than approving the same obligation again.

Records are declarations: SCRUB does not send or verify outside payments. Legacy worker-payment and partner-settlement pages are read-only history; historical OPEN settlements are not current compensation debt. Client invoice Checkout is separate.

## 17. Partner Connections and Shared Jobs

### Connect with another SCRUB company

**Before you start:** obtain the email associated with the other company's existing SCRUB Owner account. Partners does not offer a company discovery directory. Sending invitations/sharing work requires applicable subscription access; do not assume both companies need paid subscriptions to accept a connection.

**Steps**

1. Open **Partners → Send Connection Invite**, enter the other Owner's email, and choose **Send Invite**.
2. The receiving Owner opens **Partners → Incoming Requests** and chooses **Accept** or **Decline**. The sender can inspect **Outgoing Requests** while waiting.
3. After acceptance, check **Active Connections** for the company. Accepted connections also add partner contacts. **Add Contact** only saves an address-book entry; it does not invite or connect companies.

**Check the result:** the company appears as Connected in Active Connections. A saved contact or pending invitation is not an active connection.

**Common blockers:** check the exact Owner account email if no account is found. Your own company, an existing connection, or an already-pending invitation cannot be invited again. There is no pending-invitation withdrawal control here.

### Share work and manage the receiving copy

**Before you start:** have an active connection and an eligible job. Agree who will do the work before making assignments.

**Steps**

1. Open the job, choose **Share Job**, and **Select Partner** from active connections. Decide whether to **Share completion package (checklists/photos)**, then choose **Share Job** to submit.
2. The receiving Owner opens the copied job and accepts or rejects the shared-work request. Follow this acceptance-first process before assigning and executing work. Company acceptance is different from worker acceptance.
3. After acceptance, the recipient uses **Assign Cleaner** and manages its own copy's execution, submission, and review. Check the saved schedule, instructions, and assigned worker; sharing does not assign one automatically.
4. The sender checks the partner response and later available completion state/package. Review any checklist summary, notes, and shared photos actually present. The property details are a snapshot, not access to the sender's property directory; later property edits do not automatically update the copy.

**Check the result:** verify recipient acceptance, the copied job's assignment and work status, and available completion evidence. Keep the original and copied jobs distinct.

**Common blockers:** rejection cancels the receiving copy. Reassess responsibility and use supported assignment/other-partner choices; do not assume a rejected share can immediately be recreated for the same partner. Packages cannot contain photos never shared. A connection, shared-job acceptance, worker assignment, work approval, compensation approval, and payment are separate operations; see Section 16.

### End a connection

**Before you start:** review existing shared work and financial commitments with the partner.

**Steps**

1. Either connected company can open **Partners → Active Connections**, choose **Disconnect**, and confirm.
2. Check that the active connection is gone. Removing an address-book contact is separate and does not disconnect companies.

**Check the result:** the company is no longer an active partner for new sharing.

**Common blockers:** disconnection does not cancel existing copied jobs, erase financial records, approve compensation, or transfer money. Resolve existing work and compensation separately.

## 18. Documents Hub and Worker Documents

1. Open **Settings → Documents** to reach Documents Hub. **Client Documents** lists proposals and agreements with state and issue history; open their original Request or Commercial Account to continue.
2. Use **Templates** for supported service-agreement templates and the default for new agreements. Save and review before issuing. Template changes do not rewrite all existing/issued documents.
3. Use **Resources** for supported company files. To share one, open the client record and explicitly assign it through resource-sharing controls. Verify the assignment; upload alone does not make it client-visible.
4. Use **Team Documents** and its worker-PDF management link, or **Settings → Worker Documents**, to manage onboarding PDFs, requirement, audience, and visibility. Check the PDF is uploaded and active before expecting workers to read it.

App Guides under **Manuals** explain SCRUB. Cleaning procedures, policies, and uploaded reference manuals explain your company's work. Worker acknowledgment/review records do not establish that a signed PDF is stored. Documents Hub is not a universal business-document generator.

## 19. Reporting, Notifications, and Recorded Activity

Use **Overview** for work needing attention. **Performance** shows supported measures such as approved jobs, self-scores, time, consistency, and red flags. Self-scores are not client ratings or independent inspections.

Use **Analytics** for operational completion, rework, red flags, and worker/property comparisons. Use **Financials** for invoiced totals, paid revenue, outstanding balances, and invoice-status totals. These are not complete accounting, payroll, utilization, or tax reports.

Check the bell or **Notifications**, then open the related record for its latest state. **Audit Log** shows recorded account activity, not every interaction. Notification preferences marked coming soon are unavailable.

## 20. My Site, Feedback, Recruiting Leads, and Affiliates

### Configure, publish, and verify My Site

**Before you start:** prepare a business name, description, primary service area, and public contact details. The public URL is this SCRUB website's address followed by your unique slug, such as /your-company.

**Steps**

1. Open **My Site**. Choose an available **Slug (URL path)** using 3–50 lowercase letters/numbers/hyphens, and choose **Template A** or **Template B**.
2. Enter **Brand name**, **Bio**, and **Service area**. Add up to six additional service areas and eight service names. Set public email/phone explicitly; operational company contacts are not automatically displayed.
3. Optionally enter HTTPS **Logo URL** and **Hero image URL**, then **Meta description**. These are image links, not built-in upload/crop controls.
4. Leave the publication checkbox off and choose **Create site** or **Save changes** to save a draft. Reopen/check the saved fields. There is no dedicated unpublished draft-preview control.
5. Confirm business name, description, and primary service area, then select **Publish my mini-site and make these business details visible to everyone** and save again. Saving a draft and publishing are separate states. Previously configured older sites may already appear published; check the displayed state.
6. Use **Open** to inspect the published page, contact links, service presentation, images, and inquiry link, including on a phone. Publishing makes these details public; search metadata/sitemap support does not guarantee rankings.

**Check the result:** confirm Published status, the correct public URL, and a working inquiry link. The setup-completeness indicator is not visitor/conversion analytics; no Owner-facing microsite conversion report is currently offered.

**Common blockers:** a taken/reserved/invalid slug or missing required publication fields prevents publishing. Drafts are not public previews. Correct unusable image URLs and verify public contact details rather than relying on company settings.

### Share links and follow up on inquiries

**Before you start:** publish and check the page and inquiry link. If link generation reports an error, use **Retry** and verify the result before distribution.

**Steps**

1. In **Share Kit**, use **Website**, **Booking Link**, or **Employee Application** for the appropriate audience. Use the offered **Copy** and QR controls to distribute the intended link.
2. Customers use service/quote links to submit inquiries. Service selection and supported public add-ons can carry into intake; review the submitted request rather than assuming the chosen work is confirmed.
3. Open **Requests** to follow up on public inquiries using Sections 12–13. **Booking Link** is an inquiry form, not instant confirmed booking or payment. A submission does not automatically create a job or authenticated client account.
4. Direct existing clients to their authenticated Client Portal Job Requests when they need the linked-client/location workflow. Using the public form instead creates a public inquiry, not the same authenticated request.

**Check the result:** verify the correct request and its contact, service, and add-on details. Follow-up, pricing, scheduling, and assignment still require their own actions.

**Common blockers:** public inquiries belong in Requests, not automatically in Job Requests. Share Kit and some public/setup controls retain English labels. Future branding controls or conversion analytics are not current capabilities.

### Feedback, recruiting leads, and affiliates

- **Feedback:** review supported client feedback and feature it on your site where offered. This differs from worker self-scores and inspections.
- **Cleaner Leads:** review recruiting inquiries, update status, and invite when you decide to hire. A lead is not an active worker until the invitation/account process is complete.
- **Affiliate:** copy your referral link and review attributed revenue, ledger periods, and payouts. The current commission is 10%; locked periods and administrator processing govern payout requests. Affiliate Stripe setup is separate from retired worker/partner payment onboarding.

## 21. Troubleshooting and Getting Help

- **Missing controls:** check role, delegated permission, company access, and record state. Managers should ask the Owner about specific authority, not borrow credentials.
- **Job not ready:** check location, compatible assignment, status, inventory, checklist, and performed workers. Open job detail to verify submission/approval.
- **Request not booked:** inspect final scheduling and the linked job. A preferred appointment, accepted proposal, or sent agreement is not a scheduled assignment.
- **Cannot send:** check saved edits, recipient email, client links, portal access, current issue/status, and pending delivery. Read the error before retrying.
- **Payment/balance discrepancy:** distinguish client invoices, current compensation, and legacy history. Inspect evidence and adjustments before recording another payment.
- **Interrupted connection:** reconnect and reopen the same record. Check what saved before repeating conversion, invoicing, submission, or payment; unsaved edits may be lost.

### Workflow checks

- **Partner will not connect:** verify the other company's Owner email, incoming acceptance, and subscription access for sending; check for a same-company or existing/pending connection. A contact alone is not connected.
- **Inventory items disappeared:** applying a template replaces the list. Compare the template and exact item names before editing; matching quantity/check data is all that carries forward.
- **Report did not update stock:** job reports are separate from property quantities. Review the report and arrange/update stock through the property inventory controls.
- **Feed connected, no jobs:** check saved enabled Job Automation rules, sync status, imported checkout dates/cutoff, and existing generated work. Assign workers separately.
- **Calendar sync disabled/errors:** correct the feed, explicitly re-enable when disabled, then Sync Now. Inspect the latest result; do not assume saving repaired it.
- **Reservation changed:** compare the flagged reservation with its existing job and review scheduling/cancellation explicitly.
- **Accepted proposal, no job:** continue client/location setup and explicit scheduling or commercial generation. Check the linked job and assignment, not just pipeline position.
- **Missing client/property:** inspect links, active status, lead classification, and address before using Create Client Relationship/Create Property or scheduling.
- **Site saved, not visible:** check required name/description/primary area, publication checkbox, and save again. Use Open after publication.
- **Public inquiry in the wrong queue:** public forms feed Requests; authenticated existing-client service requests use Job Requests.

Use the [Cleaner App Guide](/manuals/cleaner) for checklist mechanics. For unresolved problems, note the job/client/date and displayed error, then contact your company administrator or SCRUB support at scrubadubsolutionsllc@gmail.com. Do not share passwords or invitation links.

*Last updated: October 30, 2026*
