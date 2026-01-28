/**
 * Session information encrypted in the token by host's private key
 */
export interface SessionToken {
  name: string;
  date: string;
}

/**
 * Session state stored in the backend
 */
export interface Session {
  token: string;
  page: string;
  state: string;
  /** Public session identifier for QR codes (not the host token) */
  uid: string;
  /** API base URL for this session */
  apiUrl: string;
  /** Web UI URL for audience */
  webUiUrl: string;
  /** WebSocket base URL (optional, clients derive from apiUrl if not set) */
  wsUrl?: string;
}

/**
 * Host entry linking session to host user
 */
export interface Host {
  token: string;
  uid: string;
}

/**
 * User entry linking session to user
 */
export interface User {
  token: string;
  uid: string;
}

/**
 * Reaction from a user during a session
 */
export interface Reaction {
  time: number;
  token: string;
  uid: string;
  page: string;
  reaction: string;
}

/**
 * Request body for session creation
 */
export interface CreateSessionRequest {
  /** Web UI URL for audience */
  webUiUrl: string;
  /** API base URL */
  apiUrl: string;
  /** WebSocket base URL (optional) */
  wsUrl?: string;
}

/**
 * Response from session creation
 */
export interface NewSessionResponse {
  token: string;
  /** Host user ID */
  hostUid: string;
  /** Public session ID for QR codes */
  sessionUid: string;
}

/**
 * Response from public session lookup
 */
export interface GetSessionResponse {
  /** Session token (needed for login and other API calls) */
  token: string;
  /** API base URL */
  apiUrl: string;
  /** Web UI URL */
  webUiUrl: string;
  /** WebSocket base URL (optional) */
  wsUrl?: string;
}

/**
 * Response from user login
 */
export interface LoginResponse {
  uid: string;
}

/**
 * WebSocket message broadcast to users
 */
export interface StateChangeMessage {
  type: "state_change";
  token: string;
  page: string;
  state: string;
}

/**
 * Environment configuration
 */
export interface EnvConfig {
  /** Public key for verifying session tokens (PEM format) */
  PUBLIC_KEY?: string;
  /** Node environment */
  NODE_ENV?: string;
  /** Allow any other env vars */
  [key: string]: string | undefined;
}

/**
 * Request context passed to API functions
 */
export interface RequestContext {
  /** Request headers */
  headers: Record<string, string | undefined>;
  /** Parsed cookies */
  cookies: Record<string, string | undefined>;
  /** Client IP address */
  ip?: string;
  /** Environment configuration */
  env: EnvConfig;
  /** Set a cookie in the response */
  setCookie: (name: string, value: string, options?: CookieOptions) => void;
}

/**
 * Cookie options for setCookie
 */
export interface CookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
  path?: string;
}
