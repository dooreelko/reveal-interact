/// <reference types="@cloudflare/workers-types" />

import { architectureBinding } from "@arinoto/cdk-arch";
import {
  api,
  sessionStore,
  hostStore,
  userStore,
  reactionStore,
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
architectureBinding.bind(sessionStore, {
  baseUrl: "session-store",
  overloads: createServiceBindingHandlers(
    () => currentEnv!.SESSION_STORE,
    sessionStore,
    ["store", "get", "list"] as const
  ),
});

architectureBinding.bind(hostStore, {
  baseUrl: "host-store",
  overloads: createServiceBindingHandlers(
    () => currentEnv!.HOST_STORE,
    hostStore,
    ["store", "get", "list"] as const
  ),
});

architectureBinding.bind(userStore, {
  baseUrl: "user-store",
  overloads: createServiceBindingHandlers(
    () => currentEnv!.USER_STORE,
    userStore,
    ["store", "get", "list"] as const
  ),
});

architectureBinding.bind(reactionStore, {
  baseUrl: "reaction-store",
  overloads: createServiceBindingHandlers(
    () => currentEnv!.REACTION_STORE,
    reactionStore,
    ["store", "get", "list"] as const
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
