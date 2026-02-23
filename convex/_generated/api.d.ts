/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_billing from "../actions/billing.js";
import type * as auth from "../auth.js";
import type * as authActions from "../authActions.js";
import type * as authInternal from "../authInternal.js";
import type * as clientPortalActions from "../clientPortalActions.js";
import type * as clientPortalInternal from "../clientPortalInternal.js";
import type * as authQueries from "../authQueries.js";
import type * as employeeActions from "../employeeActions.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_password from "../lib/password.js";
import type * as lib_subscriptionGating from "../lib/subscriptionGating.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as lib_validation from "../lib/validation.js";
import type * as lib_validators from "../lib/validators.js";
import type * as mutations_companySites from "../mutations/companySites.js";
import type * as mutations_clientRequests from "../mutations/clientRequests.js";
import type * as mutations_billing from "../mutations/billing.js";
import type * as mutations_employees from "../mutations/employees.js";
import type * as mutations_forms from "../mutations/forms.js";
import type * as mutations_jobs from "../mutations/jobs.js";
import type * as mutations_notifications from "../mutations/notifications.js";
import type * as mutations_partners from "../mutations/partners.js";
import type * as mutations_properties from "../mutations/properties.js";
import type * as mutations_redFlags from "../mutations/redFlags.js";
import type * as mutations_storage from "../mutations/storage.js";
import type * as queries_companySites from "../queries/companySites.js";
import type * as queries_clientRequests from "../queries/clientRequests.js";
import type * as queries_auditLog from "../queries/auditLog.js";
import type * as queries_billing from "../queries/billing.js";
import type * as queries_dashboard from "../queries/dashboard.js";
import type * as queries_employees from "../queries/employees.js";
import type * as queries_forms from "../queries/forms.js";
import type * as queries_jobs from "../queries/jobs.js";
import type * as queries_notifications from "../queries/notifications.js";
import type * as queries_partners from "../queries/partners.js";
import type * as queries_performance from "../queries/performance.js";
import type * as queries_properties from "../queries/properties.js";
import type * as queries_redFlags from "../queries/redFlags.js";
import type * as queries_storage from "../queries/storage.js";
import type * as stripeWebhook from "../stripeWebhook.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/billing": typeof actions_billing;
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
  "lib/helpers": typeof lib_helpers;
  "lib/password": typeof lib_password;
  "lib/subscriptionGating": typeof lib_subscriptionGating;
  "lib/tokens": typeof lib_tokens;
  "lib/validation": typeof lib_validation;
  "lib/validators": typeof lib_validators;
  "mutations/companySites": typeof mutations_companySites;
  "mutations/clientRequests": typeof mutations_clientRequests;
  "mutations/billing": typeof mutations_billing;
  "mutations/employees": typeof mutations_employees;
  "mutations/forms": typeof mutations_forms;
  "mutations/jobs": typeof mutations_jobs;
  "mutations/notifications": typeof mutations_notifications;
  "mutations/partners": typeof mutations_partners;
  "mutations/properties": typeof mutations_properties;
  "mutations/redFlags": typeof mutations_redFlags;
  "mutations/storage": typeof mutations_storage;
  "queries/companySites": typeof queries_companySites;
  "queries/clientRequests": typeof queries_clientRequests;
  "queries/auditLog": typeof queries_auditLog;
  "queries/billing": typeof queries_billing;
  "queries/dashboard": typeof queries_dashboard;
  "queries/employees": typeof queries_employees;
  "queries/forms": typeof queries_forms;
  "queries/jobs": typeof queries_jobs;
  "queries/notifications": typeof queries_notifications;
  "queries/partners": typeof queries_partners;
  "queries/performance": typeof queries_performance;
  "queries/properties": typeof queries_properties;
  "queries/redFlags": typeof queries_redFlags;
  "queries/storage": typeof queries_storage;
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
