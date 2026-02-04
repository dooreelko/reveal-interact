import { describe, it, beforeEach, before } from "node:test";
import assert from "node:assert";
import {
  generateTestKeyPair,
  generateToken,
  setupInMemoryStores,
  createMockContext,
  createMockBinding,
  type MockStores,
  type ContextProvider,
} from "./setup";
import { api, sessionStore } from "../src/architecture";
import type { Session } from "../src/types";

describe("Architecture Unit Tests", () => {
  let keys: { publicKey: string; privateKey: string };
  let stores: MockStores;
  let hostToken: string;
  let userToken: string;

  before(() => {
    // Generate keys once for all tests
    keys = generateTestKeyPair();
  });

  beforeEach(() => {
    // Set up fresh stores for each test
    stores = setupInMemoryStores();

    // Generate fresh tokens
    const date = new Date().toISOString().split("T")[0];
    hostToken = generateToken("Test Host", date, keys.privateKey);
    userToken = generateToken("Test User", date, keys.privateKey);
  });

  describe("newSessionFunction", () => {
    it("should create a new session with valid host token", async () => {
      const client = createMockBinding(
        api,
        ["newSession"] as const,
        () => createMockContext({ token: hostToken, publicKey: keys.publicKey })
      );

      const result = await client.newSession({
        userToken,
        apiUrl: "http://api.example.com",
        webUiUrl: "http://ui.example.com",
      });

      assert.ok(result.token, "Should return token");
      assert.ok(result.hostUid, "Should return hostUid");
      assert.ok(result.sessionUid, "Should return sessionUid");
      assert.strictEqual(result.token, hostToken, "Token should match host token");

      // Verify stores were populated
      const sessions = await stores.sessions.get(result.sessionUid);
      assert.strictEqual(sessions.length, 1, "Session should be stored");
      assert.strictEqual(sessions[0].token, hostToken);
      assert.strictEqual(sessions[0].userToken, userToken);

      const hosts = await stores.hosts.get(hostToken);
      assert.strictEqual(hosts.length, 1, "Host should be stored");
      assert.strictEqual(hosts[0].uid, result.hostUid);
    });

    it("should fail without x-session-token header", async () => {
      const client = createMockBinding(
        api,
        ["newSession"] as const,
        () => createMockContext({ publicKey: keys.publicKey })
      );

      await assert.rejects(
        () => client.newSession({
          userToken,
          apiUrl: "http://api.example.com",
          webUiUrl: "http://ui.example.com",
        }),
        /Missing x-session-token header/
      );
    });

    it("should fail with invalid host token", async () => {
      const client = createMockBinding(
        api,
        ["newSession"] as const,
        () => createMockContext({ token: "invalid.token", publicKey: keys.publicKey })
      );

      await assert.rejects(
        () => client.newSession({
          userToken,
          apiUrl: "http://api.example.com",
          webUiUrl: "http://ui.example.com",
        }),
        /Invalid token/
      );
    });

    it("should fail with invalid user token in body", async () => {
      const client = createMockBinding(
        api,
        ["newSession"] as const,
        () => createMockContext({ token: hostToken, publicKey: keys.publicKey })
      );

      await assert.rejects(
        () => client.newSession({
          userToken: "invalid.user.token",
          apiUrl: "http://api.example.com",
          webUiUrl: "http://ui.example.com",
        }),
        /Invalid user token/
      );
    });
  });

  describe("getSessionFunction", () => {
    it("should return session info for existing session (public endpoint)", async () => {
      // Pre-populate session
      const sessionUid = "test-session-123";
      const session: Session = {
        token: hostToken,
        userToken,
        page: "0",
        state: "init",
        uid: sessionUid,
        apiUrl: "http://api.example.com",
        webUiUrl: "http://ui.example.com",
      };
      stores.sessions.set(sessionUid, [session]);

      // No auth required - public endpoint
      const client = createMockBinding(
        api,
        ["getSession"] as const,
        () => createMockContext({})
      );

      const result = await client.getSession(sessionUid);

      assert.ok(result, "Should return session info");
      assert.strictEqual(result.userToken, userToken);
      assert.strictEqual(result.apiUrl, "http://api.example.com");
      assert.strictEqual(result.webUiUrl, "http://ui.example.com");
    });

    it("should return null for non-existent session", async () => {
      const client = createMockBinding(
        api,
        ["getSession"] as const,
        () => createMockContext({})
      );

      const result = await client.getSession("non-existent-session");

      assert.strictEqual(result, null);
    });
  });

  describe("loginFunction", () => {
    let sessionUid: string;

    beforeEach(() => {
      // Pre-populate session for login tests
      sessionUid = "test-session-456";
      const session: Session = {
        token: hostToken,
        userToken,
        page: "0",
        state: "init",
        uid: sessionUid,
        apiUrl: "http://api.example.com",
        webUiUrl: "http://ui.example.com",
      };
      stores.sessions.set(sessionUid, [session]);
    });

    it("should login user with valid user token", async () => {
      const client = createMockBinding(
        api,
        ["login"] as const,
        () => createMockContext({ token: userToken, publicKey: keys.publicKey })
      );

      const result = await client.login(sessionUid);

      assert.ok(result.uid, "Should return user uid");

      // Verify user was stored
      const users = await stores.users.get(userToken);
      assert.strictEqual(users.length, 1, "User should be stored");
      assert.strictEqual(users[0].uid, result.uid);
    });

    it("should reuse existing uid from cookie", async () => {
      const existingUid = "existing-user-id";
      const client = createMockBinding(
        api,
        ["login"] as const,
        () => createMockContext({
          token: userToken,
          publicKey: keys.publicKey,
          cookies: { uid: existingUid },
        })
      );

      const result = await client.login(sessionUid);

      assert.strictEqual(result.uid, existingUid, "Should reuse existing uid");

      // User should NOT be stored again
      const users = await stores.users.get(userToken);
      assert.strictEqual(users.length, 0, "User should not be stored again");
    });

    it("should fail without user token", async () => {
      const client = createMockBinding(
        api,
        ["login"] as const,
        () => createMockContext({ publicKey: keys.publicKey })
      );

      await assert.rejects(
        () => client.login(sessionUid),
        /Missing x-session-token header/
      );
    });

    it("should fail with host token instead of user token", async () => {
      const client = createMockBinding(
        api,
        ["login"] as const,
        () => createMockContext({ token: hostToken, publicKey: keys.publicKey })
      );

      await assert.rejects(
        () => client.login(sessionUid),
        /Token does not match session/
      );
    });

    it("should fail for non-existent session", async () => {
      const client = createMockBinding(
        api,
        ["login"] as const,
        () => createMockContext({ token: userToken, publicKey: keys.publicKey })
      );

      await assert.rejects(
        () => client.login("non-existent"),
        /Session not found/
      );
    });
  });

  describe("reactFunction", () => {
    let sessionUid: string;
    let userId: string;

    beforeEach(() => {
      // Pre-populate session and user
      sessionUid = "test-session-789";
      userId = "test-user-id";

      const session: Session = {
        token: hostToken,
        userToken,
        page: "0",
        state: "init",
        uid: sessionUid,
        apiUrl: "http://api.example.com",
        webUiUrl: "http://ui.example.com",
      };
      stores.sessions.set(sessionUid, [session]);
      stores.users.set(userToken, [{ token: userToken, uid: userId }]);
    });

    it("should record reaction for logged-in user", async () => {
      const client = createMockBinding(
        api,
        ["react"] as const,
        () => createMockContext({
          token: userToken,
          publicKey: keys.publicKey,
          cookies: { uid: userId },
        })
      );

      const result = await client.react(sessionUid, userId, "1", "thumbsup");

      assert.deepStrictEqual(result, { success: true });

      // Verify reaction was stored - use list with filters
      const reactions = await stores.reactions.list({ sessionUid });
      assert.strictEqual(reactions.length, 1);
      assert.strictEqual(reactions[0].page, "1");
      assert.strictEqual(reactions[0].reaction, "thumbsup");
      assert.strictEqual(reactions[0].uid, userId);
      assert.strictEqual(reactions[0].sessionUid, sessionUid);
    });

    it("should record multiple reactions for the same logged-in user on the same page", async () => {
      const client = createMockBinding(
        api,
        ["react"] as const,
        () => createMockContext({
          token: userToken,
          publicKey: keys.publicKey,
          cookies: { uid: userId },
        })
      );

      await client.react(sessionUid, userId, "1", "thumbsup");
      const result = await client.react(sessionUid, userId, "1", "thumbsup");

      assert.deepStrictEqual(result, { success: true });

      // Verify both reactions were stored - use list with filters
      const reactions = await stores.reactions.list({ sessionUid, page: "1", uid: userId });
      assert.strictEqual(reactions.length, 2);
      assert.strictEqual(reactions[0].page, reactions[1].page);
      assert.strictEqual(reactions[0].reaction, reactions[1].reaction);
      assert.strictEqual(reactions[0].uid, reactions[1].uid);
    });

    it("should fail without authentication", async () => {
      const client = createMockBinding(
        api,
        ["react"] as const,
        () => createMockContext({
          publicKey: keys.publicKey,
          cookies: { uid: userId },
        })
      );

      await assert.rejects(
        () => client.react(sessionUid, userId, "1", "thumbsup"),
        /Missing x-session-token header/
      );
    });

    it("should fail with uid mismatch", async () => {
      const client = createMockBinding(
        api,
        ["react"] as const,
        () => createMockContext({
          token: userToken,
          publicKey: keys.publicKey,
          cookies: { uid: "different-uid" },
        })
      );

      await assert.rejects(
        () => client.react(sessionUid, userId, "1", "thumbsup"),
        /user id mismatch/
      );
    });

    it("should fail for unregistered user", async () => {
      const unregisteredUserId = "unregistered-user";
      const client = createMockBinding(
        api,
        ["react"] as const,
        () => createMockContext({
          token: userToken,
          publicKey: keys.publicKey,
          cookies: { uid: unregisteredUserId },
        })
      );

      await assert.rejects(
        () => client.react(sessionUid, unregisteredUserId, "1", "thumbsup"),
        /user not registered/
      );
    });

    it("should fail for non-existent session", async () => {
      const client = createMockBinding(
        api,
        ["react"] as const,
        () => createMockContext({
          token: userToken,
          publicKey: keys.publicKey,
          cookies: { uid: userId },
        })
      );

      await assert.rejects(
        () => client.react("non-existent", userId, "1", "thumbsup"),
        /Session not found/
      );
    });
  });

  describe("setStateFunction", () => {
    let sessionUid: string;
    let hostUid: string;

    beforeEach(() => {
      // Pre-populate session and host
      sessionUid = "test-session-state";
      hostUid = "test-host-id";

      const session: Session = {
        token: hostToken,
        userToken,
        page: "0",
        state: "init",
        uid: sessionUid,
        apiUrl: "http://api.example.com",
        webUiUrl: "http://ui.example.com",
      };
      stores.sessions.set(sessionUid, [session]);
      stores.hosts.set(hostToken, [{ token: hostToken, uid: hostUid }]);
    });

    it("should update state for host", async () => {
      const client = createMockBinding(
        api,
        ["setState"] as const,
        () => createMockContext({
          token: hostToken,
          publicKey: keys.publicKey,
          cookies: { uid: hostUid },
        })
      );

      const result = await client.setState(sessionUid, "5", "presenting");

      assert.deepStrictEqual(result, { success: true });

      // Verify session was updated
      const sessions = await stores.sessions.get(sessionUid);
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].page, "5");
      assert.strictEqual(sessions[0].state, "presenting");
    });

    it("should fail without host token", async () => {
      const client = createMockBinding(
        api,
        ["setState"] as const,
        () => createMockContext({
          publicKey: keys.publicKey,
          cookies: { uid: hostUid },
        })
      );

      await assert.rejects(
        () => client.setState(sessionUid, "5", "presenting"),
        /Missing x-session-token header/
      );
    });

    it("should fail with user token instead of host token", async () => {
      const client = createMockBinding(
        api,
        ["setState"] as const,
        () => createMockContext({
          token: userToken,
          publicKey: keys.publicKey,
          cookies: { uid: hostUid },
        })
      );

      await assert.rejects(
        () => client.setState(sessionUid, "5", "presenting"),
        /Token does not match session/
      );
    });

    it("should fail without host uid in cookie", async () => {
      const client = createMockBinding(
        api,
        ["setState"] as const,
        () => createMockContext({
          token: hostToken,
          publicKey: keys.publicKey,
          cookies: { uid: "wrong-uid" },
        })
      );

      await assert.rejects(
        () => client.setState(sessionUid, "5", "presenting"),
        /only host can set state/
      );
    });

    it("should fail for non-existent session", async () => {
      const client = createMockBinding(
        api,
        ["setState"] as const,
        () => createMockContext({
          token: hostToken,
          publicKey: keys.publicKey,
          cookies: { uid: hostUid },
        })
      );

      await assert.rejects(
        () => client.setState("non-existent", "5", "presenting"),
        /Session not found/
      );
    });
  });

  describe("getStateFunction", () => {
    let sessionUid: string;
    let hostUid: string;
    let userId: string;

    beforeEach(() => {
      sessionUid = "test-session-getstate";
      hostUid = "test-host-id";
      userId = "test-user-id";

      const session: Session = {
        token: hostToken,
        userToken,
        page: "3",
        state: "presenting",
        uid: sessionUid,
        apiUrl: "http://api.example.com",
        webUiUrl: "http://ui.example.com",
      };
      stores.sessions.set(sessionUid, [session]);
      stores.hosts.set(hostToken, [{ token: hostToken, uid: hostUid }]);
      stores.users.set(userToken, [{ token: userToken, uid: userId }]);
    });

    it("should return state for host", async () => {
      const client = createMockBinding(
        api,
        ["getState"] as const,
        () => createMockContext({
          token: hostToken,
          publicKey: keys.publicKey,
          cookies: { uid: hostUid },
        })
      );

      const result = await client.getState(sessionUid);

      assert.ok(result, "Should return session");
      assert.strictEqual(result.page, "3");
      assert.strictEqual(result.state, "presenting");
    });

    it("should return state for logged-in user", async () => {
      const client = createMockBinding(
        api,
        ["getState"] as const,
        () => createMockContext({
          token: userToken,
          publicKey: keys.publicKey,
          cookies: { uid: userId },
        })
      );

      const result = await client.getState(sessionUid);

      assert.ok(result, "Should return session");
      assert.strictEqual(result.page, "3");
      assert.strictEqual(result.state, "presenting");
    });

    it("should fail without being logged in (no uid cookie)", async () => {
      const client = createMockBinding(
        api,
        ["getState"] as const,
        () => createMockContext({
          token: userToken,
          publicKey: keys.publicKey,
          cookies: {},
        })
      );

      await assert.rejects(
        () => client.getState(sessionUid),
        /must be logged in/
      );
    });

    it("should fail without authentication token", async () => {
      const client = createMockBinding(
        api,
        ["getState"] as const,
        () => createMockContext({
          publicKey: keys.publicKey,
          cookies: { uid: userId },
        })
      );

      await assert.rejects(
        () => client.getState(sessionUid),
        /Missing x-session-token header/
      );
    });

    it("should fail for non-existent session", async () => {
      const client = createMockBinding(
        api,
        ["getState"] as const,
        () => createMockContext({
          token: hostToken,
          publicKey: keys.publicKey,
          cookies: { uid: hostUid },
        })
      );

      await assert.rejects(
        () => client.getState("non-existent"),
        /Session not found/
      );
    });

    it("should fail for unregistered user uid", async () => {
      const client = createMockBinding(
        api,
        ["getState"] as const,
        () => createMockContext({
          token: userToken,
          publicKey: keys.publicKey,
          cookies: { uid: "unregistered-uid" },
        })
      );

      await assert.rejects(
        () => client.getState(sessionUid),
        /user not registered/
      );
    });
  });

  describe("DataStore validation", () => {
    it("should throw error when filtering on store without indices", async () => {
      // sessionStore has no indices defined
      await assert.rejects(
        () => sessionStore.list({ token: "some-token" } as any),
        /Cannot filter by fields when no indices are defined/
      );
    });
  });
});
