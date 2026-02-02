for the plugin, add a js script under scripts/ that imports api from arch, binds them and is used by the e2e-test.sh instead of direct curl calls

## Specification

### Goal
Replace direct `curl` calls in the plugin's e2e-test.sh with a Node.js script that uses `createHttpBindings` from `@arinoto/cdk-arch` for type-safe API testing.

### Overview
The current e2e-test.sh uses `curl` commands with manually constructed URLs. These URLs are outdated (e.g., using `/api/v1/session/new/{token}` instead of the current header-based auth pattern). A Node.js test script using `createHttpBindings` will:
- Use the same route definitions as the production code
- Have type-safe API calls
- Be consistent with the architecture
- Be easier to maintain as API changes

### Tests to Migrate
Current curl-based tests that need to migrate to Node.js:
- Test 2: Create session via API (POST /api/v1/session/new)
- Test 3: Set state (POST /api/v1/session/{sessionUid}/state/{page}/{state})
- Test 4: Get state (GET /api/v1/session/{sessionUid}/state)

Tests that remain as shell commands (non-API):
- Test 1: Verify example server is running (curl localhost:port)
- Test 5: Verify plugin JS loads
- Test 6: Verify example page loads

### API Routes Used
Same as the plugin's production code:
- `newSession`: `POST /api/v1/session/new` - Creates session, receives sessionUid/hostUid
- `setState`: `POST /api/v1/session/{sessionUid}/state/{page}/{state}` - Updates session state
- `getState`: `GET /api/v1/session/{sessionUid}/state` - Get current state

### Token Generation
The script needs to generate valid session tokens using the private key, similar to what the existing e2e-tests package does.

## Decisions

### Script Location
- **Accepted:** `plugin/scripts/api-tests.js`
- **Reason:** Under plugin/scripts/ as specified, alongside existing e2e-test.sh

### Script Language
- **Accepted:** JavaScript (CommonJS)
- **Reason:** Simpler for a test script, no compilation needed, runs directly with Node.js

### Token Handling
- **Accepted:** Script receives token via command-line argument
- **Reason:** Simpler than embedding token generation; e2e-test.sh already has generate-token.sh

### Exit Codes
- **Accepted:** Script exits with 0 on success, non-zero on failure
- **Reason:** Standard Unix convention for test scripts

### Cookie Handling
- **Accepted:** Script uses fetch with cookie jar simulation (set cookies from response, send in subsequent requests)
- **Reason:** Required for session authentication pattern

## Implementation Details

- Create `plugin/scripts/api-tests.js` that:
  1. Accepts command-line args: API_URL, TOKEN
  2. Imports api from @revint/arch and uses createHttpBindings
  3. Creates auth fetcher with token header and cookie management
  4. Runs test sequence: newSession -> setState -> getState
  5. Logs test results and exits with appropriate code

- Update `plugin/scripts/e2e-test.sh` to:
  1. Call api-tests.js instead of direct curl commands
  2. Pass HOST_TOKEN and API_URL as arguments

## Implementation Summary

### Structure
Replaced simple Node.js script with full Cucumber test suite:

```
plugin/
├── e2e-tests/
│   ├── package.json           # Cucumber dependencies
│   ├── cucumber.js            # Cucumber configuration
│   ├── tsconfig.json          # TypeScript config
│   └── features/
│       ├── plugin-api.feature # Gherkin scenarios
│       └── step_definitions/
│           └── steps.ts       # Step implementations using createHttpBindings
└── scripts/
    └── e2e-test.sh            # Environment setup script
```

### Files Created
- `plugin/e2e-tests/package.json` - Dependencies: @cucumber/cucumber, @arinoto/cdk-arch, @revint/arch
- `plugin/e2e-tests/cucumber.js` - Cucumber config with ts-node
- `plugin/e2e-tests/tsconfig.json` - TypeScript config for tests
- `plugin/e2e-tests/features/plugin-api.feature` - 5 Gherkin scenarios
- `plugin/e2e-tests/features/step_definitions/steps.ts` - Step implementations using createHttpBindings

### Files Modified
- `plugin/scripts/e2e-test.sh` - Now sets up environment and runs Cucumber tests
- `package.json` (root) - Added plugin/e2e-tests to workspaces

### Files Removed
- `plugin/scripts/api-tests.js` - Replaced by Cucumber test suite

### Test Scenarios (5 passed)
1. Create a new session
2. Set session state
3. Get session state
4. Plugin JS is available
5. Example page loads

### Total: 5 scenarios, 26 steps (all passed)

## Additional Changes: Two-Token Authentication

### Overview
The system now uses two separate tokens:
- **Host Token**: Used by presentation hosts for authentication (newSession, setState)
- **User Token**: Used by audience members for authentication (login, react, getState)

### Types Updated (`api/packages/arch/src/types.ts`)
- `Session`: Added `userToken` field
- `CreateSessionRequest`: Added `userToken` field
- `GetSessionResponse`: Changed `token` to `userToken`

### Architecture Updated (`api/packages/arch/src/architecture.ts`)
- `getVerifiedSessionAsHost`: Verifies host token
- `getVerifiedSessionAsUser`: Verifies user token
- `newSessionFunction`: Now requires userToken in body, stores both tokens
- `loginFunction`: Uses user token for authentication
- `reactFunction`: Uses user token for authentication
- `setStateFunction`: Uses host token for authentication
- `getStateFunction`: Supports both host and user tokens
- `getSessionFunction`: Returns userToken for audience lookup

### Plugin Updated (`plugin/src/index.ts`)
- `RevealInteractConfig`: Added `userToken` field
- Plugin now requires both `hostToken` and `userToken` configuration

### E2E Tests Updated
- Shell script generates both HOST_TOKEN and USER_TOKEN
- Cucumber steps use appropriate tokens for each operation
- API e2e-tests also updated for two-token pattern
