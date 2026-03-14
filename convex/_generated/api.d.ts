/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_affiliateStripeConnect from "../actions/affiliateStripeConnect.js";
import type * as actions_billing from "../actions/billing.js";
import type * as actions_cleanerPayments from "../actions/cleanerPayments.js";
import type * as actions_cleanerStripeConnect from "../actions/cleanerStripeConnect.js";
import type * as actions_companyStripeConnect from "../actions/companyStripeConnect.js";
import type * as actions_emailNotifications from "../actions/emailNotifications.js";
import type * as actions_manuals from "../actions/manuals.js";
import type * as actions_publicBilling from "../actions/publicBilling.js";
import type * as actions_settlements from "../actions/settlements.js";
import type * as actions_stripeConnect from "../actions/stripeConnect.js";
import type * as actions_stripePayouts from "../actions/stripePayouts.js";
import type * as auth from "../auth.js";
import type * as authActions from "../authActions.js";
import type * as authInternal from "../authInternal.js";
import type * as authQueries from "../authQueries.js";
import type * as clientPortalActions from "../clientPortalActions.js";
import type * as clientPortalInternal from "../clientPortalInternal.js";
import type * as employeeActions from "../employeeActions.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_founderEmails from "../lib/founderEmails.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_password from "../lib/password.js";
import type * as lib_perfLog from "../lib/perfLog.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_slugs from "../lib/slugs.js";
import type * as lib_stripe from "../lib/stripe.js";
import type * as lib_subscriptionGating from "../lib/subscriptionGating.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as lib_validation from "../lib/validation.js";
import type * as lib_validators from "../lib/validators.js";
import type * as mutations_affiliate from "../mutations/affiliate.js";
import type * as mutations_affiliateLedger from "../mutations/affiliateLedger.js";
import type * as mutations_affiliatePayoutBatches from "../mutations/affiliatePayoutBatches.js";
import type * as mutations_affiliatePayoutRequests from "../mutations/affiliatePayoutRequests.js";
import type * as mutations_availability from "../mutations/availability.js";
import type * as mutations_billing from "../mutations/billing.js";
import type * as mutations_cleanerLeads from "../mutations/cleanerLeads.js";
import type * as mutations_cleanerPayments from "../mutations/cleanerPayments.js";
import type * as mutations_cleanerStripeConnect from "../mutations/cleanerStripeConnect.js";
import type * as mutations_clientRequests from "../mutations/clientRequests.js";
import type * as mutations_companies from "../mutations/companies.js";
import type * as mutations_companySites from "../mutations/companySites.js";
import type * as mutations_companyStripeConnect from "../mutations/companyStripeConnect.js";
import type * as mutations_devReset from "../mutations/devReset.js";
import type * as mutations_employees from "../mutations/employees.js";
import type * as mutations_forms from "../mutations/forms.js";
import type * as mutations_inspections from "../mutations/inspections.js";
import type * as mutations_jobs from "../mutations/jobs.js";
import type * as mutations_manuals from "../mutations/manuals.js";
import type * as mutations_notifications from "../mutations/notifications.js";
import type * as mutations_partners from "../mutations/partners.js";
import type * as mutations_properties from "../mutations/properties.js";
import type * as mutations_redFlags from "../mutations/redFlags.js";
import type * as mutations_settlements from "../mutations/settlements.js";
import type * as mutations_storage from "../mutations/storage.js";
import type * as mutations_stripeConnect from "../mutations/stripeConnect.js";
import type * as mutations_stripePayouts from "../mutations/stripePayouts.js";
import type * as queries_admin from "../queries/admin.js";
import type * as queries_adminAffiliates from "../queries/adminAffiliates.js";
import type * as queries_affiliate from "../queries/affiliate.js";
import type * as queries_affiliateAttributions from "../queries/affiliateAttributions.js";
import type * as queries_affiliateLedger from "../queries/affiliateLedger.js";
import type * as queries_affiliatePayoutBatches from "../queries/affiliatePayoutBatches.js";
import type * as queries_affiliatePayoutRequests from "../queries/affiliatePayoutRequests.js";
import type * as queries_auditLog from "../queries/auditLog.js";
import type * as queries_availability from "../queries/availability.js";
import type * as queries_billing from "../queries/billing.js";
import type * as queries_cleanerLeads from "../queries/cleanerLeads.js";
import type * as queries_cleanerPayments from "../queries/cleanerPayments.js";
import type * as queries_cleanerStripeConnect from "../queries/cleanerStripeConnect.js";
import type * as queries_clientRequests from "../queries/clientRequests.js";
import type * as queries_companies from "../queries/companies.js";
import type * as queries_companySites from "../queries/companySites.js";
import type * as queries_companyStripeConnect from "../queries/companyStripeConnect.js";
import type * as queries_dashboard from "../queries/dashboard.js";
import type * as queries_employees from "../queries/employees.js";
import type * as queries_forms from "../queries/forms.js";
import type * as queries_inspections from "../queries/inspections.js";
import type * as queries_jobs from "../queries/jobs.js";
import type * as queries_manuals from "../queries/manuals.js";
import type * as queries_notifications from "../queries/notifications.js";
import type * as queries_partners from "../queries/partners.js";
import type * as queries_performance from "../queries/performance.js";
import type * as queries_properties from "../queries/properties.js";
import type * as queries_redFlags from "../queries/redFlags.js";
import type * as queries_settlements from "../queries/settlements.js";
import type * as queries_storage from "../queries/storage.js";
import type * as queries_stripeConnect from "../queries/stripeConnect.js";
import type * as rateLimitInternal from "../rateLimitInternal.js";
import type * as stripeWebhook from "../stripeWebhook.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/affiliateStripeConnect": typeof actions_affiliateStripeConnect;
  "actions/billing": typeof actions_billing;
  "actions/cleanerPayments": typeof actions_cleanerPayments;
  "actions/cleanerStripeConnect": typeof actions_cleanerStripeConnect;
  "actions/companyStripeConnect": typeof actions_companyStripeConnect;
  "actions/emailNotifications": typeof actions_emailNotifications;
  "actions/manuals": typeof actions_manuals;
  "actions/publicBilling": typeof actions_publicBilling;
  "actions/settlements": typeof actions_settlements;
  "actions/stripeConnect": typeof actions_stripeConnect;
  "actions/stripePayouts": typeof actions_stripePayouts;
  auth: typeof auth;
  authActions: typeof authActions;
  authInternal: typeof authInternal;
  authQueries: typeof authQueries;
  clientPortalActions: typeof clientPortalActions;
  clientPortalInternal: typeof clientPortalInternal;
  employeeActions: typeof employeeActions;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/constants": typeof lib_constants;
  "lib/email": typeof lib_email;
  "lib/founderEmails": typeof lib_founderEmails;
  "lib/helpers": typeof lib_helpers;
  "lib/password": typeof lib_password;
  "lib/perfLog": typeof lib_perfLog;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/slugs": typeof lib_slugs;
  "lib/stripe": typeof lib_stripe;
  "lib/subscriptionGating": typeof lib_subscriptionGating;
  "lib/tokens": typeof lib_tokens;
  "lib/validation": typeof lib_validation;
  "lib/validators": typeof lib_validators;
  "mutations/affiliate": typeof mutations_affiliate;
  "mutations/affiliateLedger": typeof mutations_affiliateLedger;
  "mutations/affiliatePayoutBatches": typeof mutations_affiliatePayoutBatches;
  "mutations/affiliatePayoutRequests": typeof mutations_affiliatePayoutRequests;
  "mutations/availability": typeof mutations_availability;
  "mutations/billing": typeof mutations_billing;
  "mutations/cleanerLeads": typeof mutations_cleanerLeads;
  "mutations/cleanerPayments": typeof mutations_cleanerPayments;
  "mutations/cleanerStripeConnect": typeof mutations_cleanerStripeConnect;
  "mutations/clientRequests": typeof mutations_clientRequests;
  "mutations/companies": typeof mutations_companies;
  "mutations/companySites": typeof mutations_companySites;
  "mutations/companyStripeConnect": typeof mutations_companyStripeConnect;
  "mutations/devReset": typeof mutations_devReset;
  "mutations/employees": typeof mutations_employees;
  "mutations/forms": typeof mutations_forms;
  "mutations/inspections": typeof mutations_inspections;
  "mutations/jobs": typeof mutations_jobs;
  "mutations/manuals": typeof mutations_manuals;
  "mutations/notifications": typeof mutations_notifications;
  "mutations/partners": typeof mutations_partners;
  "mutations/properties": typeof mutations_properties;
  "mutations/redFlags": typeof mutations_redFlags;
  "mutations/settlements": typeof mutations_settlements;
  "mutations/storage": typeof mutations_storage;
  "mutations/stripeConnect": typeof mutations_stripeConnect;
  "mutations/stripePayouts": typeof mutations_stripePayouts;
  "queries/admin": typeof queries_admin;
  "queries/adminAffiliates": typeof queries_adminAffiliates;
  "queries/affiliate": typeof queries_affiliate;
  "queries/affiliateAttributions": typeof queries_affiliateAttributions;
  "queries/affiliateLedger": typeof queries_affiliateLedger;
  "queries/affiliatePayoutBatches": typeof queries_affiliatePayoutBatches;
  "queries/affiliatePayoutRequests": typeof queries_affiliatePayoutRequests;
  "queries/auditLog": typeof queries_auditLog;
  "queries/availability": typeof queries_availability;
  "queries/billing": typeof queries_billing;
  "queries/cleanerLeads": typeof queries_cleanerLeads;
  "queries/cleanerPayments": typeof queries_cleanerPayments;
  "queries/cleanerStripeConnect": typeof queries_cleanerStripeConnect;
  "queries/clientRequests": typeof queries_clientRequests;
  "queries/companies": typeof queries_companies;
  "queries/companySites": typeof queries_companySites;
  "queries/companyStripeConnect": typeof queries_companyStripeConnect;
  "queries/dashboard": typeof queries_dashboard;
  "queries/employees": typeof queries_employees;
  "queries/forms": typeof queries_forms;
  "queries/inspections": typeof queries_inspections;
  "queries/jobs": typeof queries_jobs;
  "queries/manuals": typeof queries_manuals;
  "queries/notifications": typeof queries_notifications;
  "queries/partners": typeof queries_partners;
  "queries/performance": typeof queries_performance;
  "queries/properties": typeof queries_properties;
  "queries/redFlags": typeof queries_redFlags;
  "queries/settlements": typeof queries_settlements;
  "queries/storage": typeof queries_storage;
  "queries/stripeConnect": typeof queries_stripeConnect;
  rateLimitInternal: typeof rateLimitInternal;
  stripeWebhook: typeof stripeWebhook;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
