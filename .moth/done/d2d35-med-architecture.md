create the architecture definitions

## Decisions

### Package Structure
- **New package `@revint/arch`** - dedicated package for cdk-arch architecture definitions
- Follows cdk-arch example pattern (separate architecture package from implementations)

### Architecture Components
- **ApiContainer** for REST API endpoints
- **WsContainer** for WebSocket connections (separate construct, not routes in ApiContainer)

### Data Stores (modeled as DataStore constructs)
- `sessionStore` - session state (sid, page, state)
- `hostStore` - hosts (sid, uid)
- `userStore` - users (sid, uid)
- `reactionStore` - reactions (time, sid, uid, page, reaction)

### REST API Endpoints (from IDEA.md)
- `POST /api/v1/session/new/{token}` - create new session (validates token with public key)
- `POST /api/v1/login` - set user ID for session (sets cookie)
- `POST /api/v1/session/{token}/user/{uid}/react/{page}/{reaction}` - send reaction
- `POST /api/v1/session/{token}/state/{page}/{state}` - host notifies state change (broadcasts to users)
- `GET /api/v1/session/{sid}/state` - get current session state

### WebSocket Endpoints
- `/ws/v1/session/{token}/host/{uid}/pipe` - host connection
- `/ws/v1/session/{token}/user/{uid}/pipe` - user connection

### Request Context
- All API functions accept `RequestContext` as last argument
- Context includes: headers, cookies, ip, env, setCookie()
- `env` provides access to environment variables (e.g., PUBLIC_KEY)

### Token Format
- Format: `base64url(payload).base64url(signature)`
- Payload: JSON `{ name: string, date: string }`
- Signature: SHA256 signed with host's private key, verified with PUBLIC_KEY
- PUBLIC_KEY environment variable is required (error if missing)

### Rejected Alternatives
- Adding architecture to @revint/core - rejected for separation of concerns
- WebSocket as ApiContainer routes - rejected, dedicated WsContainer better models the different nature of WebSocket connections
- TBDFunction for API functions - rejected, functions are fully implemented in architecture using stores

## Implementation Details
- Uses @arinoto/cdk-arch primitives (Architecture, ApiContainer, Function)
- Custom DataStore construct with generic type parameter for typed document storage
- Custom WsContainer construct for WebSocket routes with onConnect/onMessage/onDisconnect handlers
- API functions fully implemented using Function (not TBDFunction), use data stores directly
- Data store operations are TBDFunction, overloaded by infrastructure implementations
- Token verification using Node.js crypto module
- Session ID derived deterministically from token content via SHA256 hash
- Host authorization check in setStateFunction (verifies uid cookie against hostStore)

## File Structure
```
api/packages/arch/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts          # Re-exports all types and components
    ├── types.ts          # Domain types (Session, Host, User, Reaction, RequestContext, etc.)
    ├── data-store.ts     # Generic DataStore<TDoc> construct
    ├── ws-container.ts   # WsContainer with WebSocket route management
    └── architecture.ts   # Main architecture definition with all components
```

## Exports
- Types: SessionToken, Session, Host, User, Reaction, NewSessionResponse, LoginResponse, StateChangeMessage, RequestContext, CookieOptions, EnvConfig
- Constructs: DataStore, WsContainer
- Architecture: arch, api, ws
- Data stores: sessionStore, hostStore, userStore, reactionStore
- Functions: newSessionFunction, loginFunction, reactFunction, setStateFunction, getStateFunction
- WebSocket routes: hostPipe, userPipe
- Utilities: verifyToken, tokenToSid
