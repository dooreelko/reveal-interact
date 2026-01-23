implement local docker version of the architecture

## Decisions

### Storage
- **PostgreSQL** with postgres:16-alpine container
- Consistent with cdk-arch example pattern
- Uses pg client library for Node.js

### Package Scope
- **All-in-one** - infra-docker includes both:
  - CDKTF terraform stack definitions
  - Runtime server code (entrypoints, Dockerfile, build scripts)

### Container Architecture
- **Network**: isolated Docker network for service communication
- **Containers**:
  - `postgres` - PostgreSQL database for data storage
  - `datastore` - DataStore server exposing REST API for all 4 stores
  - `api` - Main API server with REST endpoints
  - `ws` - WebSocket server for host/user pipes

### Rejected Alternatives
- SQLite/in-memory storage - rejected for production-like behavior with PostgreSQL
- Separate runtime package - rejected for simplicity, all-in-one approach
- Single monolith container - rejected for separation of concerns

## Implementation Details
- Uses Docker provider for CDKTF with podman socket support
- Entrypoint servers use Express for HTTP, ws library for WebSocket
- DockerApiServer pattern from cdk-arch for route handling
- httpHandler pattern for inter-service communication
- PostgreSQL stores documents as JSONB with collection-based organization
- esbuild bundles TypeScript to JavaScript for container deployment

## File Structure
```
api/packages/infra-docker/
├── package.json
├── tsconfig.json
├── cdktf.json
├── scripts/
│   └── bundle.js           # esbuild bundler for entrypoints
└── src/
    ├── index.ts            # Exports stack and helpers
    ├── main.ts             # CDKTF app entry point
    ├── stack.ts            # LocalDockerStack terraform definition
    ├── docker-api-server.ts # Express server from ApiContainer routes
    ├── http-handler.ts     # HTTP client for inter-service calls
    ├── Dockerfile          # Container image definition
    └── entrypoints/
        ├── api-server.ts       # REST API server
        ├── datastore-server.ts # PostgreSQL-backed data store
        └── ws-server.ts        # WebSocket server for host/user pipes
```

## Container Ports
- PostgreSQL: 5432 (internal only)
- Datastore: 3001 (internal only)
- API: 3000 (exposed)
- WebSocket: 3002 (exposed)

## Usage
- `npm run build` - compile TypeScript
- `npm run build:docker` - build + bundle for containers
- `npm run synth` - synthesize terraform
- `npm run deploy` - build and deploy containers
- `npm run destroy` - tear down containers
