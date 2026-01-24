split datastore into individual services and use them directly. correspondingly deploy them separately.

## Decisions

### Architecture Change
- **Split unified `datastoreApi` into 4 separate ApiContainers**: `sessionStoreApi`, `hostStoreApi`, `userStoreApi`, `reactionStoreApi`
- Each store has its own container with its own port
- API server connects directly to each store's service

### Database Strategy
- **Shared PostgreSQL** - all 4 stores share one PostgreSQL instance
- Each store uses a separate table (already implemented with `store` column)

### Container Ports
- PostgreSQL: 5432 (internal only)
- Session Store: 3011 (internal only)
- Host Store: 3012 (internal only)
- User Store: 3013 (internal only)
- Reaction Store: 3014 (internal only)
- API: 3000 (exposed)
- WebSocket: 3002 (exposed)

### Rejected Alternatives
- Separate PostgreSQL per store - rejected for simplicity, shared DB is sufficient for this scale
- Keep unified datastore - rejected per task requirement to split

## Implementation Details
- Each store ApiContainer has simplified route names: `store`, `get`, `getAll` (path prefix removed)
- Each store server uses same PostgreSQL connection, differentiated by STORE_NAME constant
- API server uses environment variables for each store endpoint (SESSION_STORE_HOST, etc.)
- Old unified datastore-server.ts removed
- All 4 store containers share same Docker image, different entrypoint commands
