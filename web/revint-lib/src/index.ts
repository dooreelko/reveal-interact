/**
 * Reveal-Interact Client Library
 *
 * A client library for audience participation in presentations.
 * Handles authentication, WebSocket connections, and reactions.
 */

import { createHttpBindings, type Fetcher, type RouteHandlers } from "@arinoto/cdk-arch";
import {
  api,
  type GetSessionResponse,
  type LoginResponse,
  type Session,
} from "@revint/arch";

/**
 * Configuration options for RevintClient
 */
export interface RevintClientConfig {
  /** The API base URL (e.g., https://api.example.com) */
  apiUrl: string;
  /** The session token (for authentication via x-session-token header) */
  token: string;
  /** The public session UID (used in API paths) */
  sessionUid: string;
  /** The WebSocket base URL (e.g., ws://api.example.com:3002). If not provided, derived from apiUrl */
  wsUrl?: string;
  /** Enable auto-reconnection for WebSocket (default: true) */
  autoReconnect?: boolean;
  /** Reconnection delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;
}

/**
 * State change event from the presentation
 */
export interface StateChangeEvent {
  /** The page identifier (e.g., "0.0", "1.0") */
  page: string;
  /** The state string (passed through as-is from host) */
  state: string;
}

/**
 * Pre-defined reaction types
 */
export type ReactionType = "thumbsup" | "heart" | "mindblown" | string;

/**
 * Callback for state change events
 */
export type StateChangeCallback = (event: StateChangeEvent) => void;

/**
 * Callback for connection status changes
 */
export type ConnectionCallback = (connected: boolean) => void;

/**
 * WebSocket message from server
 */
interface WsMessage {
  type: "state_change";
  token: string;
  page: string;
  state: string;
}

/**
 * Internal config type with required fields
 */
type InternalConfig = Required<Omit<RevintClientConfig, "wsUrl">> &
  Pick<RevintClientConfig, "wsUrl">;

/**
 * Type for user API client - uses createHttpBindings return type directly
 */
type UserApiClient = Pick<RouteHandlers<typeof api.routes>, "getSession" | "login" | "react" | "getState">;

/**
 * Create an authenticated fetcher that adds credentials and token header
 */
function createAuthFetcher(token: string): Fetcher {
  return () => ({
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await globalThis.fetch(input, {
        ...init,
        credentials: "include",
        headers: {
          ...init?.headers,
          "x-session-token": token,
        },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Request failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`
        );
      }

      return response;
    },
  });
}

/**
 * Create an unauthenticated fetcher for public endpoints
 */
function createPublicFetcher(): Fetcher {
  return () => ({
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await globalThis.fetch(input, {
        ...init,
        credentials: "include",
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Request failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`
        );
      }

      return response;
    },
  });
}

/**
 * Create API client for user operations
 */
function createUserApiClient(apiUrl: string, token: string): UserApiClient {
  const endpoint = { baseUrl: apiUrl };
  const authFetcher = createAuthFetcher(token);
  const publicFetcher = createPublicFetcher();

  // Create bindings with appropriate fetchers - types now match directly (no RequestContext in signatures)
  const publicBindings = createHttpBindings(
    endpoint,
    api,
    ["getSession"] as const,
    publicFetcher
  );
  const authBindings = createHttpBindings(
    endpoint,
    api,
    ["login", "react", "getState"] as const,
    authFetcher
  );

  return {
    getSession: publicBindings.getSession,
    login: authBindings.login,
    react: authBindings.react,
    getState: authBindings.getState,
  };
}

/**
 * RevintClient - Main client for audience interaction
 */
export class RevintClient {
  private config: InternalConfig;
  private uid: string | null = null;
  private ws: WebSocket | null = null;
  private stateCallbacks: Set<StateChangeCallback> = new Set();
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  private apiClient: UserApiClient;

  constructor(config: RevintClientConfig) {
    this.config = {
      autoReconnect: true,
      reconnectDelay: 1000,
      maxReconnectAttempts: 10,
      ...config,
    };
    this.apiClient = createUserApiClient(config.apiUrl, config.token);
  }

  /**
   * Login to the session and get a user ID
   * This must be called before connecting to WebSocket or sending reactions
   */
  async login(): Promise<string> {
    const result = await this.apiClient.login(this.config.sessionUid);
    this.uid = result.uid;
    return result.uid;
  }

  /**
   * Get the current user ID (null if not logged in)
   */
  getUserId(): string | null {
    return this.uid;
  }

