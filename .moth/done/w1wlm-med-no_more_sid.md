# No More Sid

Session ID (`sid`) is replaced by the session token itself as the primary identifier for all session-related data and operations. This allows for session reconnection and simplifies the architecture by removing the need for a separate mapping between tokens and session IDs.

## Specification

- Every API and WebSocket route that previously used `sid` now uses `token`.
- The `token` is a signed string containing session metadata (name, date).
- Every API function must verify the token's signature using the configured public key before proceeding.
- The `token` is used as the key in the datastore for sessions, hosts, users, and reactions.
- The `login` function is updated to require the `token` as an argument to establish a session context.
- Cookies now store `token` instead of `sid`.
- The datastore schema must support long strings for keys to accommodate full tokens.

## Decisions

- **Rejected:** Keeping a short `sid` and mapping it to the `token` in a lookup table.
  - *Reason:* This adds complexity and a potential point of failure. Using the token directly as the identifier is more robust and naturally supports statelessness where possible.
- **Accepted:** Using the raw token as the key in PostgreSQL.
  - *Reason:* Simple and direct. PostgreSQL `TEXT` columns can easily handle the token length.
- **Accepted:** Mandatory token verification in all functions.
  - *Reason:* Ensures security and consistency. If a token is invalid or expired, the request is rejected immediately.

## Implementation Details

The transition involved a systematic replacement of `sid` with `token` across the architecture, API definitions, and infrastructure layers.
- **Type Definitions:** Updated all core interfaces (`Session`, `Host`, `User`, `Reaction`) to use `token` instead of `sid`.
- **Architecture Logic:** Removed the `tokenToSid` hashing utility. Modified API functions to accept and verify the token at the beginning of their execution. Updated `ctx.setCookie` calls to use the `token` name.
- **API Routing:** Refactored REST routes to include `{token}` in the path where `{sid}` was previously used. Added `{token}` to the `login` route.
- **Infrastructure:**
    - **Datastore:** Updated the PostgreSQL schema to use `TEXT` for the `key` column to handle the increased length of session tokens.
    - **WebSocket:** Updated the connection registry and broadcast logic to track connections by `token`.
- **Documentation:** Updated `IDEA.md`, `README.md`, and deployment stack outputs to reflect the new API structure.