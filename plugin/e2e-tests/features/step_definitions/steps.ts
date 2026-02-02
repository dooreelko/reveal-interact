import { Given, When, Then, BeforeAll, AfterAll } from "@cucumber/cucumber";
import { expect } from "expect";
import { createHttpBindings, type Fetcher } from "@arinoto/cdk-arch";
import { api, type NewSessionResponse, type Session } from "@revint/arch";

// Environment configuration
let apiUrl: string;
let exampleUrl: string;
let hostToken: string;
let userToken: string;

// State
let sessionUid: string;
let hostUid: string;
let cookies: Record<string, string> = {};
let lastResponse: NewSessionResponse | Session | { success: boolean } | null = null;

// API client interface (without server-side RequestContext)
interface HostApiClient {
  newSession: (body: { userToken: string; apiUrl: string; webUiUrl: string }) => Promise<NewSessionResponse>;
  setState: (sessionUid: string, page: string, state: string) => Promise<{ success: boolean }>;
  getState: (sessionUid: string) => Promise<Session>;
}

let apiClient: HostApiClient;

/**
 * Parse Set-Cookie headers and store cookies
 */
function parseSetCookies(response: Response): void {
  const setCookies = response.headers.getSetCookie?.() || [];
  for (const cookie of setCookies) {
    const [pair] = cookie.split(";");
    const [name, value] = pair.split("=");
    if (name && value) {
      cookies[name.trim()] = value.trim();
    }
  }
}

/**
 * Build Cookie header from stored cookies
 */
function getCookieHeader(): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/**
 * Create an authenticated fetcher with token header and cookie management
 */
function createAuthFetcher(token: string): Fetcher {
  return () => ({
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {
        ...(init?.headers as Record<string, string>),
        "x-session-token": token,
      };

      const cookieHeader = getCookieHeader();
      if (cookieHeader) {
        headers["Cookie"] = cookieHeader;
      }

      const response = await fetch(input, {
        ...init,
        headers,
      });

      parseSetCookies(response);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Request failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`);
      }

      return response;
    },
  });
}

/**
 * Create API client using createHttpBindings
 */
function createApiClient(baseUrl: string, token: string): HostApiClient {
  const endpoint = { baseUrl };
  const fetcher = createAuthFetcher(token);
  const bindings = createHttpBindings(endpoint, api, ["newSession", "setState", "getState"] as const, fetcher);
  return bindings as unknown as HostApiClient;
}

BeforeAll(() => {
  // Read environment variables
  apiUrl = process.env.API_URL || "http://localhost:3000";
  exampleUrl = process.env.EXAMPLE_URL || "http://localhost:8080";
  hostToken = process.env.HOST_TOKEN || "";
  userToken = process.env.USER_TOKEN || "";

  if (!hostToken) {
    throw new Error("HOST_TOKEN environment variable must be set");
  }
  if (!userToken) {
    throw new Error("USER_TOKEN environment variable must be set");
  }

  // Reset state
  cookies = {};
  sessionUid = "";
  hostUid = "";
  lastResponse = null;

  // Create API client with host token for authentication
  apiClient = createApiClient(apiUrl, hostToken);
});

AfterAll(() => {
  // Cleanup if needed
});

// Background steps
Given("the API is running", () => {
  // API URL is already set from environment
  expect(apiUrl).toBeTruthy();
});

Given("I have a valid host token", () => {
  expect(hostToken).toBeTruthy();
  expect(userToken).toBeTruthy();
});

Given("the example server is running", () => {
  expect(exampleUrl).toBeTruthy();
});

// Session creation
When("I create a new session", async () => {
  lastResponse = await apiClient.newSession({
    userToken: userToken,
    apiUrl: apiUrl,
    webUiUrl: `${exampleUrl}`,
  });
  const response = lastResponse as NewSessionResponse;
  sessionUid = response.sessionUid;
  hostUid = response.hostUid;
});

Then("the session should be created successfully", () => {
  expect(lastResponse).toBeTruthy();
});

Then("I should receive a sessionUid and hostUid", () => {
  const response = lastResponse as NewSessionResponse;
  expect(response.sessionUid).toBeTruthy();
  expect(response.hostUid).toBeTruthy();
});

Given("I have created a session", async () => {
  lastResponse = await apiClient.newSession({
    userToken: userToken,
    apiUrl: apiUrl,
    webUiUrl: `${exampleUrl}/join`,
  });
  const response = lastResponse as NewSessionResponse;
  sessionUid = response.sessionUid;
  hostUid = response.hostUid;
});

// Set state
When("I set the state to page {string} with state {string}", async (page: string, state: string) => {
  lastResponse = await apiClient.setState(sessionUid, page, state);
});

Given("I have set the state to page {string} with state {string}", async (page: string, state: string) => {
  lastResponse = await apiClient.setState(sessionUid, page, state);
});

Then("the state should be set successfully", () => {
  const response = lastResponse as { success: boolean };
  expect(response.success).toBe(true);
});

// Get state
When("I get the session state", async () => {
  lastResponse = await apiClient.getState(sessionUid);
});

Then("the state should show page {string}", (page: string) => {
  const response = lastResponse as Session;
  expect(response.page).toBe(page);
});

// Plugin and example page tests
When("I request the plugin JavaScript", async () => {
  const response = await fetch(`${exampleUrl}/dist/reveal-interact.js`);
  const text = await response.text();
  (global as any).lastTextResponse = text;
});

Then("it should contain {string}", (expected: string) => {
  const text = (global as any).lastTextResponse as string;
  expect(text).toContain(expected);
});

When("I request the example page with the token", async () => {
  const url = `${exampleUrl}/?hostToken=${encodeURIComponent(hostToken)}&userToken=${encodeURIComponent(userToken)}&apiUrl=${encodeURIComponent(apiUrl)}&webUiUrl=${encodeURIComponent(exampleUrl + "/join")}`;
  const response = await fetch(url);
  const text = await response.text();
  (global as any).lastTextResponse = text;
});
