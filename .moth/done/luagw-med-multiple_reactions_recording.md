same user should be able to submit multiple reactions for the same session and page.
this means we need to update DataStore to introduce indices for filtering.
it should have a new generic argument for the index keys type, defaulting to never,
and the implementations will decide how to use them - PostgreSQL filters on JSONB fields,
Cloudflare KV iterates and filters in memory, DynamoDB could use GSIs, etc.

finally there's a commented unit test for that case that can be enabled

## Specification

### Goal
Allow multiple reactions from the same user on the same session and page. Each reaction gets a unique identifier. Enable querying reactions by indexed fields (sessionUid, page, uid).

### DataStore Design
- **Generic type**: `DataStore<TDoc, TIndices extends keyof TDoc = never>`
- **Constructor options**: `{ indices?: TIndices[] }` - fields that can be used for filtering
- **Key type** (depends on indices):
  - Without indices: `string` (simple unique ID)
  - With indices: `Pick<TDoc, TIndices> & { id: string }` (all index fields + unique id)
- **Methods**:
  - `store(key: StoreKey, doc: TDoc)` - store document with key
  - `get(key: StoreKey): TDoc[]` - get by key
  - `list(filters?: Partial<Pick<TDoc, TIndices>>): TDoc[]` - list with optional filters

### Route Changes
- Removed: `GET /store` (getAll)
- Changed: `POST /store/list` with filters in body (was GET with prefix in path)

### Reaction Type Change
- Added `sessionUid: string` field to Reaction type (needed for filtering)

### Changes Required

#### 1. DataStore (data-store.ts)
- Add `TIndices` generic parameter defaulting to `never`
- Constructor takes optional `{ indices: TIndices[] }`
- Remove `getAll` method and route
- Change `list` route to `POST /store/list`
- `list()` takes optional `Partial<Pick<TDoc, TIndices>>`

#### 2. types.ts
- Add `sessionUid: string` to Reaction interface
- Remove ShardedKey interface

#### 3. Architecture (architecture.ts)
- Create reactionStore with indices: `["sessionUid", "page", "uid"]`
- Update reactFunction to:
  - Generate unique reactionId: `${timestamp}-${generateId()}`
  - Include sessionUid in the reaction document
  - Store with simple string key

#### 4. In-Memory Mock (test/setup.ts)
- Update `list()` to accept optional filters object
- Filter documents by matching all filter field values

#### 5. PostgreSQL Implementation
- `list()` builds WHERE clause with JSONB field conditions
- Uses parameterized queries for filter values

#### 6. Cloudflare KV Implementation
- Storage key format: `index1:index2:...:uniqueKey` (e.g., `sessionUid:page:uid:reactionId`)
- `store()` uses `buildStorageKey()` to construct compound key from doc values
- `list()` uses `buildListPrefix()` to construct prefix from consecutive filters
- KV.list({ prefix }) efficiently filters by prefix
- Throws error if filters can't be fully satisfied by prefix (no in-memory fallback)
- Non-indexed stores just return all documents in `list()`

#### 7. Validation
- DataStore.list() throws error if filters provided but no indices defined
- Cloudflare KV throws if non-consecutive index filters provided

#### 8. API Server (api-server.ts)
- Route bindings changed from `getAll` to `list`

#### 9. HTTP Handler Fix (cdk-arch)
- Fixed to send all remaining args: `args.slice(pathParams.length)` instead of `args[pathParams.length]`
- docker-api-server spreads array bodies for multi-argument routes
- cloudflare-worker-handler spreads array bodies for multi-argument routes

## Decisions

### Key design
- **Accepted**: Simple unique string ID (`${timestamp}-${randomId}`)
- **Reason**: Clean separation - key is for identity, indices are for querying
- **Rejected**: ShardedKey with combined key - conflated identity with indexing

### Index specification
- **Accepted**: Generic type parameter `TIndices extends keyof TDoc`
- **Reason**: Type-safe, only allows filtering on declared indexed fields
- **Rejected**: Any string field - no type safety

### List method signature
- **Accepted**: `list(filters?: Partial<Pick<TDoc, TIndices>>)`
- **Reason**: Type-safe partial filters on indexed fields only
- **Rejected**: Prefix-based listing - less flexible, tied to key structure

### Naming
- **Accepted**: "indices" for filterable fields
- **Reason**: Standard database terminology
- **Rejected**: "shards" - implies partitioning which isn't the goal

## Implementation Details
- DataStore exports `IndexedKey<TDoc, TIndices>` and `StoreKey<TDoc, TIndices>` types
- DataStore.indices stores the configured index field names (order matters for prefix-based backends)
- PostgreSQL: extracts `id` from key for storage, filters using JSONB `data->>'field' = $n` queries
- Cloudflare KV:
  - Helper functions in `infra-cloudflare/src/kv-helpers.ts`:
    - `INDEX_SEPARATOR = ":"` - separator for compound keys
    - `buildStorageKey(key, indices)` - builds `index1:index2:...:id` from IndexedKey
    - `buildListPrefix(filters, indices)` - builds prefix from consecutive filter values
  - Stores with compound key, uses KV.list({ prefix }) for efficient filtering
  - get() can construct exact storage key since IndexedKey contains all index values
- reactFunction stores with key `{ id, sessionUid, page, uid }`
- Test uses `list({ sessionUid, page, uid })` to verify multiple reactions
- Routes: `POST /store`, `POST /store/get`, `POST /store/list` (all use body for key/filters)
