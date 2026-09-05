"use node";

import { internalAction } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import { hashPassword } from "./lib/password";
import { assertQaFixtureEnvironment, qaCredentials, QA_PERSONAS } from "./lib/qaFixture";

const fixtureInternal = {
  status: makeFunctionReference<"query">("qaFixturesInternal:status"),
  seed: makeFunctionReference<"mutation">("qaFixturesInternal:seed"),
  reset: makeFunctionReference<"mutation">("qaFixturesInternal:reset"),
};

async function hashes() {
  return {
    owner: await hashPassword(QA_PERSONAS.owner.password),
    manager: await hashPassword(QA_PERSONAS.manager.password),
    worker: await hashPassword(QA_PERSONAS.worker.password),
    client: await hashPassword(QA_PERSONAS.client.password),
  };
}

export const status = internalAction({ args: {}, handler: async (ctx) => {
  assertQaFixtureEnvironment();
  return ctx.runQuery(fixtureInternal.status, {});
} });

export const seed = internalAction({ args: {}, handler: async (ctx) => {
  assertQaFixtureEnvironment();
  const result = await ctx.runMutation(fixtureInternal.seed, { passwordHashes: await hashes() });
  return { ...result, credentials: qaCredentials() };
} });

export const reset = internalAction({ args: {}, handler: async (ctx) => {
  assertQaFixtureEnvironment();
  return ctx.runMutation(fixtureInternal.reset, {});
} });

export const reseed = internalAction({ args: {}, handler: async (ctx) => {
  assertQaFixtureEnvironment();
  const resetResult = await ctx.runMutation(fixtureInternal.reset, {});
  const seedResult = await ctx.runMutation(fixtureInternal.seed, { passwordHashes: await hashes() });
  return { reset: resetResult, ...seedResult, credentials: qaCredentials() };
} });
