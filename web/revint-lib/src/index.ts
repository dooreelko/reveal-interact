/**
 * Reveal-Interact Client Library
 *
 * A client library for audience participation in presentations.
 * Handles authentication, WebSocket connections, and reactions.
 */

/**
 * Configuration options for RevintClient
 */
export interface RevintClientConfig {
  /** The API base URL (e.g., https://api.example.com) */
  apiUrl: string;
  /** The session token from the URL */
  token: string;
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
 * Login response from the API
 */
interface LoginResponse {
  uid: string;
}

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
 * RevintClient - Main client for audience interaction
 */
export class RevintClient {
  private config: Required<RevintClientConfig>;
  private uid: string | null = null;
  private ws: WebSocket | null = null;
  private stateCallbacks: Set<StateChangeCallback> = new Set();
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;

  constructor(config: RevintClientConfig) {
    this.config = {
      autoReconnect: true,
      reconnectDelay: 1000,
      maxReconnectAttempts: 10,
      ...config,
    };
  }

  /**
   * Login to the session and get a user ID
   * This must be called before connecting to WebSocket or sending reactions
   */
  async login(): Promise<string> {
    const response = await fetch(
      `${this.config.apiUrl}/api/v1/session/${encodeURIComponent(this.config.token)}/login`,
      {
        method: "POST",
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status} ${response.statusText}`);
    }

    const data: LoginResponse = await response.json();
    this.uid = data.uid;
    return data.uid;
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

    // Convert http(s) to ws(s)
    const wsUrl = this.config.apiUrl
      .replace(/^http:/, "ws:")
      .replace(/^https:/, "wss:");

    const url = `${wsUrl}/ws/v1/session/${encodeURIComponent(this.config.token)}/user/${encodeURIComponent(this.uid)}/pipe`;

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

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts);
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

    const response = await fetch(
      `${this.config.apiUrl}/api/v1/session/${encodeURIComponent(this.config.token)}/user/${encodeURIComponent(this.uid)}/react/${encodeURIComponent(page)}/${encodeURIComponent(reaction)}`,
      {
        method: "POST",
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error(`React failed: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Get the current session state
   */
  async getState(): Promise<StateChangeEvent | null> {
    const response = await fetch(
      `${this.config.apiUrl}/api/v1/session/${encodeURIComponent(this.config.token)}/state`,
      {
        method: "GET",
        credentials: "include",
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Get state failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      page: data.page,
      state: data.state,
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
 * Extract token from URL query parameter
 * @param paramName The query parameter name (default: "token")
 */
export function getTokenFromUrl(paramName = "token"): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(paramName);
}

/**
 * Create a RevintClient from URL parameters
 * Expects 'token' and 'apiUrl' query parameters
 */
export function createClientFromUrl(): RevintClient {
  const token = getTokenFromUrl("token");
  const apiUrl = getTokenFromUrl("apiUrl");

  if (!token) {
    throw new Error("Missing 'token' query parameter");
  }

  if (!apiUrl) {
    throw new Error("Missing 'apiUrl' query parameter");
  }

  return new RevintClient({ token, apiUrl });
}

// Default export for convenience
export default RevintClient;
