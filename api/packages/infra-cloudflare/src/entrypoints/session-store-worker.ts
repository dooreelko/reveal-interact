/// <reference types="@cloudflare/workers-types" />

import { architectureBinding } from "@arinoto/cdk-arch";
import { sessionStore, Session } from "@revint/arch";
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

async function list(): Promise<Session[]> {
  const kv = currentEnv!.SESSION_KV;
  const { keys } = await kv.list();
  const docArrays = await Promise.all(
    keys.map(key => kv.get<Session[]>(key.name, "json"))
  );
  return docArrays.flatMap(docs => docs ?? []);
}

// Bind the store API with KV overloads
architectureBinding.bind(sessionStore, {
  baseUrl: "session-store",
  overloads: {
    store,
    get,
    list,
  },
});

const handleRequest = createWorkerHandler(sessionStore);

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
