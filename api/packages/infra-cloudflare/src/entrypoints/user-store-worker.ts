/// <reference types="@cloudflare/workers-types" />

import { architectureBinding } from "@arinoto/cdk-arch";
import { userStore, User } from "@revint/arch";
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

async function list(): Promise<User[]> {
  const kv = currentEnv!.USER_KV;
  const { keys } = await kv.list();
  const docArrays = await Promise.all(
    keys.map(key => kv.get<User[]>(key.name, "json"))
  );
  return docArrays.flatMap(docs => docs ?? []);
}

// Bind the store API with KV overloads
architectureBinding.bind(userStore, {
  baseUrl: "user-store",
  overloads: {
    store,
    get,
    list,
  },
});

const handleRequest = createWorkerHandler(userStore);

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
