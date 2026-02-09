import { useEffect, useState, useCallback } from "react";
import {
  RevintClient,
  createClientFromUrlAuto,
  type StateChangeEvent,
} from "@revint/lib";
import "./App.css";
import { PageOne } from "./pages/PageOne";
import { PageTwo } from "./pages/PageTwo";
import { PageThree } from "./pages/PageThree";

function App() {
  const [client, setClient] = useState<RevintClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [currentState, setCurrentState] = useState<StateChangeEvent | null>(
    null
  );
  const [pollVotes, setPollVotes] = useState<Record<string, number>>({
    choice1: 0,
    choice2: 0,
    somethingElse: 0,
  });

  // Initialize client on mount
  useEffect(() => {
    let revintClient: RevintClient | null = null;
    let unsubscribeState: (() => void) | null = null;
    let unsubscribeConnection: (() => void) | null = null;

    const initClient = async () => {
      try {
        // Auto-detect URL format (session UID or legacy token+apiUrl)
        revintClient = await createClientFromUrlAuto();
        setClient(revintClient);

        // Login and connect
        await revintClient.login();
        revintClient.connect();
        const state = await revintClient.getState();
        if (state) {
          setCurrentState(state);
        }

        // Listen for state changes
        unsubscribeState = revintClient.onStateChange((event) => {
          setCurrentState(event);
        });

        // Listen for connection changes
        unsubscribeConnection = revintClient.onConnectionChange(
          (isConnected) => {
            setConnected(isConnected);
          }
        );
      } catch (err) {
        console.log(err, (err as any).stack);
        setError(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    };

    initClient();

    return () => {
      unsubscribeState?.();
      unsubscribeConnection?.();
      revintClient?.disconnect();
    };
  }, []);

  // Handle reaction
  const handleReact = useCallback(
    async (reaction: string) => {
      if (!client || !currentState) return;
      try {
        await client.react(currentState.page, reaction);
      } catch (err) {
        console.error("Failed to send reaction:", err);
      }
    },
    [client, currentState]
  );

  // Handle poll vote
  const handlePollVote = useCallback(
    async (choice: string, reactionName: string) => {
      if (!client || !currentState) return;
      try {
        await client.react(currentState.page, reactionName);
        setPollVotes((prev) => ({
          ...prev,
          [choice]: prev[choice] + 1,
        }));
      } catch (err) {
        console.error("Failed to send poll vote:", err);
      }
    },
    [client, currentState]
  );

  if (error) {
    return (
      <div className="app error">
        <h1>Error</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="app loading">
        <h1>Loading...</h1>
      </div>
    );
  }

  // Determine which page to show based on current state
  const currentPage = currentState?.page || "0.0";
  const [pageH] = currentPage.split(".").map(Number);

  // Parse title from state if it's JSON, otherwise use state as-is
  let title = currentState?.state || "Waiting for presentation...";
  let subtitle: string | undefined;

  try {
    const parsed = JSON.parse(currentState?.state || "{}");
    if (parsed.title) title = parsed.title;
    if (parsed.subtitle) subtitle = parsed.subtitle;
  } catch {
    // State is not JSON, use as-is
  }

  return (
    <div className="app">
      <header className="header">
        <div className="connection-status">
          <span
            className={`status-dot ${connected ? "connected" : "disconnected"}`}
          />
          {connected ? "Connected" : "Disconnected"}
        </div>
        <h1>{title}</h1>
        {subtitle && <h2 className="subtitle">{subtitle}</h2>}
        <p className="page-indicator">Page: {currentPage}</p>
      </header>

      <main className="content">
        {pageH === 0 && (
          <PageOne
            onReact={handleReact}
            onPollVote={handlePollVote}
          />
        )}
        {pageH === 1 && <PageTwo pollVotes={pollVotes} />}
        {pageH === 2 && <PageThree />}
        {pageH > 2 && (
          <div className="page-placeholder">
            <p>Page {pageH + 1}</p>
            <div className="reactions">
              <button onClick={() => handleReact("thumbsup")}>
                <span role="img" aria-label="thumbs up">
                  👍
                </span>
              </button>
              <button onClick={() => handleReact("heart")}>
                <span role="img" aria-label="heart">
                  ❤️
                </span>
              </button>
              <button onClick={() => handleReact("mindblown")}>
                <span role="img" aria-label="mind blown">
                  🤯
                </span>
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="reactions">
          <button onClick={() => handleReact("thumbsup")} title="Thumbs Up">
            <span role="img" aria-label="thumbs up">
              👍
            </span>
          </button>
          <button onClick={() => handleReact("heart")} title="Love it">
            <span role="img" aria-label="heart">
              ❤️
            </span>
          </button>
          <button onClick={() => handleReact("mindblown")} title="Mind Blown">
            <span role="img" aria-label="mind blown">
              🤯
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
