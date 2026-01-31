/// <reference types="@cloudflare/workers-types" />

import { ApiContainer, ApiRoutes, createHttpBindings, type Fetcher } from "@arinoto/cdk-arch";

/**
 * Service binding interface for Cloudflare Worker-to-Worker communication.
 */
export interface ServiceBinding {
  fetch: typeof fetch;
}

/**
 * Create HTTP bindings for service binding communication.
 * Uses a dynamic fetcher that retrieves the service binding at call time.
 */
export function createServiceBindingHandlers<
  TRoutes extends ApiRoutes,
  K extends keyof TRoutes & string
>(
  getBinding: () => ServiceBinding,
  container: ApiContainer<TRoutes>,
  routeNames: readonly K[]
) {
  const endpoint = { baseUrl: "https://service" };
  const fetcher: Fetcher = getBinding;
  return createHttpBindings(endpoint, container, routeNames, fetcher);
}

