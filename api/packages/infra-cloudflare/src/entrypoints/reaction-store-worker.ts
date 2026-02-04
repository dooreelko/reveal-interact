/// <reference types="@cloudflare/workers-types" />

import { architectureBinding } from "@arinoto/cdk-arch";
import { reactionStore, Reaction } from "@revint/arch";
import { createWorkerHandler } from "../cloudflare-worker-handler.js";
import { buildStorageKey, buildListPrefix } from "../kv-helpers.js";

interface Env {
  REACTION_KV: KVNamespace;
}

let currentEnv: Env | null = null;

// Key type for indexed store
type ReactionKey = { id: string; sessionUid: string; page: string; uid: string };

// Index fields for this store (order matters for prefix queries)
const indices = reactionStore.indices;

// KV implementations using prefix-based storage keys.
// Storage key format: sessionUid:page:uid:id
// This enables efficient prefix-based listing via KV.list({ prefix }).

async function store(key: ReactionKey, doc: Reaction): Promise<{ success: boolean }> {
  const kv = currentEnv!.REACTION_KV;
  const storageKey = buildStorageKey(key, indices);
  await kv.put(storageKey, JSON.stringify(doc));
  return { success: true };
}

async function get(key: ReactionKey): Promise<Reaction[]> {
  const kv = currentEnv!.REACTION_KV;
  // With IndexedKey, we can construct the exact storage key
  const storageKey = buildStorageKey(key, indices);
  const doc = await kv.get<Reaction>(storageKey, "json");
  return doc ? [doc] : [];
}

async function list(filters?: Partial<Reaction>): Promise<Reaction[]> {
  const kv = currentEnv!.REACTION_KV;

  // Build prefix from consecutive index filters - KV only supports prefix-based filtering
  const { prefix, usedAll } = buildListPrefix(filters, indices);

  if (!usedAll) {
    throw new Error("KV list only supports filtering by consecutive index fields from the start");
  }

  // Use KV prefix listing
  const { keys } = await kv.list({ prefix: prefix || undefined });
  const docs = await Promise.all(
    keys.map(key => kv.get<Reaction>(key.name, "json"))
  );
  return docs.filter((doc): doc is Reaction => doc !== null);
}

// Bind the store API with KV overloads
architectureBinding.bind(reactionStore, {
  baseUrl: "reaction-store",
  overloads: {
    store,
    get,
    list,
  },
});

const handleRequest = createWorkerHandler(reactionStore);

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
