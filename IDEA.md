# Reveal-interact api

This is the api that allow the audience of a presentation to provide realtime feedback.
General flow.

- When presentation starts, new session is registered using `POST /api/v1/session/new` with token in `x-session-token` header.
  Token is the session information (name, date) signed by host's private key. The api validates the token using the stored public key.
  Host provides `webUiUrl`, `apiUrl`, and optional `wsUrl` in the request body.
  Response includes `token`, `hostUid`, and `sessionUid` (public identifier for QR codes).
  Host ID is stored in the backend (host table - token, uid) marking them as a host.
- Host establishes a websocket connection under `/ws/v1/session/{sessionUid}/host/{uid}/pipe`
- QR code URL format: `{webUiUrl}?session={sessionUid}` - users scan this to join
- Web client calls `GET /api/v1/session/{sessionUid}` (public, no auth) to get session info including token
- On page load an API call is made to `POST /api/v1/session/{sessionUid}/login` with token in `x-session-token` header.
  User ID is stored in the user table (token, uid) and returned in response.
- Using the user id, user establishes a websocket connection using `/ws/v1/session/{sessionUid}/user/{uid}/pipe` route
- During the entire session a user can send a reaction using `POST /api/v1/session/{sessionUid}/user/{uid}/react/{page}/{reaction}` with token in header.
  This is stored in a reaction table (time, token, uid, page, reaction). Same user can send the same reaction several times for any page.
- During a session the host will notify state change using `POST /api/v1/session/{sessionUid}/state/{page}/{state}` with token in header.
  State is just a text. This information is stored in the session table (token, page, state, uid, apiUrl, webUiUrl, wsUrl?).
  This triggers a broadcast message to all connected users of the session.
- During the session users can query the current state using `GET /api/v1/session/{sessionUid}/state` with token in header.

## API Authentication

All authenticated endpoints require `x-session-token` header containing the signed token.
Public endpoint `GET /api/v1/session/{sessionUid}` requires no authentication.

## Architecture and design

### API

API is implemented using @arinoto/cdk-arch (start at https://github.com/dooreelko/cdk-arch/blob/main/IDEA.md then https://github.com/dooreelko/cdk-arch/tree/main/packages/example) with local docker compose being default target and Cloudflare being a secondary one and AWS being the backup

For cloudflare use workers and KV
For AWS API Gateway is for api and websocket, lambda for code and dynamo db for table persistence

### Plugin

A reveal.js plugin that will be embedded in the presentation, will show the QR code and send page change notifications

### User client

A custom web application created for each presentation used by the audience to interact

### Optional host client

A presentation remote control web application used by the host to navigate in the presentation and change session's state
