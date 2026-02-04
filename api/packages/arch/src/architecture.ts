import { Architecture, ApiContainer, Function, FunctionRuntimeContextMarker } from "@arinoto/cdk-arch";
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
  CreateSessionRequest,
  GetSessionResponse,
} from "./types";

// Create the architecture
export const arch = new Architecture("reveal-interact");

// Data stores
export const sessionStore = new DataStore<Session>(arch, "session-store");
export const hostStore = new DataStore<Host>(arch, "host-store");
export const userStore = new DataStore<User>(arch, "user-store");
export const reactionStore = new DataStore<Reaction>(arch, "reaction-store");

// Runtime context type for all API functions
type ApiRuntimeContext = FunctionRuntimeContextMarker & RequestContext;

/**
 * Extract typed runtime context from `this` binding.
 * Must be called from a regular function (not arrow) that was invoked via invokeWithRuntimeContext.
 */
function extractContext<T>(that: unknown): T {
  const ctx = that as { runtimeContext?: boolean };
  if (!ctx?.runtimeContext) {
    throw new Error("Missing runtime context - ensure function is invoked via invokeWithRuntimeContext");
  }
  return that as T;
}

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
 * Extract and verify token from x-session-token header.
 */
function getVerifiedToken(ctx: RequestContext): string {
  const token = ctx.headers["x-session-token"];
  if (!token) {
    throw new Error("Missing x-session-token header");
  }
  const tokenData = verifyToken(token, ctx.env.PUBLIC_KEY);
  if (!tokenData) {
    throw new Error("Invalid token");
  }
  return token;
}

/**
 * Look up session by sessionUid and verify the header token matches (host token).
 */
async function getVerifiedSessionAsHost(sessionUid: string, ctx: RequestContext): Promise<{ token: string; session: Session }> {
  const token = getVerifiedToken(ctx);
  const sessions = await sessionStore.get(sessionUid);
  if (sessions.length === 0) {
    throw new Error("Session not found");
  }
  const session = sessions[0];
  if (session.token !== token) {
    throw new Error("Token does not match session");
  }
  return { token, session };
}

/**
 * Look up session by sessionUid and verify the header token matches (user token).
 */
async function getVerifiedSessionAsUser(sessionUid: string, ctx: RequestContext): Promise<{ userToken: string; session: Session }> {
  const userToken = getVerifiedToken(ctx);
  const sessions = await sessionStore.get(sessionUid);
  if (sessions.length === 0) {
    throw new Error("Session not found");
  }
  const session = sessions[0];
  if (session.userToken !== userToken) {
    throw new Error("Token does not match session");
  }
  return { userToken, session };
}

/**
 * API functions
 */
const newSessionFunction = new Function<[CreateSessionRequest], NewSessionResponse, ApiRuntimeContext>(
  arch,
  "new-session",
  async function (body: CreateSessionRequest): Promise<NewSessionResponse> {
    const ctx = extractContext<RequestContext>(this);

    // Verify host token from header
    const token = getVerifiedToken(ctx);

    // Verify user token from body
    const userTokenData = verifyToken(body.userToken, ctx.env.PUBLIC_KEY);
    if (!userTokenData) {
      throw new Error("Invalid user token");
    }

    const hostUid = generateId();
    const sessionUid = generateId();

    // Store host record
    await hostStore.store(token, { token, uid: hostUid });

    // Initialize session state with metadata
    const sessionData: Session = {
      token,
      userToken: body.userToken,
      page: "0",
      state: "init",
      uid: sessionUid,
      apiUrl: body.apiUrl,
      webUiUrl: `${body.webUiUrl}?apiUrl=${encodeURI(body.apiUrl)}&sessionUid=${sessionUid}`,
      wsUrl: body.wsUrl,
    };
    await sessionStore.store(token, sessionData);

    // Also store by session uid for lookup
    await sessionStore.store(sessionUid, sessionData);

    // Set session cookies for host
    ctx.setCookie("token", token, { httpOnly: true, sameSite: "lax" });
    ctx.setCookie("uid", hostUid, { httpOnly: true, sameSite: "lax" });

    return { token, hostUid, sessionUid };
  }
);

const loginFunction = new Function<[string], LoginResponse, ApiRuntimeContext>(
  arch,
  "login",
  async function (sessionUid: string): Promise<LoginResponse> {
    const ctx = extractContext<RequestContext>(this);
    const { userToken } = await getVerifiedSessionAsUser(sessionUid, ctx);

    const existingUid = ctx.cookies["uid"];

    // Reuse existing uid if present, otherwise generate new one
    const uid = existingUid || generateId();

    if (!existingUid) {
      // Store user record for this session (only for new users)
      await userStore.store(userToken, { token: userToken, uid });
      // Set user cookie
      ctx.setCookie("uid", uid, { httpOnly: true, sameSite: "lax" });
      ctx.setCookie("token", userToken, { httpOnly: true, sameSite: "lax" });
    }

    return { uid };
  }
);

