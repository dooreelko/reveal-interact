/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare Worker for reveal-interact API.
 *
 * This is a standalone worker that doesn't import constructs or cdk-arch
 * to avoid bundling Node.js-only dependencies.
 */

// Environment bindings
export interface Env {
  SESSION_KV: KVNamespace;
  HOST_KV: KVNamespace;
  USER_KV: KVNamespace;
  REACTION_KV: KVNamespace;
  PUBLIC_KEY: string;
}

// Types (copied from @revint/arch to avoid importing constructs)
interface Session {
  token: string;
  page: string;
  state: string;
}

interface Host {
  token: string;
  uid: string;
}

interface User {
  token: string;
  uid: string;
}

interface Reaction {
  time: number;
  token: string;
  uid: string;
  page: string;
  reaction: string;
}

interface SessionToken {
  name: string;
  date: string;
}

interface CookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
  path?: string;
}

interface RequestContext {
  headers: Record<string, string | undefined>;
  cookies: Record<string, string | undefined>;
  ip?: string;
  env: { PUBLIC_KEY?: string };
  setCookie: (name: string, value: string, options?: CookieOptions) => void;
}

// KV store implementations
async function kvStore<T>(kv: KVNamespace, key: string, doc: T): Promise<{ success: boolean }> {
  const existing = await kv.get<T[]>(key, "json") || [];
  existing.unshift(doc);
  await kv.put(key, JSON.stringify(existing));
  return { success: true };
}

async function kvGet<T>(kv: KVNamespace, key: string): Promise<T[]> {
  return await kv.get<T[]>(key, "json") || [];
}

// Utility functions
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Token verification using Web Crypto API
async function verifyToken(token: string, publicKeyPem: string | undefined): Promise<SessionToken | null> {
  if (!publicKeyPem) {
    throw new Error("PUBLIC_KEY environment variable is required");
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64, signatureB64] = parts;

  try {
    // Decode payload and signature
    const payloadBytes = Uint8Array.from(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const signatureBytes = Uint8Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

    // Parse PEM public key
    const pemContents = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s/g, '');
    const keyBytes = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

    // Import the public key
    const cryptoKey = await crypto.subtle.importKey(
      'spki',
      keyBytes,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Verify signature
    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signatureBytes,
      payloadBytes
    );

    if (!isValid) {
      return null;
    }

    const payload = new TextDecoder().decode(payloadBytes);
    return JSON.parse(payload) as SessionToken;
  } catch (e) {
    console.error("Token verification error:", e);
    return null;
  }
}

// Parse cookies from request
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

// Create RequestContext from Cloudflare Request
function createContext(request: Request, env: Env, responseHeaders: Headers): RequestContext {
  const cookies = parseCookies(request.headers.get("cookie"));

  return {
    headers: Object.fromEntries(request.headers.entries()),
    cookies,
    ip: request.headers.get("cf-connecting-ip") || undefined,
    env: { PUBLIC_KEY: env.PUBLIC_KEY },
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
      if (options?.path) {
        cookieParts.push(`Path=${options.path}`);
      }
      responseHeaders.append("Set-Cookie", cookieParts.join("; "));
    },
  };
}

// Route definitions (must match @revint/arch)
const routes = {
  newSession: { method: "POST", path: /^\/api\/v1\/session\/new\/([^/]+)$/, params: ["token"] },
  login: { method: "POST", path: /^\/api\/v1\/session\/([^/]+)\/login$/, params: ["token"] },
  react: { method: "POST", path: /^\/api\/v1\/session\/([^/]+)\/user\/([^/]+)\/react\/([^/]+)\/([^/]+)$/, params: ["token", "uid", "page", "reaction"] },
  setState: { method: "POST", path: /^\/api\/v1\/session\/([^/]+)\/state\/([^/]+)\/([^/]+)$/, params: ["token", "page", "state"] },
  getState: { method: "GET", path: /^\/api\/v1\/session\/([^/]+)\/state$/, params: ["token"] },
};

