export function isClientAuthPath(pathname: string): boolean {
  return pathname === "/client/login" || pathname === "/client/forgot-password" ||
    pathname.startsWith("/client/reset-password/") || pathname.startsWith("/client/accept-invite/");
}

/** Keep return navigation within the Client Portal, excluding credential-entry routes. */
export function clientLoginDestination(value: string | null): string {
  if (!value?.startsWith("/client/") || /[\u0000-\u0020\\]/.test(value)) return "/client/home";
  const target = new URL(value, "https://client.invalid");
  const protectedRoute = /^\/client\/(?:home|services|documents|billing|locations|account|requests(?:\/[^/]+)?|service-agreements\/[^/]+)$/.test(target.pathname);
  if (target.origin !== "https://client.invalid" || !protectedRoute) return "/client/home";
  return target.pathname + target.search + target.hash;
}
