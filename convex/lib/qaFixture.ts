export const QA_FIXTURE_KEY = "bright-harbor-autonomous-qa-v1";
export const QA_COMPANY_NAME = "Bright Harbor Cleaning Co. - QA Fixture";
export const QA_DEPLOYMENT = "majestic-turtle-198";
export const QA_PUBLIC_PROPOSAL_TOKEN = "bright-harbor-avery-proposal-v1";

export const QA_PERSONAS = {
  owner: { name: "Maya Chen", email: "owner@brightharbor.example.test", password: "BrightHarbor-QA-Owner-2026!", role: "owner" },
  manager: { name: "Jordan Brooks", email: "manager@brightharbor.example.test", password: "BrightHarbor-QA-Manager-2026!", role: "manager" },
  worker: { name: "Elena Ruiz", email: "worker@brightharbor.example.test", password: "BrightHarbor-QA-Worker-2026!", role: "cleaner" },
  worker2: { name: "Marcus Reed", email: "worker2@brightharbor.example.test", password: "BrightHarbor-QA-Worker2-2026!", role: "cleaner" },
  client: { name: "Rowan Ellis", email: "client@brightharbor.example.test", password: "BrightHarbor-QA-Client-2026!", role: "client" },
} as const;

export function assertQaFixtureEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (env.SCRUB_QA_ENABLED !== "true") throw new Error("QA fixtures refused: SCRUB_QA_ENABLED must equal true");
  if (env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS !== "true") {
    throw new Error("QA fixtures refused: SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS must equal true");
  }
  let appUrl: URL;
  try { appUrl = new URL(env.APP_URL ?? ""); } catch { throw new Error("QA fixtures refused: APP_URL must be a valid absolute loopback URL"); }
  if (appUrl.hostname !== "localhost" && appUrl.hostname !== "127.0.0.1" && appUrl.hostname !== "[::1]") {
    throw new Error("QA fixtures refused: APP_URL must use a loopback host");
  }
  const deployment = deploymentName(env);
  if (deployment !== QA_DEPLOYMENT) {
    throw new Error(`QA fixtures refused: deployment must equal ${QA_DEPLOYMENT}`);
  }
  return { appUrl: appUrl.toString(), deployment };
}

function deploymentName(env: NodeJS.ProcessEnv) {
  const explicit = env.CONVEX_DEPLOYMENT?.replace(/^dev:/, "");
  if (explicit) return explicit;
  for (const value of [env.CONVEX_CLOUD_URL, env.CONVEX_SITE_URL]) {
    if (!value) continue;
    try { return new URL(value).hostname.split(".")[0]; } catch { /* fail below */ }
  }
  return undefined;
}

export function qaCredentials() {
  return Object.fromEntries(Object.entries(QA_PERSONAS).map(([key, value]) => [key, { ...value }]));
}
