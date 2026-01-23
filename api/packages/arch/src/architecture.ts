import { Architecture, ApiContainer, TBDFunction } from "@arinoto/cdk-arch";
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

// API functions
export const newSessionFunction = new TBDFunction<[string], NewSessionResponse>(
  arch,
  "new-session"
);

export const loginFunction = new TBDFunction<[], LoginResponse>(
  arch,
  "login"
);

export const reactFunction = new TBDFunction<
  [string, string, string, string],
  { success: boolean }
>(arch, "react");

export const setStateFunction = new TBDFunction<
  [string, string, string],
  { success: boolean }
>(arch, "set-state");

export const getStateFunction = new TBDFunction<[string], Session | null>(
  arch,
  "get-state"
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
