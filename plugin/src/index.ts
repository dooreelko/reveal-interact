import QRCode from "qrcode";

/**
 * Configuration for RevealInteract plugin
 */
export interface RevealInteractConfig {
  /** The host token (signed payload with name, date, host:true) */
  hostToken: string;
  /** The web UI URL that users will visit */
  webUiUrl: string;
  /** The API base URL (e.g., https://api.example.com) */
  apiUrl: string;
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
};

/**
 * Create a new session on the API
 */
async function createSession(
  apiUrl: string,
  token: string,
  webUiUrl: string,
  wsUrl?: string
): Promise<{ token: string; hostUid: string; sessionUid: string }> {
  const body: { apiUrl: string; webUiUrl: string; wsUrl?: string } = {
    apiUrl,
    webUiUrl,
  };
  if (wsUrl) {
    body.wsUrl = wsUrl;
  }

  const response = await fetch(`${apiUrl}/api/v1/session/new`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-session-token": token,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Send state change to the API
 */
async function setState(apiUrl: string, token: string, sessionUid: string, page: string, stateValue: string): Promise<void> {
  const response = await fetch(
    `${apiUrl}/api/v1/session/${encodeURIComponent(sessionUid)}/state/${encodeURIComponent(page)}/${encodeURIComponent(stateValue)}`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "x-session-token": token,
      },
    }
  );

  if (!response.ok) {
    console.error(`Failed to set state: ${response.status} ${response.statusText}`);
  }
}

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
  if (!state.config || !state.initialized || !state.sessionUid) {
    return;
  }

  const page = `${event.indexh}.${event.indexv}`;
  setState(state.config.apiUrl, state.config.hostToken, state.sessionUid, page, "slide").catch((err) => {
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
  return `${state.config.webUiUrl}?session=${encodeURIComponent(state.sessionUid)}`;
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

      if (!pluginConfig.hostToken || !pluginConfig.webUiUrl || !pluginConfig.apiUrl) {
        console.error("RevealInteract: Missing required configuration (hostToken, webUiUrl, apiUrl)");
        return;
      }

      state.config = pluginConfig;

      try {
        const session = await createSession(
          pluginConfig.apiUrl,
          pluginConfig.hostToken,
          pluginConfig.webUiUrl,
          pluginConfig.wsUrl
        );
        state.hostUid = session.hostUid;
        state.sessionUid = session.sessionUid;
        state.initialized = true;

        // Connect WebSocket for connection status monitoring
        connectWebSocket();

        // Send initial slide state
        const indices = deck.getIndices();
        const page = `${indices.h}.${indices.v}`;
        await setState(pluginConfig.apiUrl, pluginConfig.hostToken, session.sessionUid, page, "slide");

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
