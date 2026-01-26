create an npm library under ./web/revint-lib that can be used in a js single page application that will be used by session participants.
the SPA will receive session token in the url and pass it to the library, which in turn:

- call the login function of the api
- establish a websoket connection to it
- offer a callback mechanism for session state change events
- expose the reaction and state api

the state object will be a json with page unique name, optional title and optional subtitle

along the library, under ./web/example create a react web app that will use the library and
- listen to the state changes from the presentation and for each page show title from state
- on each page will have a buttons for thumbs up, heart and mindblown reactions
- on page one will have three buttons for custom poll with options "choice 1", "choice 2" and "something else"
- on page two show the frequency distribution diagram for each of the choices from page one. use observable js for the visuals
- on page three show static text

## Specification

### revint-lib Package (@revint/lib)

#### Configuration
The client is configured with:
- `apiUrl`: The API base URL (e.g., https://api.example.com)
- `token`: Session token from URL (passed from presentation QR code)
- `autoReconnect`: Enable WebSocket auto-reconnection (default: true)
- `reconnectDelay`: Base delay in ms for exponential backoff (default: 1000)
- `maxReconnectAttempts`: Maximum reconnection attempts (default: 10)

#### API
- `login()`: Authenticates with the API, returns user ID, sets session cookies
- `connect()`: Establishes WebSocket connection for receiving state updates
- `disconnect()`: Closes WebSocket connection
- `onStateChange(callback)`: Register listener for state change events
- `onConnectionChange(callback)`: Register listener for connection status
- `react(page, reaction)`: Send a reaction for a specific page
- `getState()`: Fetch current session state from API
- Convenience methods: `thumbsUp(page)`, `heart(page)`, `mindBlown(page)`

#### Utility Functions
- `getTokenFromUrl(paramName?)`: Extract token from URL query parameter
- `createClientFromUrl()`: Create client using `token` and `apiUrl` URL params

### Example App (./web/example)

#### URL Parameters
The app expects: `?token=<session-token>&apiUrl=<api-url>`

#### Pages
- **Page 0 (indexh=0)**: Poll page with three choices, plus global reactions
- **Page 1 (indexh=1)**: Results page showing poll distribution chart
- **Page 2 (indexh=2)**: Static thank-you content
- **Page 3+ (indexh>2)**: Generic page with just reactions

#### State Display
- Shows current page indicator (e.g., "0.0", "1.0")
- Attempts to parse state as JSON for title/subtitle
- Falls back to raw state string if not JSON
- Global reaction buttons (thumbsup, heart, mindblown) always visible in footer

## Decisions

### Package Manager
- **Accepted:** npm
- **Reason:** Consistent with existing api/ packages

### React Framework
- **Accepted:** Vite with React TypeScript template
- **Reason:** Fast, modern bundler with excellent React support

### State Format
- **Accepted:** Keep string state (pass-through)
- **Reason:** Library passes whatever state the host sends; example app handles parsing
- **Rejected:** Enforce JSON structure - too restrictive for library

### Build System
- **Accepted:** esbuild for revint-lib, Vite for example app
- **Reason:** Fast bundling, produces ESM and IIFE bundles for library

### Visualization Library
- **Accepted:** @observablehq/plot
- **Reason:** Modern, declarative charting library from Observable

### Poll Data Storage
- **Accepted:** Local React state + API reactions
- **Reason:** Poll votes are sent as reactions (poll_choice1, poll_choice2, poll_something_else) and tracked locally for immediate UI feedback

## Implementation Details

- Library at `./web/revint-lib` with TypeScript source in `src/`
- Exports RevintClient class and utility functions
- Two bundle formats: ESM and IIFE (global: RevintLib)
- WebSocket uses exponential backoff for reconnection
- Example app uses horizontal slide index (indexh) to determine current page
- Chart visualization uses Observable Plot's barX mark
- CSS uses modern gradients and flexbox for mobile-friendly layout

## File Structure
```
web/
├── revint-lib/
│   ├── package.json
│   ├── tsconfig.json
│   ├── scripts/
│   │   └── bundle.js
│   ├── src/
│   │   └── index.ts
│   └── dist/
│       ├── index.d.ts
│       ├── revint-lib.esm.js
│       └── revint-lib.js
└── example/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── App.css
        ├── index.css
        └── pages/
            ├── PageOne.tsx
            ├── PageOne.css
            ├── PageTwo.tsx
            ├── PageTwo.css
            ├── PageThree.tsx
            └── PageThree.css
```

## Usage

### Building the Library
```bash
cd web/revint-lib
npm install
npm run build
```

### Running the Example App
```bash
cd web/example
npm install
npm run dev
# Open http://localhost:5173?token=YOUR_TOKEN&apiUrl=http://localhost:3000
```

### Building the Example App
```bash
cd web/example
npm run build
# Output in dist/
```
