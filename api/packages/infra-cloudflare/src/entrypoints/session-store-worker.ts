/// <reference types="@cloudflare/workers-types" />

import { architectureBinding } from "@arinoto/cdk-arch";
import { sessionStoreApi, Session } from "@revint/arch";
import { createWorkerHandler } from "../cloudflare-worker-handler.js";

interface Env {
  SESSION_KV: KVNamespace;
}

let currentEnv: Env | null = null;

// KV implementations
async function store(key: string, doc: Session): Promise<{ success: boolean }> {
  const kv = currentEnv!.SESSION_KV;
  const existing = await kv.get<Session[]>(key, "json") || [];
  existing.unshift(doc);
  await kv.put(key, JSON.stringify(existing));
  return { success: true };
}

async function get(key: string): Promise<Session[]> {
  const kv = currentEnv!.SESSION_KV;
  return await kv.get<Session[]>(key, "json") || [];
}

async function getAll(): Promise<Session[]> {
  // KV list doesn't return values, so we'd need to iterate
  // For now, return empty - getAll is not commonly used
  return [];
}

// Bind the store API with KV overloads
architectureBinding.bind(sessionStoreApi, {
  baseUrl: "session-store",
  overloads: {
    store,
    get,
    getAll,
  },
});

const handleRequest = createWorkerHandler(sessionStoreApi);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    currentEnv = env;
    try {
      return await handleRequest(request, env as unknown as Record<string, unknown>);
    } finally {
      currentEnv = null;
    }
  },
};
