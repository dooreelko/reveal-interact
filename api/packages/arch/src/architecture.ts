import { Architecture, ApiContainer, TBDFunction, Function } from "@arinoto/cdk-arch";
import { DataStore } from "./data-store";
import { WsContainer } from "./ws-container";
import {
  Session,
  Host,
  User,
  Reaction,
  NewSessionResponse,
  LoginResponse,
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

// API functions
export const newSessionFunction = new Function<[string], NewSessionResponse>(
  arch,
  "new-session",
  async (token: string): Promise<NewSessionResponse> => {
    // TODO: Validate token with stored public key
    const sid = generateId();
    const uid = generateId();

    // Store host record
    await hostStore.store(sid, { sid, uid });

    // Initialize session state
    await sessionStore.store(sid, { sid, page: "0", state: "init" });

    return { sid, uid };
  }
);

export const loginFunction = new Function<[], LoginResponse>(
  arch,
  "login",
  async (): Promise<LoginResponse> => {
    // TODO: Get session from cookie/header and associate user
    const uid = generateId();
    return { uid };
  }
);

export const reactFunction = new Function<
  [string, string, string, string],
  { success: boolean }
>(
  arch,
  "react",
  async (
    token: string,
    uid: string,
    page: string,
    reaction: string
  ): Promise<{ success: boolean }> => {
    // TODO: Validate token and extract sid
    const sid = token; // Simplified: using token as sid for now

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
  [string, string, string],
  { success: boolean }
>(
  arch,
  "set-state",
  async (
    token: string,
    page: string,
    state: string
  ): Promise<{ success: boolean }> => {
    // TODO: Validate token, check host permission
    const sid = token; // Simplified: using token as sid for now

    const sessionDoc: Session = { sid, page, state };
    await sessionStore.store(sid, sessionDoc);

    // TODO: Broadcast to WebSocket clients
    return { success: true };
  }
);

export const getStateFunction = new Function<[string], Session | null>(
  arch,
  "get-state",
  async (sid: string): Promise<Session | null> => {
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

// Synthesize and output architecture definition
if (require.main === module) {
  console.log(JSON.stringify(arch.synth(), null, 2));
}
