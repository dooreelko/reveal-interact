cloudflare implementation should
- use separate worker for each api container
- each worker must import architecture and use architectureBinding with overloads (see https://github.com/dooreelko/cdk-arch/blob/main/packages/example/cloudflare/scripts/bundle-workers.js on how to solve cloudflare building)

## Decisions

### Worker Architecture
- **5 separate workers**: api-worker, session-store-worker, host-store-worker, user-store-worker, reaction-store-worker
- Matches docker pattern with separate services for each store
- API worker communicates with store workers via Cloudflare Service Bindings

### Node.js Compatibility
- Use `nodejs_compat` compatibility flag for all workers
- Allows importing `@revint/arch` with Node.js crypto module
- No need to duplicate types or logic in workers - they import directly from architecture

### CDKTF Resources
- Use `Worker` + `WorkerVersion` + `WorkersDeployment` pattern (not deprecated `WorkersScript`)
- Worker → WorkerVersion (with bindings, content, compatibilityFlags) → WorkersDeployment
- Matches cdk-arch example pattern

### Binding Pattern
- Each worker imports architecture and uses `architectureBinding.bind()` with overloads
- Store workers: overload store/get/getAll with KV implementations
- API worker: overload with service binding handlers that proxy to store workers

### Rejected Alternatives
- Keep standalone worker: rejected per task requirement to use architecture binding
- Use WorkersScript: deprecated in favor of Worker+WorkerVersion+WorkersDeployment pattern

### ESM Module Support
- Package uses `"type": "module"` for ESM
- Uses `tsx` instead of `ts-node` for CDKTF synthesis (better ESM support)
- `@chialab/esbuild-plugin-commonjs` handles CommonJS dependencies during bundling

## Implementation Details
- Bundle script (ESM) creates 5 separate worker bundles from TypeScript entrypoints
- Each store entrypoint binds its storeApi with KV implementations using `architectureBinding.bind()`
- API entrypoint binds each storeApi with `serviceBindingHandler` that proxies requests to store workers
- `createWorkerHandler()` creates Cloudflare fetch handlers from ApiContainer route definitions
- Infrastructure creates 5 workers with proper dependency ordering (stores→api for service bindings)
- Workers bundled with `external: ["crypto"]` - provided by `nodejs_compat` at runtime

## File Structure
```
api/packages/infra-cloudflare/
├── package.json                          # type: module, tsx dev dep
├── cdktf.json                            # Uses npx tsx for synthesis
├── scripts/
│   └── bundle-workers.js                 # ESM bundle script for 5 workers
└── src/
    ├── index.ts                          # Exports CloudflareStack
    ├── main.ts                           # CDKTF app entry point
    ├── stack.ts                          # Worker+WorkerVersion+WorkersDeployment pattern
    ├── cloudflare-worker-handler.ts      # Creates fetch handlers from ApiContainer
    ├── service-binding-handler.ts        # Service binding proxy handlers
    └── entrypoints/
        ├── api-worker.ts                 # Main API, uses service bindings to stores
        ├── session-store-worker.ts       # SESSION_KV binding
        ├── host-store-worker.ts          # HOST_KV binding
        ├── user-store-worker.ts          # USER_KV binding
        └── reaction-store-worker.ts      # REACTION_KV binding
```

## Usage
- `npm run build` - compile TypeScript
- `npm run build:workers` - build + bundle all 5 workers
- `npm run synth` - synthesize terraform
- `npm run deploy` - build workers and deploy to Cloudflare
- `npm run destroy` - tear down resources
- `npm run test:e2e` - deploy, run e2e tests, destroy

## Architecture Design (per lmfj6 spec)
The architecture uses `{sessionUid}` in URL paths with `x-session-token` header for authentication:

### Routes
- `POST /api/v1/session/new` - create session (token in header, body: `{apiUrl, webUiUrl, wsUrl?}`)
- `GET /api/v1/session/{sessionUid}` - public session lookup (no auth)
- `POST /api/v1/session/{sessionUid}/login` - user login (token in header)
- `POST /api/v1/session/{sessionUid}/user/{uid}/react/{page}/{reaction}` - send reaction
- `POST /api/v1/session/{sessionUid}/state/{page}/{state}` - set state (host only)
- `GET /api/v1/session/{sessionUid}/state` - get state

### Session Fields
- `token`, `page`, `state`, `uid` (public session id), `apiUrl`, `webUiUrl`, `wsUrl?`

### NewSessionResponse
- `{token, hostUid, sessionUid}`

## E2E Tests
- Updated to use `x-session-token` header for authentication
- Use `sessionUid` in URL paths
- Send `uid` cookie for authenticated endpoints (react, setState, getState)

