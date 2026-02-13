docker api should support CORS

## Specification

### Goal
Add CORS (Cross-Origin Resource Sharing) support to the Docker infrastructure's API server so that browser-based clients (plugin, web app) can make cross-origin requests to the API.

### Context
The Cloudflare infrastructure already supports CORS in `cloudflare-worker-handler.ts`. The Docker infrastructure's `DockerApiServer` (Express-based) currently does not set any CORS headers, causing browser requests from different origins to fail.

The plugin (reveal.js) and the web app run on different origins than the Docker API server (e.g., presentation on `localhost:8000`, API on `localhost:3000`), so CORS is required for:
- All API routes (GET, POST, etc.)
- Preflight OPTIONS requests
- The `x-session-token` custom header
- Credentials (cookies) for session management

### CORS Headers
- `Access-Control-Allow-Origin: <request Origin header>` (echoes back the requesting origin; omitted if no Origin header present)
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, x-session-token, Cookie`
- `Access-Control-Allow-Credentials: true`

### Scope
- Only the Docker API server (`DockerApiServer`) needs CORS
- WebSocket server does not need CORS (WebSocket upgrade is not subject to CORS)
- Datastore servers are internal-only (not exposed) and don't need CORS

## Decisions

### Approach
- **Accepted:** Add CORS middleware directly in `DockerApiServer.createApp()` as Express middleware
- **Reason:** Simple, self-contained, no external dependencies. Consistent with how Cloudflare handles it (inline headers on every response + OPTIONS preflight handling)
- **Rejected:** Using `cors` npm package - adds unnecessary dependency for a few header lines

### Origin Handling
- **Accepted:** Echo back the request's `Origin` header instead of `*`
- **Reason:** Browsers reject `Access-Control-Allow-Origin: *` when `credentials: "include"` is used in fetch. Echoing the origin is required for credentialed cross-origin requests. Header is omitted when no Origin is present (same-origin requests).
- **Rejected:** Wildcard `*` - incompatible with `Access-Control-Allow-Credentials: true` per the CORS spec
- **Note:** Cloudflare implementation still uses `*` — may need updating separately

## Implementation Details
- Add Express middleware in `DockerApiServer.createApp()` that sets CORS headers on every response and handles OPTIONS preflight requests with 204 status
- The middleware runs before route handlers so all responses include CORS headers (including error responses)
