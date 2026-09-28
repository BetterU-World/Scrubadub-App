import { Redirect } from "wouter";

/** Preserve old return/refresh bookmarks without syncing the retired worker account.
 * Current affiliate account state is read in the separate affiliate workspace. */
export function StripeReturnPage() {
  return <Redirect to="/affiliate" />;
}
