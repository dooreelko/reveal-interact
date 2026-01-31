/// <reference types="@cloudflare/workers-types" />

import { architectureBinding } from "@arinoto/cdk-arch";
import {
  api,
  sessionStoreApi,
  hostStoreApi,
  userStoreApi,
  reactionStoreApi,
} from "@revint/arch";
import { createWorkerHandler } from "../cloudflare-worker-handler.js";
import { createServiceBindingHandlers, ServiceBinding } from "../service-binding-handler.js";

interface Env {
  SESSION_STORE: ServiceBinding;
  HOST_STORE: ServiceBinding;
  USER_STORE: ServiceBinding;
  REACTION_STORE: ServiceBinding;
  PUBLIC_KEY: string;
}

let currentEnv: Env | null = null;

// Bind store APIs with service binding handlers using createHttpBindings
architectureBinding.bind(sessionStoreApi, {
  baseUrl: "session-store",
  overloads: createServiceBindingHandlers(
    () => currentEnv!.SESSION_STORE,
    sessionStoreApi,
    ["store", "get", "getAll"] as const
  ),
});

architectureBinding.bind(hostStoreApi, {
  baseUrl: "host-store",
  overloads: createServiceBindingHandlers(
    () => currentEnv!.HOST_STORE,
    hostStoreApi,
    ["store", "get", "getAll"] as const
  ),
});

architectureBinding.bind(userStoreApi, {
  baseUrl: "user-store",
  overloads: createServiceBindingHandlers(
    () => currentEnv!.USER_STORE,
    userStoreApi,
    ["store", "get", "getAll"] as const
  ),
});

architectureBinding.bind(reactionStoreApi, {
  baseUrl: "reaction-store",
  overloads: createServiceBindingHandlers(
    () => currentEnv!.REACTION_STORE,
    reactionStoreApi,
    ["store", "get", "getAll"] as const
  ),
});

// Bind API locally
architectureBinding.bind(api, { baseUrl: "api" });

const handleRequest = createWorkerHandler(api);

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
