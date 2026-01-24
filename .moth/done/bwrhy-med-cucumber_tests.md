# Cucumber Tests

Create a suite of Cucumber E2E tests covering each API endpoint.

## Specification

- **Target URL:** Configurable via environment variable `BASE_URL` or default to `http://localhost:3000`.
- **Coverage:**
    - `POST /api/v1/session/new/{token}`
    - `POST /api/v1/session/{token}/login`
    - `POST /api/v1/session/{token}/user/{uid}/react/{page}/{reaction}`
    - `POST /api/v1/session/{token}/state/{page}/{state}`
    - `GET /api/v1/session/{token}/state`
- **Independence:** The tests should not assume a specific backend implementation (Docker vs Cloudflare).
- **Tooling:** Use `cucumber-js` with `ts-node` for TypeScript support. Use native `fetch` for HTTP requests.
- **Automation:** A `test:e2e` command in the infrastructure package should automate deployment, testing, and cleanup.

## Decisions

- **Accepted:** Using a temporary key pair for test token generation.
  - *Reason:* Ensures tests are self-contained and can run in any environment where they can generate a key pair.
- **Accepted:** Using native `fetch` API for HTTP requests.
  - *Reason:* Built-in to Node.js 18+, reduces dependencies, and is standard for modern JavaScript/TypeScript development.
- **Accepted:** Adding a `test:e2e` script in `infra-docker`.
  - *Reason:* Simplifies the developer workflow and ensures consistent testing environments by automating the full lifecycle of the infrastructure.

## Implementation Details

- **Package Structure:** Created `@revint/e2e-tests` in `api/packages/e2e-tests`.
- **Token Generation:** Implemented a utility to generate and sign session tokens using Node.js `crypto` module.
- **Step Definitions:** Steps maintain state (tokens, host UID, user UID) across the scenario execution.
- **State Management:** Differentiated between `hostUid` and `userUid` to correctly test authorization for host-only actions like `setState`.
- **Infrastructure Automation:** 
    - Created `scripts/e2e-test.sh` in `infra-docker` which uses `trap` to ensure `npm run destroy` is always called.
    - Added a 10-second sleep after deployment to allow containers and internal networking to stabilize before running tests.
    - Added `"test:e2e": "./scripts/e2e-test.sh"` to `infra-docker/package.json`.
