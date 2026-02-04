create a unit test test suite for api/packages/arch. for mocks use Function overriding.
points of concern are
- some actions can be performed only with the host token
- no actions except the public getSession can be performed without either session or host tokens
- no actions could be performed against a non-existent session

each Function in the architecture must have at least two unit tests - one for expected success scenario, one for failure

## Specification

### Goal
Create unit tests for all API functions in `api/packages/arch` that test authorization, authentication, and business logic without requiring infrastructure.

### Functions to Test
1. **newSessionFunction** - Creates a new session (host only)
2. **loginFunction** - User login to session (user token required)
3. **reactFunction** - Send reaction (user token + uid cookie required)
4. **setStateFunction** - Update session state (host token + host uid cookie required)
5. **getStateFunction** - Get session state (logged in user or host)
6. **getSessionFunction** - Public session lookup (no auth)

### Test Categories per Function
Each function must have at least:
- Success scenario test
- Failure scenario test (missing auth, invalid token, non-existent session, etc.)

### Mocking Strategy
- Use `architectureBinding.bind()` for data store mocking (same pattern as production infrastructure)
- Create in-memory stores that track calls and return controlled data
- Generate real RSA key pair for token signing/verification in tests
- Use `createMockBinding()` to create typed clients that call functions via `invokeWithRuntimeContext`
- Tests use the same client interface as production code (`client.newSession()`, `client.login()`, etc.)

### Test Framework
- Use Node.js built-in `node:test` module (no external dependencies)
- Use `node:assert` for assertions

## Decisions

### Test Framework Choice
- **Accepted:** Use `node:test` and `node:assert` (built-in Node.js test runner)
- **Reason:** No additional dependencies, works well with TypeScript via ts-node
- **Rejected:** Jest, Vitest - would add external dependencies

### Token Generation in Tests
- **Accepted:** Generate real RSA key pair in test setup
- **Reason:** Tests real crypto verification path, same as production

### Store Mocking
- **Accepted:** Use in-memory Map-based stores via `TBDFunction.overload()`
- **Reason:** Follows cdk-arch pattern, allows verification of store operations

## Implementation Details

### Test File Structure
```
api/packages/arch/
├── src/
│   └── ...existing files...
└── test/
    ├── setup.ts           # Key generation, store mocks, context helpers
    └── architecture.test.ts  # All function tests
```

### Setup Helpers
- `generateTestKeyPair()` - RSA key pair for token signing
- `generateToken(name, date, privateKey)` - Create signed tokens
- `createMockContext(options)` - Create RequestContext with headers, cookies, env
- `setupInMemoryStores()` - Bind store APIs via `architectureBinding.bind()` with in-memory implementations
- `createMockBinding(container, routeNames, contextProvider)` - Create typed client that invokes functions with runtime context (same interface as `createHttpBindings`)

### Package Changes
- Add `test` script to package.json: `node --import tsx --test test/*.test.ts`
- Add `tsx` as devDependency for TypeScript execution

## Test Coverage Summary

| Function | Success Tests | Failure Tests |
|----------|---------------|---------------|
| newSessionFunction | 1 (valid host token) | 3 (no header, invalid token, invalid user token) |
| getSessionFunction | 1 (existing session) | 1 (non-existent session) |
| loginFunction | 2 (new user, reuse uid) | 3 (no token, wrong token type, no session) |
| reactFunction | 1 (logged-in user) | 4 (no auth, uid mismatch, unregistered, no session) |
| setStateFunction | 1 (host updates) | 4 (no token, wrong token, wrong uid, no session) |
| getStateFunction | 2 (host, user) | 4 (not logged in, no token, no session, unregistered) |

**Total: 27 tests (8 success, 19 failure scenarios)**
