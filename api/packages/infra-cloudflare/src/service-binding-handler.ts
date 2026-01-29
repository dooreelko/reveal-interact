/// <reference types="@cloudflare/workers-types" />

import { ApiContainer, FunctionHandler } from "@arinoto/cdk-arch";

/**
 * Service binding interface for Cloudflare Worker-to-Worker communication.
 */
export interface ServiceBinding {
  fetch: typeof fetch;
}

/**
 * Creates a handler that forwards requests to another worker via service binding.
 * Similar to docker's httpHandler but uses Cloudflare service bindings instead of HTTP.
 */
export function serviceBindingHandler<TArgs extends unknown[], TReturn>(
  getBinding: () => ServiceBinding,
  container: ApiContainer,
  routeName: string
): FunctionHandler<TArgs, TReturn> {
  const route = container.getRoute(routeName);

  const [method, rawPath] = route.path.split(" ");
  const paramMatches = rawPath.match(/\{(\w+)\}/g) || [];
  const paramNames = paramMatches.map((m: string) => m.slice(1, -1));

  return async (...args: TArgs): Promise<TReturn> => {
    let path = rawPath;
    let argIndex = 0;

    // Replace path parameters
    for (const paramName of paramNames) {
      path = path.replace(`{${paramName}}`, encodeURIComponent(String(args[argIndex++])));
    }

    // Service bindings use a fake URL - the actual routing is handled by the binding
    const url = `https://service${path}`;
    const options: RequestInit = {
      method: method.toUpperCase(),
      headers: { "Content-Type": "application/json" },
    };

    // Add body for POST/PUT with remaining args
    if (["POST", "PUT"].includes(method.toUpperCase()) && argIndex < args.length) {
      options.body = JSON.stringify(args[argIndex]);
    }

    const binding = getBinding();
    const response = await binding.fetch(url, options);
    return response.json() as Promise<TReturn>;
  };
}
