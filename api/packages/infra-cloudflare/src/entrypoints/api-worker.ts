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
import { serviceBindingHandler, ServiceBinding } from "../service-binding-handler.js";

interface Env {
  SESSION_STORE: ServiceBinding;
  HOST_STORE: ServiceBinding;
  USER_STORE: ServiceBinding;
  REACTION_STORE: ServiceBinding;
  PUBLIC_KEY: string;
}

let currentEnv: Env | null = null;

// Bind store APIs with service binding handlers
architectureBinding.bind(sessionStoreApi, {
  host: "session-store",
  port: 0,
  overloads: {
    store: serviceBindingHandler(() => currentEnv!.SESSION_STORE, sessionStoreApi, "store"),
    get: serviceBindingHandler(() => currentEnv!.SESSION_STORE, sessionStoreApi, "get"),
    getAll: serviceBindingHandler(() => currentEnv!.SESSION_STORE, sessionStoreApi, "getAll"),
  },
});

architectureBinding.bind(hostStoreApi, {
  host: "host-store",
  port: 0,
  overloads: {
    store: serviceBindingHandler(() => currentEnv!.HOST_STORE, hostStoreApi, "store"),
    get: serviceBindingHandler(() => currentEnv!.HOST_STORE, hostStoreApi, "get"),
    getAll: serviceBindingHandler(() => currentEnv!.HOST_STORE, hostStoreApi, "getAll"),
  },
});

architectureBinding.bind(userStoreApi, {
  host: "user-store",
  port: 0,
  overloads: {
    store: serviceBindingHandler(() => currentEnv!.USER_STORE, userStoreApi, "store"),
    get: serviceBindingHandler(() => currentEnv!.USER_STORE, userStoreApi, "get"),
    getAll: serviceBindingHandler(() => currentEnv!.USER_STORE, userStoreApi, "getAll"),
  },
});

architectureBinding.bind(reactionStoreApi, {
  host: "reaction-store",
  port: 0,
  overloads: {
    store: serviceBindingHandler(() => currentEnv!.REACTION_STORE, reactionStoreApi, "store"),
    get: serviceBindingHandler(() => currentEnv!.REACTION_STORE, reactionStoreApi, "get"),
    getAll: serviceBindingHandler(() => currentEnv!.REACTION_STORE, reactionStoreApi, "getAll"),
  },
});

// Bind API locally
architectureBinding.bind(api, { host: "api", port: 0 });

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
