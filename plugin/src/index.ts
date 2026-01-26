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
 * Internal state for the plugin
 */
interface PluginState {
  config: RevealInteractConfig | null;
  uid: string | null;
  initialized: boolean;
}

const state: PluginState = {
  config: null,
  uid: null,
  initialized: false,
};

/**
 * Create a new session on the API
 */
async function createSession(apiUrl: string, token: string): Promise<{ token: string; uid: string }> {
  const response = await fetch(`${apiUrl}/api/v1/session/new/${encodeURIComponent(token)}`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Send state change to the API
 */
async function setState(apiUrl: string, token: string, page: string, stateValue: string): Promise<void> {
  const response = await fetch(
    `${apiUrl}/api/v1/session/${encodeURIComponent(token)}/state/${encodeURIComponent(page)}/${encodeURIComponent(stateValue)}`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  if (!response.ok) {
    console.error(`Failed to set state: ${response.status} ${response.statusText}`);
  }
}

/**
 * Handle slide change event
 */
function onSlideChanged(event: SlideChangedEvent): void {
  if (!state.config || !state.initialized) {
    return;
  }

  const page = `${event.indexh}.${event.indexv}`;
  setState(state.config.apiUrl, state.config.hostToken, page, "slide").catch((err) => {
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
 * Check if the plugin is initialized
 */
export function isInitialized(): boolean {
  return state.initialized;
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
  isInitialized: typeof isInitialized;
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
        const session = await createSession(pluginConfig.apiUrl, pluginConfig.hostToken);
        state.uid = session.uid;
        state.initialized = true;

        // Send initial slide state
        const indices = deck.getIndices();
        const page = `${indices.h}.${indices.v}`;
        await setState(pluginConfig.apiUrl, pluginConfig.hostToken, page, "slide");

        // Hook into slide changes
        deck.on("slidechanged", onSlideChanged as (event: unknown) => void);

        console.log("RevealInteract: Initialized successfully", {session});
      } catch (err) {
        console.error("RevealInteract: Failed to initialize", err);
      }
    },

    destroy(): void {
      state.config = null;
      state.uid = null;
      state.initialized = false;
    },

    generateQRCode,
    generateQRCodeSVG,
    getWebUiUrl,
    getSessionToken,
    isInitialized,
  };
}
