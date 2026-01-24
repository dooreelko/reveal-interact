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
 * Generate a session ID from token data.
 * Uses a hash of the token content for deterministic IDs.
 */
function tokenToSid(tokenData: SessionToken): string {
  const hash = crypto.createHash("sha256");
  hash.update(`${tokenData.name}:${tokenData.date}`);
  return hash.digest("hex").substring(0, 16);
}

// API functions
export const newSessionFunction = new Function<[string, RequestContext], NewSessionResponse>(
  arch,
  "new-session",
  async (token: string, ctx: RequestContext): Promise<NewSessionResponse> => {
    const tokenData = verifyToken(token, ctx.env.PUBLIC_KEY);
    if (!tokenData) {
      throw new Error("Invalid token");
    }

    const sid = tokenToSid(tokenData);
    const uid = generateId();

    // Store host record
    await hostStore.store(sid, { sid, uid });

    // Initialize session state
    await sessionStore.store(sid, { sid, page: "0", state: "init" });

    // Set session cookie
    ctx.setCookie("sid", sid, { httpOnly: true, sameSite: "lax" });
    ctx.setCookie("uid", uid, { httpOnly: true, sameSite: "lax" });
    ctx.setCookie("token", token, { httpOnly: true, sameSite: "lax" });

    return { sid, uid };
  }
);

export const loginFunction = new Function<[RequestContext], LoginResponse>(
  arch,
  "login",
  async (ctx: RequestContext): Promise<LoginResponse> => {
    const sid = ctx.cookies["sid"];
    const existingUid = ctx.cookies["uid"];

    // Reuse existing uid if present, otherwise generate new one
    const uid = existingUid || generateId();

    if (sid && !existingUid) {
      // Store user record for this session (only for new users)
      await userStore.store(sid, { sid, uid });
      // Set user cookie
      ctx.setCookie("uid", uid, { httpOnly: true, sameSite: "lax" });
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

    const sid = tokenToSid(tokenData);

    const reactionDoc: Reaction = {
      time: Date.now(),
      sid,
      uid,
      page,
      reaction,
    };

    await reactionStore.store(sid, reactionDoc);
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

    const sid = tokenToSid(tokenData);

    // Verify caller is the host
    const hosts = await hostStore.get(sid);
    const hostUid = ctx.cookies["uid"];
    const isHost = hosts.some((h) => h.uid === hostUid);

    if (!isHost) {
      throw new Error("Not authorized: only host can set state");
    }

    const sessionDoc: Session = { sid, page, state };
    await sessionStore.store(sid, sessionDoc);

    // Note: WebSocket broadcast is handled by the infrastructure layer
    // The ws-server listens for state changes and broadcasts to connected clients

    return { success: true };
  }
);

export const getStateFunction = new Function<[string, RequestContext], Session | null>(
  arch,
  "get-state",
  async (sid: string, _ctx: RequestContext): Promise<Session | null> => {
    const sessions = await sessionStore.get(sid);
    return sessions.length > 0 ? sessions[0] : null;
  }
);

// REST API container
export const api = new ApiContainer(arch, "api");

api.addRoute("newSession", "POST /api/v1/session/new/{token}", newSessionFunction);
api.addRoute("login", "POST /api/v1/login", loginFunction);
api.addRoute(
  "react",
  "POST /api/v1/session/{token}/user/{uid}/react/{page}/{reaction}",
  reactFunction
);
api.addRoute(
  "setState",
  "POST /api/v1/session/{token}/state/{page}/{state}",
  setStateFunction
);
api.addRoute("getState", "GET /api/v1/session/{sid}/state", getStateFunction);

// Datastore API container (internal)
export const datastoreApi = new ApiContainer(arch, "datastore-api");

// Register store routes
datastoreApi.addRoute("session-store", "POST /store/session/{key}", sessionStore.storeFunction);
datastoreApi.addRoute("session-get", "GET /store/session/{key}", sessionStore.getFunction);
datastoreApi.addRoute("session-getAll", "GET /store/session", sessionStore.getAllFunction);

datastoreApi.addRoute("host-store", "POST /store/host/{key}", hostStore.storeFunction);
datastoreApi.addRoute("host-get", "GET /store/host/{key}", hostStore.getFunction);
datastoreApi.addRoute("host-getAll", "GET /store/host", hostStore.getAllFunction);

datastoreApi.addRoute("user-store", "POST /store/user/{key}", userStore.storeFunction);
datastoreApi.addRoute("user-get", "GET /store/user/{key}", userStore.getFunction);
datastoreApi.addRoute("user-getAll", "GET /store/user", userStore.getAllFunction);

datastoreApi.addRoute("reaction-store", "POST /store/reaction/{key}", reactionStore.storeFunction);
datastoreApi.addRoute("reaction-get", "GET /store/reaction/{key}", reactionStore.getFunction);
datastoreApi.addRoute("reaction-getAll", "GET /store/reaction", reactionStore.getAllFunction);

// WebSocket container
export const ws = new WsContainer(arch, "ws");

export const hostPipe = ws.addRoute(
  "hostPipe",
  "/ws/v1/session/{token}/host/{uid}/pipe"
);

export const userPipe = ws.addRoute(
  "userPipe",
  "/ws/v1/session/{token}/user/{uid}/pipe"
);

// Export utility functions for use by other packages
export { verifyToken, tokenToSid };

// Synthesize and output architecture definition
if (require.main === module) {
  console.log(JSON.stringify(arch.synth(), null, 2));
}