const reactFunction = new Function<[string, string, string, string], { success: boolean }, ApiRuntimeContext>(
  arch,
  "react",
  async function (
    sessionUid: string,
    uid: string,
    page: string,
    reaction: string
  ): Promise<{ success: boolean }> {
    const ctx = extractContext<RequestContext>(this);
    const { userToken } = await getVerifiedSessionAsUser(sessionUid, ctx);

    // Verify user uid matches the cookie
    const cookieUid = ctx.cookies["uid"];
    if (!cookieUid || cookieUid !== uid) {
      throw new Error("Not authorized: user id mismatch");
    }

    // Verify user is registered for this session
    const users = await userStore.get(userToken);
    const isUser = users.some((u) => u.uid === uid);
    if (!isUser) {
      throw new Error("Not authorized: user not registered for this session");
    }

    const reactionDoc: Reaction = {
      time: Date.now(),
      token: userToken,
      uid,
      page,
      reaction,
    };

    await reactionStore.store(userToken, reactionDoc);
    return { success: true };
  }
);

const setStateFunction = new Function<[string, string, string], { success: boolean }, ApiRuntimeContext>(
  arch,
  "set-state",
  async function (
    sessionUid: string,
    page: string,
    state: string
  ): Promise<{ success: boolean }> {
    const ctx = extractContext<RequestContext>(this);
    const { token, session: existing } = await getVerifiedSessionAsHost(sessionUid, ctx);

    // Verify caller is the host
    const hosts = await hostStore.get(token);
    const hostUid = ctx.cookies["uid"];
    const isHost = hosts.some((h) => h.uid === hostUid);

    if (!isHost) {
      throw new Error("Not authorized: only host can set state");
    }

    const sessionDoc: Session = {
      token,
      userToken: existing.userToken,
      page,
      state,
      uid: existing.uid,
      apiUrl: existing.apiUrl,
      webUiUrl: existing.webUiUrl,
      wsUrl: existing.wsUrl,
    };

    // Update both by token and by session uid
    await sessionStore.store(token, sessionDoc);
    await sessionStore.store(existing.uid, sessionDoc);

    return { success: true };
  }
);

const getStateFunction = new Function<[string], Session | null, ApiRuntimeContext>(
  arch,
  "get-state",
  async function (sessionUid: string): Promise<Session | null> {
    const ctx = extractContext<RequestContext>(this);

    // Verify user is logged in
    const userUid = ctx.cookies["uid"];
    if (!userUid) {
      throw new Error("Not authorized: must be logged in");
    }

    // Try to verify as host first, then as user
    let session: Session;
    let isHost = false;
    let isUser = false;

    try {
      const result = await getVerifiedSessionAsHost(sessionUid, ctx);
      session = result.session;
      const hosts = await hostStore.get(result.token);
      isHost = hosts.some((h) => h.uid === userUid);
    } catch {
      // Not a host, try as user
      const result = await getVerifiedSessionAsUser(sessionUid, ctx);
      session = result.session;
      const users = await userStore.get(result.userToken);
      isUser = users.some((u) => u.uid === userUid);
    }

    if (!isUser && !isHost) {
      throw new Error("Not authorized: user not registered for this session");
    }

    return session;
  }
);

/**
 * Public session lookup by session uid (no auth required)
 * Returns userToken for audience members to use for authentication
 */
export const getSessionFunction = new Function<[string], GetSessionResponse | null, ApiRuntimeContext>(
  arch,
  "get-session",
  async function (sessionUid: string): Promise<GetSessionResponse | null> {
    // Note: ctx not used for this public endpoint but available via this
    const sessions = await sessionStore.get(sessionUid);
    if (sessions.length === 0) {
      return null;
    }

    const session = sessions[0];
    return {
      userToken: session.userToken,
      apiUrl: session.apiUrl,
      webUiUrl: session.webUiUrl,
      wsUrl: session.wsUrl,
    };
  }
);

// REST API container
export const api = new ApiContainer(arch, "api", {
  newSession: { path: "POST /api/v1/session/new", handler: newSessionFunction },
  getSession: { path: "GET /api/v1/session/{sessionUid}", handler: getSessionFunction },
  login: { path: "POST /api/v1/session/{sessionUid}/login", handler: loginFunction },
  react: { path: "POST /api/v1/session/{sessionUid}/user/{uid}/react/{page}/{reaction}", handler: reactFunction },
  setState: { path: "POST /api/v1/session/{sessionUid}/state/{page}/{state}", handler: setStateFunction },
  getState: { path: "GET /api/v1/session/{sessionUid}/state", handler: getStateFunction },
});

// WebSocket container
export const ws = new WsContainer(arch, "ws", {
  hostPipe: { path: "/ws/v1/session/{sessionUid}/host/{uid}/pipe" },
  userPipe: { path: "/ws/v1/session/{sessionUid}/user/{uid}/pipe" },
});

export const hostPipe = ws.getRoute("hostPipe");
export const userPipe = ws.getRoute("userPipe");

// Synthesize and output architecture definition
if (require.main === module) {
  console.log(JSON.stringify(arch.synth(), null, 2));
}