  /**
   * Connect to the WebSocket for receiving state updates
   * Must call login() first
   */
  connect(): void {
    if (!this.uid) {
      throw new Error("Must call login() before connect()");
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    this.intentionallyClosed = false;
    this.createWebSocket();
  }

  private createWebSocket(): void {
    if (!this.uid) return;

    // Use configured wsUrl or derive from apiUrl
    const wsBaseUrl =
      this.config.wsUrl ||
      this.config.apiUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");

    const url = `${wsBaseUrl}/ws/v1/session/${encodeURIComponent(this.config.sessionUid)}/user/${encodeURIComponent(this.uid)}/pipe`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.notifyConnectionCallbacks(true);
    };

    this.ws.onclose = () => {
      this.notifyConnectionCallbacks(false);

      if (!this.intentionallyClosed && this.config.autoReconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event) => {
      console.error("RevintClient WebSocket error:", event);
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WsMessage = JSON.parse(event.data);
        if (message.type === "state_change") {
          this.notifyStateCallbacks({
            page: message.page,
            state: message.state,
          });
        }
      } catch (err) {
        console.error("RevintClient: Failed to parse WebSocket message:", err);
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error("RevintClient: Max reconnection attempts reached");
      return;
    }

    const delay =
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      this.createWebSocket();
    }, delay);
  }

  /**
   * Disconnect from the WebSocket
   */
  disconnect(): void {
    this.intentionallyClosed = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Register a callback for state change events
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  /**
   * Register a callback for connection status changes
   */
  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    return () => this.connectionCallbacks.delete(callback);
  }

  private notifyStateCallbacks(event: StateChangeEvent): void {
    for (const callback of this.stateCallbacks) {
      try {
        callback(event);
      } catch (err) {
        console.error("RevintClient: Error in state change callback:", err);
      }
    }
  }

  private notifyConnectionCallbacks(connected: boolean): void {
    for (const callback of this.connectionCallbacks) {
      try {
        callback(connected);
      } catch (err) {
        console.error("RevintClient: Error in connection callback:", err);
      }
    }
  }

  /**
   * Send a reaction for the current page
   * @param page The page identifier (e.g., "0.0")
   * @param reaction The reaction type (e.g., "thumbsup", "heart", "mindblown", or custom)
   */
  async react(page: string, reaction: ReactionType): Promise<void> {
    if (!this.uid) {
      throw new Error("Must call login() before react()");
    }

    await this.apiClient.react(
      this.config.sessionUid,
      this.uid,
      page,
      reaction
    );
  }

  /**
   * Get the current session state
   */
  async getState(): Promise<StateChangeEvent | null> {
    const session = await this.apiClient.getState(this.config.sessionUid);
    if (!session) {
      return null;
    }
    return {
      page: session.page,
      state: session.state,
    };
  }

  /**
   * Convenience method to send thumbs up reaction
   */
  async thumbsUp(page: string): Promise<void> {
    return this.react(page, "thumbsup");
  }

  /**
   * Convenience method to send heart reaction
   */
  async heart(page: string): Promise<void> {
    return this.react(page, "heart");
  }

  /**
   * Convenience method to send mind blown reaction
   */
  async mindBlown(page: string): Promise<void> {
    return this.react(page, "mindblown");
  }
}

/**
 * Fetch session info from a public session UID
 * @param sessionUid The public session identifier
 * @param apiUrl Optional API URL (if not provided, uses relative path)
 */
export async function getSessionInfo(
  sessionUid: string,
  apiUrl?: string
): Promise<GetSessionResponse> {
  const endpoint = { baseUrl: apiUrl || "" };
  const publicFetcher = createPublicFetcher();

  // Types match directly - no cast needed
  const bindings = createHttpBindings(
    endpoint,
    api,
    ["getSession"] as const,
    publicFetcher
  );

  const result = await bindings.getSession(sessionUid);

  if (!result) {
    throw new Error("Session not found");
  }

  return result;
}

/**
 * Create a RevintClient from a session UID
 * Fetches session info from the API, then creates client with token and apiUrl
 * @param sessionUid The public session identifier
 * @param apiUrl Optional API URL for the initial lookup (if not provided, uses relative path)
 */
export async function createClientFromSession(
  sessionUid: string,
  apiUrl?: string
): Promise<RevintClient> {
  const sessionInfo = await getSessionInfo(sessionUid, apiUrl);
  return new RevintClient({
    token: sessionInfo.userToken,
    apiUrl: sessionInfo.apiUrl,
    wsUrl: sessionInfo.wsUrl,
    sessionUid,
  });
}

/**
 * Create a RevintClient from URL parameters
 * Expected: ?session=<sessionUid> (optionally with &apiUrl=<apiUrl> for initial lookup)
 */
export async function createClientFromUrlAuto(): Promise<RevintClient> {
  const params = new URLSearchParams(window.location.search);
  const sessionUid = params.get("session");
  const apiUrl = params.get("apiUrl");

  if (!sessionUid) {
    throw new Error("Missing URL parameters. Expected: ?session=<sessionUid>");
  }

  return createClientFromSession(sessionUid, apiUrl || undefined);
}

// Default export for convenience
export default RevintClient;
