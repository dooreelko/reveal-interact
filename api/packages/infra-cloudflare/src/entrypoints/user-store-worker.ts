/// <reference types="@cloudflare/workers-types" />

import { architectureBinding } from "@arinoto/cdk-arch";
import { userStoreApi, User } from "@revint/arch";
import { createWorkerHandler } from "../cloudflare-worker-handler.js";

interface Env {
  USER_KV: KVNamespace;
}

let currentEnv: Env | null = null;

// KV implementations
async function store(key: string, doc: User): Promise<{ success: boolean }> {
  const kv = currentEnv!.USER_KV;
  const existing = await kv.get<User[]>(key, "json") || [];
  existing.unshift(doc);
  await kv.put(key, JSON.stringify(existing));
  return { success: true };
}

async function get(key: string): Promise<User[]> {
  const kv = currentEnv!.USER_KV;
  return await kv.get<User[]>(key, "json") || [];
}

async function getAll(): Promise<User[]> {
  return [];
}

// Bind the store API with KV overloads
architectureBinding.bind(userStoreApi, {
  host: "user-store",
  port: 0,
  overloads: {
    store,
    get,
    getAll,
  },
});

const handleRequest = createWorkerHandler(userStoreApi);

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
