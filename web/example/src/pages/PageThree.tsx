import "./PageThree.css";

export function PageThree() {
  return (
    <div className="page-three">
      <h2>Thank You!</h2>
      <p>
        Thank you for participating in this interactive presentation.
        Your feedback helps make presentations more engaging!
      </p>
      <div className="static-content">
        <p>
          This example demonstrates the capabilities of the Reveal-Interact
          library, which enables real-time audience participation during
          presentations.
        </p>
        <ul>
          <li>Send reactions to show your engagement</li>
          <li>Participate in polls and votes</li>
          <li>See real-time results from other participants</li>
        </ul>
      </div>
    </div>
  );
}
