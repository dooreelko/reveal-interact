import * as crypto from "crypto";
import { FunctionRuntimeContextMarker, ApiContainer, ApiRoutes, RouteHandlers, architectureBinding } from "@arinoto/cdk-arch";
import {
  sessionStore,
  hostStore,
  userStore,
  reactionStore,
} from "../src/architecture";
import type {
  Session,
  Host,
  User,
  Reaction,
  RequestContext,
  CookieOptions,
} from "../src/types";

/**
 * Generate an RSA key pair for testing token signing/verification
 */
export function generateTestKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

/**
 * Generate a signed token (same format as production)
 */
export function generateToken(name: string, date: string, privateKey: string): string {
  const payload = JSON.stringify({ name, date });
  const payloadB64 = Buffer.from(payload).toString("base64url");

  const sign = crypto.createSign("SHA256");
  sign.update(payload);
  const signatureB64 = sign.sign(privateKey, "base64url");

  return `${payloadB64}.${signatureB64}`;
}

/**
 * In-memory store implementation for testing
 */
export class InMemoryStore<T> {
  private data: Map<string, T[]> = new Map();
  public storeCalls: Array<{ key: string; doc: T }> = [];

  async store(key: string, doc: T): Promise<{ success: boolean }> {
    this.storeCalls.push({ key, doc });
    const existing = this.data.get(key) || [];
    // Replace existing entries (simulates upsert behavior)
    this.data.set(key, [doc]);
    return { success: true };
  }

  async get(key: string): Promise<T[]> {
    return this.data.get(key) || [];
  }

  async getAll(): Promise<T[]> {
    const all: T[] = [];
    for (const entries of this.data.values()) {
      all.push(...entries);
    }
    return all;
  }

  clear(): void {
    this.data.clear();
    this.storeCalls = [];
  }

  // For test verification
  set(key: string, docs: T[]): void {
    this.data.set(key, docs);
  }
}

/**
 * Create mock stores and wire them up
 */
export interface MockStores {
  sessions: InMemoryStore<Session>;
  hosts: InMemoryStore<Host>;
  users: InMemoryStore<User>;
  reactions: InMemoryStore<Reaction>;
}

export function setupInMemoryStores(): MockStores {
  const sessions = new InMemoryStore<Session>();
  const hosts = new InMemoryStore<Host>();
  const users = new InMemoryStore<User>();
  const reactions = new InMemoryStore<Reaction>();

  // Bind store APIs with in-memory implementations using architectureBinding
  architectureBinding.bind(sessionStore, {
    baseUrl: "memory://session-store",
    overloads: {
      store: (key: string, doc: Session) => sessions.store(key, doc),
      get: (key: string) => sessions.get(key),
      getAll: () => sessions.getAll(),
    },
  });

  architectureBinding.bind(hostStore, {
    baseUrl: "memory://host-store",
    overloads: {
      store: (key: string, doc: Host) => hosts.store(key, doc),
      get: (key: string) => hosts.get(key),
      getAll: () => hosts.getAll(),
    },
  });

  architectureBinding.bind(userStore, {
    baseUrl: "memory://user-store",
    overloads: {
      store: (key: string, doc: User) => users.store(key, doc),
      get: (key: string) => users.get(key),
      getAll: () => users.getAll(),
    },
  });

  architectureBinding.bind(reactionStore, {
    baseUrl: "memory://reaction-store",
    overloads: {
      store: (key: string, doc: Reaction) => reactions.store(key, doc),
      get: (key: string) => reactions.get(key),
      getAll: () => reactions.getAll(),
    },
  });

  return { sessions, hosts, users, reactions };
}

/**
 * Create a mock RequestContext for testing
 */
export interface MockContextOptions {
  token?: string;
  cookies?: Record<string, string>;
  publicKey?: string;
}

export function createMockContext(options: MockContextOptions = {}): FunctionRuntimeContextMarker & RequestContext {
  const setCookieCalls: Array<{ name: string; value: string; options?: CookieOptions }> = [];

  return {
    runtimeContext: true,
    headers: options.token ? { "x-session-token": options.token } : {},
    cookies: options.cookies || {},
    ip: "127.0.0.1",
    env: {
      PUBLIC_KEY: options.publicKey,
    },
    setCookie: (name: string, value: string, cookieOptions?: CookieOptions) => {
      setCookieCalls.push({ name, value, options: cookieOptions });
    },
  };
}

/**
 * Get cookies set during a context's lifetime
 */
export function getSetCookies(ctx: FunctionRuntimeContextMarker & RequestContext): Array<{ name: string; value: string; options?: CookieOptions }> {
  // This is a bit of a hack - we need to capture setCookie calls
  // In a real implementation, we'd track these differently
  return (ctx as any)._setCookieCalls || [];
}

/**
 * Context provider function type - called before each route invocation
 */
export type ContextProvider = () => FunctionRuntimeContextMarker & RequestContext;

/**
 * Create a mock binding for testing that invokes functions with runtime context.
 * Similar interface to createHttpBindings but calls functions directly.
 */
export function createMockBinding<
  TRoutes extends ApiRoutes,
  K extends keyof TRoutes & string
>(
  container: ApiContainer<TRoutes>,
  routeNames: readonly K[],
  contextProvider: ContextProvider
): Pick<RouteHandlers<TRoutes>, K> {
  const bindings: Partial<Pick<RouteHandlers<TRoutes>, K>> = {};

  for (const name of routeNames) {
    const route = container.getRoute(name);
    bindings[name] = (async (...args: unknown[]) => {
      const ctx = contextProvider();
      return route.handler.invokeWithRuntimeContext(args, ctx);
    }) as RouteHandlers<TRoutes>[K];
  }

  return bindings as Pick<RouteHandlers<TRoutes>, K>;
}
