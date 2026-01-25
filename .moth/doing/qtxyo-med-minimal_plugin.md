create a revealjs plugin under ./plugin
it should use typescript
it should be initialized with
- a separate host token which has the same fields as the session token, plus {host:true} (create a script for that)
- web ui url

it should have a function to show QR code of the web ui url
it should hook to page change events and send them to the api using the host token for auth

## Specification

### Plugin Configuration
The plugin is configured via reveal.js config object:
```javascript
Reveal.initialize({
  plugins: [RevealInteract],
  revealInteract: {
    hostToken: "<generated-host-token>",
    webUiUrl: "https://audience.example.com/session",
    apiUrl: "https://api.example.com"
  }
});
```

### Host Token Format
- Extends session token: `{ name: string, date: string, host: true }`
- Format: `base64url(payload).base64url(signature)`
- Signed with host's private key, verified by API with public key
- Compatible with existing API token verification (extra `host` field is allowed)

### QR Code Generation
- `generateQRCode(url)`: Returns data URL for embedding in `<img>` tags
- `generateQRCodeSVG(url)`: Returns SVG string for inline embedding
- Both functions are exported and accessible via `Reveal.getPlugin('revealInteract')`

### Slide Change Tracking
- Hooks into `slidechanged` event
- Sends state to API: `POST /api/v1/session/{token}/state/{page}/slide`
- Page format: `{indexh}.{indexv}` (e.g., "2.1" for slide 3, vertical slide 2)

## Decisions

### Token format
- **Accepted:** Extend existing SessionToken with `host: true` field
- **Reason:** Simpler implementation, compatible with existing API verification

### Authentication
- **Accepted:** Token in URL path as per IDEA.md specification
- **Reason:** Consistent with existing API design, session cookies set after createSession call

### QR Code display
- **Accepted:** Embeddable image via data URL or SVG
- **Reason:** Flexible for presentation authors to place where they want
- **Rejected:** Modal overlay or dedicated slide - too opinionated

### Build system
- **Accepted:** esbuild for fast bundling
- **Reason:** Fast, produces both ESM and IIFE bundles for different use cases

## Implementation Details

- Plugin package at `./plugin` with TypeScript source
- Uses `qrcode` library for QR generation (Canvas-based, works in browser)
- On init: creates session via API, stores uid, sends initial slide state
- Exports factory function that returns plugin object with id, init, destroy
- Two bundle formats: ESM for modern imports, IIFE for script tag usage

## File Structure
```
plugin/
├── package.json
├── tsconfig.json
├── README.md             # Usage documentation
├── src/
│   └── index.ts          # Plugin implementation
├── dist/
│   ├── index.d.ts        # TypeScript declarations
│   ├── reveal-interact.esm.js  # ESM bundle
│   └── reveal-interact.js      # IIFE bundle (global: RevealInteract)
├── example/
│   ├── index.html        # Demo presentation
│   └── serve.js          # Simple HTTP server for demo
└── scripts/
    └── e2e-test.sh       # E2E test script
scripts/
└── generate-host-token.sh  # Host token generation script
```

## Usage

### Generate Host Token
```bash
source scripts/setup-keys.sh  # Set up keys if not done
./scripts/generate-host-token.sh "My Presentation" "2025-01-25"
```

### In Presentation (ESM)
```javascript
import Reveal from 'reveal.js';
import RevealInteract from '@revint/plugin';

const deck = new Reveal();
deck.initialize({
  plugins: [RevealInteract()],
  revealInteract: {
    hostToken: "eyJ...",
    webUiUrl: "https://audience.example.com",
    apiUrl: "https://api.example.com"
  }
});

// Get QR code
const plugin = deck.getPlugin('revealInteract');
const qrDataUrl = await plugin.generateQRCode(plugin.getWebUiUrl());
document.getElementById('qr').src = qrDataUrl;
```

### In Presentation (Script Tag)
```html
<script src="reveal-interact.js"></script>
<script>
  Reveal.initialize({
    plugins: [RevealInteract()],
    revealInteract: { /* config */ }
  });
</script>
```

### Running the Example
```bash
cd plugin
npm run build
npm run example
# Open http://localhost:8080?token=YOUR_TOKEN&apiUrl=http://localhost:3000
```

### E2E Testing
```bash
# First start the API (in api/packages/infra-docker)
npm run deploy

# Then run e2e tests (in plugin)
npm run test:e2e
```

The e2e test script:
1. Builds the plugin
2. Generates a host token
3. Starts the example server
4. Tests API connectivity and session creation
5. Verifies plugin JavaScript loads correctly
