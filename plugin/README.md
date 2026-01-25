# @revint/plugin

Reveal.js plugin for audience interaction. Tracks slide changes and provides QR code generation for audience to join the session.

## Installation

```bash
npm install @revint/plugin
```

## Setup

### 1. Generate Keys

First, set up the signing keys (one-time setup):

```bash
source scripts/setup-keys.sh
```

This creates `~/.ssh/revint-private.pem` and `~/.ssh/revint-public.pem`.

### 2. Generate Host Token

Generate a host token for your presentation:

```bash
./scripts/generate-host-token.sh "My Presentation" "2025-01-25"
```

Save the output token for use in your presentation.

## Usage

### ESM (Recommended)

```javascript
import Reveal from 'reveal.js';
import RevealInteract from '@revint/plugin';

const deck = new Reveal(document.querySelector('.reveal'));

await deck.initialize({
  plugins: [RevealInteract()],
  revealInteract: {
    hostToken: 'eyJuYW1lIjoi...', // Your generated host token
    webUiUrl: 'https://audience.example.com/session',
    apiUrl: 'https://api.example.com'
  }
});

// Generate QR code for audience
const plugin = deck.getPlugin('revealInteract');
const qrDataUrl = await plugin.generateQRCode(plugin.getWebUiUrl());
document.getElementById('qr-code').src = qrDataUrl;
```

### Script Tag

```html
<script src="dist/reveal.js"></script>
<script src="dist/reveal-interact.js"></script>
<script>
  Reveal.initialize({
    plugins: [RevealInteract()],
    revealInteract: {
      hostToken: 'eyJuYW1lIjoi...',
      webUiUrl: 'https://audience.example.com/session',
      apiUrl: 'https://api.example.com'
    }
  });
</script>
```

## Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `hostToken` | string | Yes | Signed host token from `generate-host-token.sh` |
| `webUiUrl` | string | Yes | URL for audience to join (shown in QR code) |
| `apiUrl` | string | Yes | Base URL of the reveal-interact API |

## API

Access the plugin instance via `deck.getPlugin('revealInteract')`:

### `generateQRCode(url: string): Promise<string>`

Returns a data URL for the QR code image. Use with `<img>` tags:

```javascript
const plugin = deck.getPlugin('revealInteract');
const dataUrl = await plugin.generateQRCode('https://example.com');
document.getElementById('qr').src = dataUrl;
```

### `generateQRCodeSVG(url: string): Promise<string>`

Returns an SVG string for inline embedding:

```javascript
const plugin = deck.getPlugin('revealInteract');
const svg = await plugin.generateQRCodeSVG('https://example.com');
document.getElementById('qr-container').innerHTML = svg;
```

### `getWebUiUrl(): string | null`

Returns the configured web UI URL, or `null` if not initialized.

### `getSessionToken(): string | null`

Returns the host token, or `null` if not initialized.

### `isInitialized(): boolean`

Returns `true` if the plugin successfully created a session.

## How It Works

1. On initialization, the plugin calls `POST /api/v1/session/new/{token}` to create a session
2. The API validates the token signature and registers the host
3. Session cookies are set for subsequent API calls
4. On each slide change, the plugin calls `POST /api/v1/session/{token}/state/{page}/slide`
5. Page format is `{horizontal}.{vertical}` (e.g., "2.1" for slide 3, vertical slide 2)

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Build
npm run build
```

## License

MIT