// API handlers
async function handleNewSession(env: Env, ctx: RequestContext, token: string): Promise<{ token: string; uid: string }> {
  const tokenData = await verifyToken(token, ctx.env.PUBLIC_KEY);
  if (!tokenData) {
    throw new Error("Invalid token");
  }

  const uid = generateId();

  // Store host record
  await kvStore<Host>(env.HOST_KV, token, { token, uid });

  // Initialize session state
  await kvStore<Session>(env.SESSION_KV, token, { token, page: "0", state: "init" });

  // Set session cookies
  ctx.setCookie("token", token, { httpOnly: true, sameSite: "lax" });
  ctx.setCookie("uid", uid, { httpOnly: true, sameSite: "lax" });

  return { token, uid };
}

async function handleLogin(env: Env, ctx: RequestContext, token: string): Promise<{ uid: string }> {
  const tokenData = await verifyToken(token, ctx.env.PUBLIC_KEY);
  if (!tokenData) {
    throw new Error("Invalid token");
  }

  const existingUid = ctx.cookies["uid"];
  const uid = existingUid || generateId();

  if (!existingUid) {
    await kvStore<User>(env.USER_KV, token, { token, uid });
    ctx.setCookie("uid", uid, { httpOnly: true, sameSite: "lax" });
    ctx.setCookie("token", token, { httpOnly: true, sameSite: "lax" });
  }

  return { uid };
}

async function handleReact(env: Env, ctx: RequestContext, token: string, uid: string, page: string, reaction: string): Promise<{ success: boolean }> {
  const tokenData = await verifyToken(token, ctx.env.PUBLIC_KEY);
  if (!tokenData) {
    throw new Error("Invalid token");
  }

  const reactionDoc: Reaction = {
    time: Date.now(),
    token,
    uid,
    page,
    reaction,
  };

  await kvStore<Reaction>(env.REACTION_KV, token, reactionDoc);
  return { success: true };
}

async function handleSetState(env: Env, ctx: RequestContext, token: string, page: string, state: string): Promise<{ success: boolean }> {
  const tokenData = await verifyToken(token, ctx.env.PUBLIC_KEY);
  if (!tokenData) {
    throw new Error("Invalid token");
  }

  // Verify caller is the host
  const hosts = await kvGet<Host>(env.HOST_KV, token);
  const hostUid = ctx.cookies["uid"];
  const isHost = hosts.some((h) => h.uid === hostUid);

  if (!isHost) {
    throw new Error("Not authorized: only host can set state");
  }

  await kvStore<Session>(env.SESSION_KV, token, { token, page, state });
  return { success: true };
}

async function handleGetState(env: Env, ctx: RequestContext, token: string): Promise<Session | null> {
  const tokenData = await verifyToken(token, ctx.env.PUBLIC_KEY);
  if (!tokenData) {
    throw new Error("Invalid token");
  }

  const sessions = await kvGet<Session>(env.SESSION_KV, token);
  return sessions.length > 0 ? sessions[0] : null;
}

// Main worker handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/json");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders });
    }

    const url = new URL(request.url);
    const method = request.method;

    // Match route
    for (const [name, route] of Object.entries(routes)) {
      if (method !== route.method) continue;

      const match = url.pathname.match(route.path);
      if (!match) continue;

      // Extract params
      const params: Record<string, string> = {};
      route.params.forEach((paramName, i) => {
        params[paramName] = decodeURIComponent(match[i + 1]);
      });

      try {
        const ctx = createContext(request, env, responseHeaders);
        let result: unknown;

        switch (name) {
          case "newSession":
            result = await handleNewSession(env, ctx, params.token);
            break;
          case "login":
            result = await handleLogin(env, ctx, params.token);
            break;
          case "react":
            result = await handleReact(env, ctx, params.token, params.uid, params.page, params.reaction);
            break;
          case "setState":
            result = await handleSetState(env, ctx, params.token, params.page, params.state);
            break;
          case "getState":
            result = await handleGetState(env, ctx, params.token);
            break;
        }

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: responseHeaders,
        });
      } catch (error) {
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
  },
};
