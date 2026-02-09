import QRCode from "qrcode";
import { createHttpBindings, type Fetcher, type RouteHandlers } from "@arinoto/cdk-arch";
import { api, GetSessionResponse, type CreateSessionRequest, type NewSessionResponse } from "@revint/arch";

/**
 * Configuration for RevealInteract plugin
 */
export interface RevealInteractConfig extends GetSessionResponse {
  /** The host token (signed payload with name, date) for host authentication */
  hostToken: string;
  /** Enable auto-reconnection for WebSocket (default: true) */
  autoReconnect?: boolean;
  /** Reconnection delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnection attempts (default: 10) */
  maxReconnectAttempts?: number;
}

/**
 * Slide change event from reveal.js
 */
interface SlideChangedEvent {
  previousSlide: HTMLElement | null;
  currentSlide: HTMLElement;
  indexh: number;
  indexv: number;
}

/**
 * Reveal.js deck instance type
 */
interface RevealDeck {
  on(event: string, callback: (event: unknown) => void): void;
  off(event: string, callback: (event: unknown) => void): void;
  getConfig(): Record<string, unknown>;
  getIndices(): { h: number; v: number };
}

/**
 * Callback for connection status changes
 */
export type ConnectionCallback = (connected: boolean) => void;

/**
 * Type for host API client - uses createHttpBindings return type directly
 */
type HostApiClient = Pick<RouteHandlers<typeof api.routes>, "newSession" | "setState">;

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
        throw new Error(`Request failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`);
      }

      return response;
    },
  });
}

/**
 * Create API client for host operations
 */
function createHostApiClient(apiUrl: string, token: string): HostApiClient {
  const endpoint = { baseUrl: apiUrl };
  const fetcher = createAuthFetcher(token);

  // Create bindings with auth fetcher - types now match directly (no RequestContext in signatures)
  return createHttpBindings(endpoint, api, ["newSession", "setState"] as const, fetcher);
}

/**
 * Internal state for the plugin
 */
interface PluginState {
  config: RevealInteractConfig | null;
  hostUid: string | null;
  sessionUid: string | null;
  initialized: boolean;
  ws: WebSocket | null;
  connectionCallbacks: Set<ConnectionCallback>;
  reconnectAttempts: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  intentionallyClosed: boolean;
  apiClient: HostApiClient | null;
}

const state: PluginState = {
  config: null,
  hostUid: null,
  sessionUid: null,
  initialized: false,
  ws: null,
  connectionCallbacks: new Set(),
  reconnectAttempts: 0,
  reconnectTimeout: null,
  intentionallyClosed: false,
  apiClient: null,
};

/**
 * Notify all connection callbacks
 */
function notifyConnectionCallbacks(connected: boolean): void {
  for (const callback of state.connectionCallbacks) {
    try {
      callback(connected);
    } catch (err) {
      console.error("RevealInteract: Error in connection callback:", err);
    }
  }
}

/**
 * Create WebSocket connection
 */
function createWebSocket(): void {
  if (!state.config || !state.hostUid || !state.sessionUid) return;

  // Use configured wsUrl or derive from apiUrl
  const wsBaseUrl = state.config.wsUrl ||
    state.config.apiUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");

  const url = `${wsBaseUrl}/ws/v1/session/${encodeURIComponent(state.sessionUid)}/host/${encodeURIComponent(state.hostUid)}/pipe`;

  state.ws = new WebSocket(url);

  state.ws.onopen = () => {
    state.reconnectAttempts = 0;
    notifyConnectionCallbacks(true);
    console.log("RevealInteract: WebSocket connected");
  };

  state.ws.onclose = () => {
    notifyConnectionCallbacks(false);
    console.log("RevealInteract: WebSocket disconnected");

    const autoReconnect = state.config?.autoReconnect ?? true;
    if (!state.intentionallyClosed && autoReconnect) {
      scheduleReconnect();
    }
  };

  state.ws.onerror = (event) => {
    console.error("RevealInteract: WebSocket error:", event);
  };

  state.ws.onmessage = (event) => {
    // Host receives confirmation of state changes
    // Could be used for future features like reaction aggregates
    try {
      const message = JSON.parse(event.data);
      console.log("RevealInteract: Received message:", message);
    } catch (err) {
      console.error("RevealInteract: Failed to parse WebSocket message:", err);
    }
  };
}

/**
 * Schedule WebSocket reconnection with exponential backoff
 */
function scheduleReconnect(): void {
  const maxAttempts = state.config?.maxReconnectAttempts ?? 10;
  const baseDelay = state.config?.reconnectDelay ?? 1000;

  if (state.reconnectAttempts >= maxAttempts) {
    console.error("RevealInteract: Max reconnection attempts reached");
    return;
  }

  const delay = baseDelay * Math.pow(2, state.reconnectAttempts);
  state.reconnectAttempts++;

  console.log(`RevealInteract: Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts}/${maxAttempts})`);

  state.reconnectTimeout = setTimeout(() => {
    createWebSocket();
  }, delay);
}

/**
 * Connect WebSocket
 */
function connectWebSocket(): void {
  if (!state.hostUid) {
    throw new Error("Must initialize plugin before connecting WebSocket");
  }

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    return; // Already connected
  }

  state.intentionallyClosed = false;
  createWebSocket();
}

