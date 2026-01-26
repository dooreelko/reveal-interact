import "./PageOne.css";

interface PageOneProps {
  onReact: (reaction: string) => void;
  onPollVote: (choice: string, reactionName: string) => void;
}

export function PageOne({ onPollVote }: PageOneProps) {
  return (
    <div className="page-one">
      <h2>Welcome!</h2>
      <p>Vote for your preferred choice:</p>

      <div className="poll-buttons">
        <button
          className="poll-button choice-1"
          onClick={() => onPollVote("choice1", "poll_choice1")}
        >
          Choice 1
        </button>
        <button
          className="poll-button choice-2"
          onClick={() => onPollVote("choice2", "poll_choice2")}
        >
          Choice 2
        </button>
        <button
          className="poll-button choice-3"
          onClick={() => onPollVote("somethingElse", "poll_something_else")}
        >
          Something else
        </button>
      </div>
    </div>
  );
}
