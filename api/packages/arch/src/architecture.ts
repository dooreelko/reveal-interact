import { Architecture, ApiContainer, Function } from "@arinoto/cdk-arch";
import * as crypto from "crypto";
import { DataStore } from "./data-store";
import { WsContainer } from "./ws-container";
import {
  Session,
  Host,
  User,
  Reaction,
  NewSessionResponse,
  LoginResponse,
  RequestContext,
  SessionToken,
} from "./types";

// Create the architecture
export const arch = new Architecture("reveal-interact");

// Data stores
export const sessionStore = new DataStore<Session>(arch, "session-store");
export const hostStore = new DataStore<Host>(arch, "host-store");
export const userStore = new DataStore<User>(arch, "user-store");
export const reactionStore = new DataStore<Reaction>(arch, "reaction-store");

// Utility functions
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Verify and decode a session token.
 * Token format: base64url(payload).base64url(signature)
 * Payload is JSON: { name: string, date: string }
 * Signature is created with host's private key, verified with public key.
 */
function verifyToken(token: string, publicKey: string | undefined): SessionToken | null {
  if (!publicKey) {
    throw new Error("PUBLIC_KEY environment variable is required");
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64, signatureB64] = parts;

  try {
    const payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const signature = Buffer.from(signatureB64, "base64url");

    const verifier = crypto.createVerify("SHA256");
    verifier.update(payload);

    if (!verifier.verify(publicKey, signature)) {
      return null;
    }

    return JSON.parse(payload) as SessionToken;
  } catch {
    return null;
  }
}

/**
 * API functions
 */
export const newSessionFunction = new Function<[string, RequestContext], NewSessionResponse>(
  arch,
  "new-session",
  async (token: string, ctx: RequestContext): Promise<NewSessionResponse> => {
    const tokenData = verifyToken(token, ctx.env.PUBLIC_KEY);
    if (!tokenData) {
      throw new Error("Invalid token");
    }

    const uid = generateId();

    // Store host record
    await hostStore.store(token, { token, uid });

    // Initialize session state
    await sessionStore.store(token, { token, page: "0", state: "init" });

    // Set session cookies
    ctx.setCookie("token", token, { httpOnly: true, sameSite: "lax" });
    ctx.setCookie("uid", uid, { httpOnly: true, sameSite: "lax" });

    return { token, uid };
  }
);

export const loginFunction = new Function<[string, RequestContext], LoginResponse>(
  arch,
  "login",
  async (token: string, ctx: RequestContext): Promise<LoginResponse> => {
    const tokenData = verifyToken(token, ctx.env.PUBLIC_KEY);
    if (!tokenData) {
      throw new Error("Invalid token");
    }

    const existingUid = ctx.cookies["uid"];

    // Reuse existing uid if present, otherwise generate new one
    const uid = existingUid || generateId();

    if (!existingUid) {
      // Store user record for this session (only for new users)
      await userStore.store(token, { token, uid });
      // Set user cookie
      ctx.setCookie("uid", uid, { httpOnly: true, sameSite: "lax" });
      ctx.setCookie("token", token, { httpOnly: true, sameSite: "lax" });
    }

    return { uid };
  }
);

export const reactFunction = new Function<
  [string, string, string, string, RequestContext],
  { success: boolean }
>(
  arch,
  "react",
  async (
    token: string,
    uid: string,
    page: string,
    reaction: string,
    ctx: RequestContext
  ): Promise<{ success: boolean }> => {
    const tokenData = verifyToken(token, ctx.env.PUBLIC_KEY);
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

    await reactionStore.store(token, reactionDoc);
    return { success: true };
  }
);

export const setStateFunction = new Function<
  [string, string, string, RequestContext],
  { success: boolean }
>(
  arch,
  "set-state",
  async (
    token: string,
    page: string,
    state: string,
    ctx: RequestContext
  ): Promise<{ success: boolean }> => {
    const tokenData = verifyToken(token, ctx.env.PUBLIC_KEY);
    if (!tokenData) {
      throw new Error("Invalid token");
    }

    // Verify caller is the host
    const hosts = await hostStore.get(token);
    const hostUid = ctx.cookies["uid"];
    const isHost = hosts.some((h) => h.uid === hostUid);

    if (!isHost) {
      throw new Error("Not authorized: only host can set state");
    }

    const sessionDoc: Session = { token, page, state };
    await sessionStore.store(token, sessionDoc);

    // Note: WebSocket broadcast is handled by the infrastructure layer
    // The ws-server listens for state changes and broadcasts to connected clients

    return { success: true };
  }
);

export const getStateFunction = new Function<[string, RequestContext], Session | null>(
  arch,
  "get-state",
  async (token: string, ctx: RequestContext): Promise<Session | null> => {
    const tokenData = verifyToken(token, ctx.env.PUBLIC_KEY);
    if (!tokenData) {
      throw new Error("Invalid token");
    }

    const sessions = await sessionStore.get(token);
    return sessions.length > 0 ? sessions[0] : null;
  }
);

// REST API container
export const api = new ApiContainer(arch, "api", {
  newSession: { path: "POST /api/v1/session/new/{token}", handler: newSessionFunction },
  login: { path: "POST /api/v1/session/{token}/login", handler: loginFunction },
  react: { path: "POST /api/v1/session/{token}/user/{uid}/react/{page}/{reaction}", handler: reactFunction },
  setState: { path: "POST /api/v1/session/{token}/state/{page}/{state}", handler: setStateFunction },
  getState: { path: "GET /api/v1/session/{token}/state", handler: getStateFunction },
});

// Datastore API container (internal)
export const datastoreApi = new ApiContainer(arch, "datastore-api", {
  "session-store": { path: "POST /store/session/{key}", handler: sessionStore.storeFunction },
  "session-get": { path: "GET /store/session/{key}", handler: sessionStore.getFunction },
  "session-getAll": { path: "GET /store/session", handler: sessionStore.getAllFunction },
  "host-store": { path: "POST /store/host/{key}", handler: hostStore.storeFunction },
  "host-get": { path: "GET /store/host/{key}", handler: hostStore.getFunction },
  "host-getAll": { path: "GET /store/host", handler: hostStore.getAllFunction },
  "user-store": { path: "POST /store/user/{key}", handler: userStore.storeFunction },
  "user-get": { path: "GET /store/user/{key}", handler: userStore.getFunction },
  "user-getAll": { path: "GET /store/user", handler: userStore.getAllFunction },
  "reaction-store": { path: "POST /store/reaction/{key}", handler: reactionStore.storeFunction },
  "reaction-get": { path: "GET /store/reaction/{key}", handler: reactionStore.getFunction },
  "reaction-getAll": { path: "GET /store/reaction", handler: reactionStore.getAllFunction },
});

// WebSocket container
export const ws = new WsContainer(arch, "ws", {
  hostPipe: { path: "/ws/v1/session/{token}/host/{uid}/pipe" },
  userPipe: { path: "/ws/v1/session/{token}/user/{uid}/pipe" },
});

export const hostPipe = ws.getRouteByName("hostPipe")!;
export const userPipe = ws.getRouteByName("userPipe")!;

// Export utility functions for use by other packages
export { verifyToken };

// Synthesize and output architecture definition
if (require.main === module) {
  console.log(JSON.stringify(arch.synth(), null, 2));
}