/**
 * Disconnect WebSocket
 */
function disconnectWebSocket(): void {
  state.intentionallyClosed = true;

  if (state.reconnectTimeout) {
    clearTimeout(state.reconnectTimeout);
    state.reconnectTimeout = null;
  }

  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
}

/**
 * Handle slide change event
 */
function onSlideChanged(event: SlideChangedEvent): void {
  if (!state.config || !state.initialized || !state.sessionUid || !state.apiClient) {
    return;
  }

  const page = `${event.indexh}.${event.indexv}`;
  state.apiClient.setState(state.sessionUid, page, "slide").catch((err) => {
    console.error("RevealInteract: Failed to send slide change", err);
  });
}

/**
 * Generate QR code as a data URL
 */
export async function generateQRCode(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 256,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}

/**
 * Generate QR code as SVG string
 */
export async function generateQRCodeSVG(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    width: 256,
    margin: 2,
  });
}

/**
 * Get the web UI URL for the current session
 */
export function getWebUiUrl(): string | null {
  return state.config?.webUiUrl ?? null;
}

/**
 * Get the current session token
 */
export function getSessionToken(): string | null {
  return state.config?.hostToken ?? null;
}

/**
 * Get the public session UID (for QR codes)
 */
export function getSessionUid(): string | null {
  return state.sessionUid;
}

/**
 * Check if the plugin is initialized
 */
export function isInitialized(): boolean {
  return state.initialized;
}

/**
 * Check if WebSocket is connected
 */
export function isConnected(): boolean {
  return state.ws !== null && state.ws.readyState === WebSocket.OPEN;
}

/**
 * Register a callback for connection status changes
 */
export function onConnectionChange(callback: ConnectionCallback): () => void {
  state.connectionCallbacks.add(callback);
  return () => state.connectionCallbacks.delete(callback);
}

/**
 * Get the QR code URL for the current session
 * Uses the session UID instead of the full token for security
 */
export function getQRCodeUrl(): string | null {
  if (!state.config || !state.sessionUid) {
    return null;
  }
  return `${state.config.webUiUrl}?session=${encodeURIComponent(state.sessionUid)}&apiUrl=${state.config.apiUrl}`;
}

/**
 * RevealInteract plugin factory
 */
export default function RevealInteract(): {
  id: string;
  init: (deck: RevealDeck) => Promise<void>;
  destroy: () => void;
  generateQRCode: typeof generateQRCode;
  generateQRCodeSVG: typeof generateQRCodeSVG;
  getWebUiUrl: typeof getWebUiUrl;
  getSessionToken: typeof getSessionToken;
  getSessionUid: typeof getSessionUid;
  getQRCodeUrl: typeof getQRCodeUrl;
  isInitialized: typeof isInitialized;
  isConnected: typeof isConnected;
  onConnectionChange: typeof onConnectionChange;
} {
  return {
    id: "revealInteract",

    async init(deck: RevealDeck): Promise<void> {
      const config = deck.getConfig() as { revealInteract?: RevealInteractConfig };
      const pluginConfig = config.revealInteract;

      if (!pluginConfig) {
        console.warn("RevealInteract: No configuration provided. Plugin disabled.");
        return;
      }

      if (!pluginConfig.hostToken || !pluginConfig.userToken || !pluginConfig.webUiUrl || !pluginConfig.apiUrl) {
        console.error(`RevealInteract: Missing required configuration (hostToken: ${!!pluginConfig.hostToken}, userToken: ${!!pluginConfig.userToken}, webUiUrl: ${pluginConfig.webUiUrl}, apiUrl: ${pluginConfig.apiUrl})`);
        return;
      }

      state.config = pluginConfig;
      state.apiClient = createHostApiClient(pluginConfig.apiUrl, pluginConfig.hostToken);

      try {
        // Create session using typed API client
        const session = await state.apiClient.newSession({
          userToken: pluginConfig.userToken,
          apiUrl: pluginConfig.apiUrl,
          webUiUrl: pluginConfig.webUiUrl,
          wsUrl: pluginConfig.wsUrl,
        });

        state.hostUid = session.hostUid;
        state.sessionUid = session.sessionUid;
        state.initialized = true;

        // Connect WebSocket for connection status monitoring
        connectWebSocket();

        // Send initial slide state using typed API client
        const indices = deck.getIndices();
        const page = `${indices.h}.${indices.v}`;
        await state.apiClient.setState(session.sessionUid, page, "slide");

        // Hook into slide changes
        deck.on("slidechanged", onSlideChanged as (event: unknown) => void);

        console.log("RevealInteract: Initialized successfully", {
          hostUid: session.hostUid,
          sessionUid: session.sessionUid,
          qrUrl: getQRCodeUrl(),
        });
      } catch (err) {
        console.error("RevealInteract: Failed to initialize", err);
      }
    },

    destroy(): void {
      disconnectWebSocket();
      state.config = null;
      state.hostUid = null;
      state.sessionUid = null;
      state.initialized = false;
      state.connectionCallbacks.clear();
      state.reconnectAttempts = 0;
      state.apiClient = null;
    },

    generateQRCode,
    generateQRCodeSVG,
    getWebUiUrl,
    getSessionToken,
    getSessionUid,
    getQRCodeUrl,
    isInitialized,
    isConnected,
    onConnectionChange,
  };
}
