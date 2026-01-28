when session is registered, it's public token, api and web-ui urls are stored in the session store

the qr url should only pass session uid to the web ui, which will use it to get the session
this means that api should expose getSession and it should not require a token

all other exposed api should require host token (create session, set state) or user token (login, react, getState)
this also means that only main api should be exposed to the public, various store sub-api should be only accessible by main api

add a notification to the plugin for connection status changes. ping api and attempt to periodically reconnect if connection is lost.
show connection status in the example web ui

the web ui will be mostly run on mobile devices, make sure space is used sparringly

## Specification

### Session Registration Changes

When a session is created via `POST /api/v1/session/new` (token in `x-session-token` header):
- Plugin passes `webUiUrl`, `apiUrl`, and optional `wsUrl` in the request body
- API generates a session `uid` (public identifier, different from host uid)
- Session record stores: `token`, `page`, `state`, `uid`, `apiUrl`, `webUiUrl`, `wsUrl?`
- Response includes the session `uid` for QR code generation

### Public Endpoint: getSession

`GET /api/v1/session/{sessionUid}` - Fetch session metadata by public uid
- **No authentication required** (public endpoint)
- Returns: `{ token, apiUrl, webUiUrl, wsUrl? }`
- Client uses this to get the token needed for login/react/state calls
- Returns null if session uid not found

### API URL Design

All main API endpoints use `{sessionUid}` in path instead of token. Token is sent via `x-session-token` header. This keeps URLs short and avoids exposing the signed token in URLs, logs, and browser history.

### QR Code URL Format

Old: `webUiUrl?token={hostToken}&apiUrl={apiUrl}`
New: `webUiUrl?session={sessionUid}`

The web client:
1. Extracts `session` uid from URL
2. Calls `GET /api/v1/session/{sessionUid}` to get token, apiUrl, wsUrl
3. Proceeds with login using the token in `x-session-token` header

### Authentication Requirements

**No auth required:**
- `GET /api/v1/session/{sessionUid}` - public session lookup

**Token in `x-session-token` header (verified + session match):**
- `POST /api/v1/session/new` - creates session (token-only, no sessionUid yet)
- `POST /api/v1/session/{sessionUid}/login` - user login
- `POST /api/v1/session/{sessionUid}/user/{uid}/react/{page}/{reaction}` - verify user uid matches cookie + registered
- `POST /api/v1/session/{sessionUid}/state/{page}/{state}` - host check (uid cookie in hostStore)
- `GET /api/v1/session/{sessionUid}/state` - verify user is logged in (uid cookie in userStore or hostStore)

### WebSocket Paths

WebSocket paths also use `{sessionUid}` instead of `{token}`:
- `/ws/v1/session/{sessionUid}/host/{uid}/pipe` - host connection
- `/ws/v1/session/{sessionUid}/user/{uid}/pipe` - user connection

### Plugin Connection Status

The plugin establishes a WebSocket connection as host:
- Connects to `/ws/v1/session/{sessionUid}/host/{uid}/pipe` after session creation
- Monitors connection status (connected/disconnected)
- Provides callbacks: `onConnectionChange(callback: (connected: boolean) => void)`
- Auto-reconnects with exponential backoff on connection loss
- Exposes `isConnected()` and `getSessionUid()` methods

### Web UI Connection Status

Already implemented in example app via `onConnectionChange` callback.
Web library client uses `session` URL param to fetch session info then connect.

## Decisions

### Session UID vs Token in API Paths
- **Accepted:** Use short session uid in API paths, move token to `x-session-token` header
- **Reason:** Token is too long for URLs. Session uid is a short random identifier. Header-based auth keeps URLs clean, avoids exposure in logs/browser history.
- **Rejected:** Token in URL path (original design) - URLs become unwieldy, token visible in server logs

### Session UID vs Token
- **Accepted:** Generate separate session uid for public access
- **Reason:** Token contains signed host credentials and should not be exposed in QR codes. Session uid is a random public identifier.

### URL Parameters Passed by Plugin
- **Accepted:** Plugin explicitly passes `webUiUrl`, `apiUrl`, and optional `wsUrl` during session creation
- **Reason:** More explicit control, plugin knows the deployment URLs. wsUrl needed when API and WS are on different ports.

### getSession Response
- **Accepted:** Return `token`, `apiUrl`, `webUiUrl`, `wsUrl?`
- **Reason:** Client needs token for `x-session-token` header in subsequent API calls

### Plugin WebSocket Connection
- **Accepted:** Plugin connects as host to receive state confirmations and detect connectivity
- **Reason:** Enables reliable connection status monitoring and allows future features like reaction aggregates

### Store API Access
- **Deferred:** Store APIs remain on separate ports but are only accessible within Docker network
- **Reason:** Current docker-compose setup already isolates stores (ports 3011-3014 not exposed externally)

### Token-Session Binding
- **Accepted:** Authenticated endpoints verify that the header token matches the session's stored token
- **Reason:** Prevents cross-session access. Even with a valid token, a user can only access the session that was created with that token.

## Implementation Details

### Architecture
- All main API paths use `{sessionUid}` instead of `{token}`, token moved to `x-session-token` header
- `getVerifiedToken(ctx)` helper extracts and verifies token from header
- `getVerifiedSession(sessionUid, ctx)` helper looks up session by uid, verifies header token matches stored token
- Session stored by both token key and sessionUid key for lookup flexibility
- `getSessionFunction` (public, no auth) replaces `getPublicSessionFunction`, route simplified to `GET /api/v1/session/{sessionUid}`
- WebSocket paths use `{sessionUid}`: `/ws/v1/session/{sessionUid}/host/{uid}/pipe`
- ws-server connection registry keyed by sessionUid

### Plugin
- WebSocket connection as host with auto-reconnect (exponential backoff)
- `onConnectionChange(callback)`, `isConnected()`, `getSessionUid()`, `getQRCodeUrl()` methods
- All API calls send token via `x-session-token` header, use sessionUid in path
- Example plugin page shows connection status indicator

### Web Library
- `RevintClientConfig` requires `sessionUid` field alongside `token` and `apiUrl`
- All API/WebSocket calls use sessionUid in path, token in `x-session-token` header
- `getSessionInfo(sessionUid)` calls `GET /api/v1/session/{sessionUid}` (public)
- `createClientFromSession(sessionUid)` fetches session info then creates client
- `createClientFromUrlAuto()` expects `?session={sessionUid}` URL format
- Legacy `createClientFromUrl()` and `getTokenFromUrl()` removed (require sessionUid now)

### Web Example App
- Uses `createClientFromUrlAuto()` for initialization from `?session=` URL param
