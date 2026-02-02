/// <reference types="@cloudflare/workers-types" />

import { ApiContainer, ApiRoutes } from "@arinoto/cdk-arch";
import { RequestContext, CookieOptions, EnvConfig } from "@revint/arch";

/**
 * Creates a Cloudflare Worker fetch handler from an ApiContainer's route definitions.
 */
export function createWorkerHandler<TRoutes extends ApiRoutes>(api: ApiContainer<TRoutes>) {
  const routes = prepareRoutes(api);

  return async (request: Request, env: Record<string, unknown>): Promise<Response> => {
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/json");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, x-session-token, Cookie");
    responseHeaders.set("Access-Control-Allow-Credentials", "true");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders });
    }

    const url = new URL(request.url);
    const method = request.method;

    // Match route
    for (const route of routes) {
      if (method !== route.method) continue;

      const match = url.pathname.match(route.pattern);
      if (!match) continue;

      // Extract params
      const params: string[] = [];
      route.paramNames.forEach((_, i) => {
        params.push(decodeURIComponent(match[i + 1]));
      });

      try {
        const ctx = createContext(request, env, responseHeaders);

        // Build args: path params, then body if POST/PUT (context passed via runtime context)
        const args: unknown[] = [...params];
        if (["POST", "PUT"].includes(method)) {
          try {
            const body = await request.json();
            if (body && typeof body === "object" && Object.keys(body).length > 0) {
              args.push(body);
            }
          } catch {
            // No body or invalid JSON, continue without body
          }
        }

        // Pass RequestContext via runtime context (bound to `this` in handler)
        const result = await route.handler.invokeWithRuntimeContext(args, ctx);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: responseHeaders,
        });
      } catch (error) {
        console.error(`Error handling ${route.name}:`, error);
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: responseHeaders,
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: responseHeaders,
    });
  };
}

interface PreparedRoute {
  name: string;
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: { invokeWithRuntimeContext: (args: unknown[], ctx: unknown) => Promise<unknown> };
}

function prepareRoutes<TRoutes extends ApiRoutes>(api: ApiContainer<TRoutes>): PreparedRoute[] {
  const routes: PreparedRoute[] = [];

  for (const name of api.listRoutes()) {
    const route = api.getRoute(name);
    const [method, ...pathParts] = route.path.split(" ");
    const rawPath = pathParts.join(" ");
    const paramNames: string[] = [];

    // Convert {param} to regex capture groups
    const patternStr = rawPath.replace(/\{(\w+)\}/g, (_, paramName) => {
      paramNames.push(paramName);
      return "([^/]+)";
    });

    routes.push({
      name,
      method: method.toUpperCase(),
      pattern: new RegExp(`^${patternStr}$`),
      paramNames,
      handler: route.handler,
    });
  }

  return routes;
}

function parseCookies(cookieHeader: string | null): Record<string, string | undefined> {
  const cookies: Record<string, string | undefined> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) {
      cookies[name] = rest.join("=");
    }
  });

  return cookies;
}

function createContext(
  request: Request,
  env: Record<string, unknown>,
  responseHeaders: Headers
): RequestContext {
  const cookies = parseCookies(request.headers.get("cookie"));

  return {
    headers: Object.fromEntries(request.headers.entries()),
    cookies,
    ip: request.headers.get("cf-connecting-ip") || undefined,
    env: env as EnvConfig,
    setCookie: (name: string, value: string, options?: CookieOptions) => {
      const cookieParts = [`${name}=${value}`];
      if (options?.maxAge !== undefined) {
        cookieParts.push(`Max-Age=${options.maxAge}`);
      }
      if (options?.httpOnly) {
        cookieParts.push("HttpOnly");
      }
      if (options?.secure) {
        cookieParts.push("Secure");
      }
      if (options?.sameSite) {
        cookieParts.push(`SameSite=${options.sameSite}`);
      }
      cookieParts.push(`Path=${options?.path ?? "/"}`);
      responseHeaders.append("Set-Cookie", cookieParts.join("; "));
    },
  };
}
