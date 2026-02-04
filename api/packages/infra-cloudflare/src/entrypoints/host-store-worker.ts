/// <reference types="@cloudflare/workers-types" />

import { architectureBinding } from "@arinoto/cdk-arch";
import { hostStore, Host } from "@revint/arch";
import { createWorkerHandler } from "../cloudflare-worker-handler.js";

interface Env {
  HOST_KV: KVNamespace;
}

let currentEnv: Env | null = null;

// KV implementations
async function store(key: string, doc: Host): Promise<{ success: boolean }> {
  const kv = currentEnv!.HOST_KV;
  const existing = await kv.get<Host[]>(key, "json") || [];
  existing.unshift(doc);
  await kv.put(key, JSON.stringify(existing));
  return { success: true };
}

async function get(key: string): Promise<Host[]> {
  const kv = currentEnv!.HOST_KV;
  return await kv.get<Host[]>(key, "json") || [];
}

async function list(): Promise<Host[]> {
  const kv = currentEnv!.HOST_KV;
  const { keys } = await kv.list();
  const docArrays = await Promise.all(
    keys.map(key => kv.get<Host[]>(key.name, "json"))
  );
  return docArrays.flatMap(docs => docs ?? []);
}

// Bind the store API with KV overloads
architectureBinding.bind(hostStore, {
  baseUrl: "host-store",
  overloads: {
    store,
    get,
    list,
  },
});

const handleRequest = createWorkerHandler(hostStore);

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
