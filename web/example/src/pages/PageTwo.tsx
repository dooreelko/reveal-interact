import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import "./PageTwo.css";

interface PageTwoProps {
  pollVotes: Record<string, number>;
}

export function PageTwo({ pollVotes }: PageTwoProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Transform poll votes into chart data
    const data = [
      { choice: "Choice 1", votes: pollVotes.choice1 },
      { choice: "Choice 2", votes: pollVotes.choice2 },
      { choice: "Something else", votes: pollVotes.somethingElse },
    ];

    // Create the bar chart using Observable Plot
    const chart = Plot.plot({
      marginLeft: 100,
      marginRight: 40,
      marginTop: 20,
      marginBottom: 40,
      width: 400,
      height: 200,
      x: {
        label: "Votes",
        domain: [0, Math.max(10, ...data.map((d) => d.votes))],
      },
      y: {
        label: null,
      },
      marks: [
        Plot.barX(data, {
          y: "choice",
          x: "votes",
          fill: (d: { choice: string }) => {
            switch (d.choice) {
              case "Choice 1":
                return "#667eea";
              case "Choice 2":
                return "#f5576c";
              default:
                return "#4facfe";
            }
          },
          tip: true,
        }),
        Plot.ruleX([0]),
        Plot.text(data, {
          y: "choice",
          x: "votes",
          text: (d: { votes: number }) => String(d.votes),
          dx: 15,
          fill: "#333",
        }),
      ],
    });

    // Clear previous chart and append new one
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(chart);

    return () => {
      chart.remove();
    };
  }, [pollVotes]);

  const totalVotes =
    pollVotes.choice1 + pollVotes.choice2 + pollVotes.somethingElse;

  return (
    <div className="page-two">
      <h2>Poll Results</h2>
      <p>Total votes: {totalVotes}</p>

      <div ref={containerRef} className="chart-container" />

      {totalVotes === 0 && (
        <p className="no-votes">No votes yet. Check back after Page 1!</p>
      )}
    </div>
  );
}
