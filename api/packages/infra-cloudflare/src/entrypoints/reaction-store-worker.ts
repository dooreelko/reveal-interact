/// <reference types="@cloudflare/workers-types" />

import { architectureBinding } from "@arinoto/cdk-arch";
import { reactionStoreApi, Reaction } from "@revint/arch";
import { createWorkerHandler } from "../cloudflare-worker-handler.js";

interface Env {
  REACTION_KV: KVNamespace;
}

let currentEnv: Env | null = null;

// KV implementations
async function store(key: string, doc: Reaction): Promise<{ success: boolean }> {
  const kv = currentEnv!.REACTION_KV;
  const existing = await kv.get<Reaction[]>(key, "json") || [];
  existing.unshift(doc);
  await kv.put(key, JSON.stringify(existing));
  return { success: true };
}

async function get(key: string): Promise<Reaction[]> {
  const kv = currentEnv!.REACTION_KV;
  return await kv.get<Reaction[]>(key, "json") || [];
}

async function getAll(): Promise<Reaction[]> {
  return [];
}

// Bind the store API with KV overloads
architectureBinding.bind(reactionStoreApi, {
  baseUrl: "reaction-store",
  overloads: {
    store,
    get,
    getAll,
  },
});

const handleRequest = createWorkerHandler(reactionStoreApi);

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
