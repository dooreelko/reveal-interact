# Reveal-Interact API

Real-time audience feedback API for presentations. Allows audience members to send reactions and receive state updates during a presentation session.

## Architecture

The API is built using `@arinoto/cdk-arch` which separates architecture definitions from infrastructure implementations. This allows the same business logic to run on different platforms.

### Packages

- **@revint/arch** - Architecture definitions (types, API functions, data stores)
- **@revint/core** - Shared types and interfaces
- **@revint/infra-docker** - Local Docker deployment using PostgreSQL
- **@revint/infra-cloudflare** - Cloudflare Workers deployment (planned)

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/session/new/{token}` | Create new session (host only) |
| POST | `/api/v1/login` | Get/create user ID for session |
| POST | `/api/v1/session/{token}/user/{uid}/react/{page}/{reaction}` | Send a reaction |
| POST | `/api/v1/session/{token}/state/{page}/{state}` | Update session state (host only) |
| GET | `/api/v1/session/{sid}/state` | Get current session state |

### WebSocket Endpoints

| Path | Description |
|------|-------------|
| `/ws/v1/session/{token}/host/{uid}/pipe` | Host connection for sending state updates |
| `/ws/v1/session/{token}/user/{uid}/pipe` | User connection for receiving broadcasts |

## Token Generation

Tokens are used to authenticate sessions. A token consists of a signed payload containing session information.

### Token Format

```
base64url(payload).base64url(signature)
```

- **Payload**: JSON object `{ "name": "Session Name", "date": "2024-01-15" }`
- **Signature**: SHA256 signature of the payload, created with host's private key

### Generating Keys

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem
```

### Generating a Token (Node.js)

```javascript
const crypto = require('crypto');
const fs = require('fs');

const privateKey = fs.readFileSync('private.pem', 'utf-8');

const payload = JSON.stringify({
  name: "My Presentation",
  date: new Date().toISOString().split('T')[0]
});

const payloadB64 = Buffer.from(payload).toString('base64url');

const signer = crypto.createSign('SHA256');
signer.update(payload);
const signature = signer.sign(privateKey);
const signatureB64 = signature.toString('base64url');

const token = `${payloadB64}.${signatureB64}`;
console.log('Token:', token);
```

### Generating a Token (Bash)

```bash
# Create payload
PAYLOAD='{"name":"My Presentation","date":"2024-01-15"}'
PAYLOAD_B64=$(echo -n "$PAYLOAD" | base64 -w0 | tr '+/' '-_' | tr -d '=')

# Sign payload
SIGNATURE_B64=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -sign private.pem | base64 -w0 | tr '+/' '-_' | tr -d '=')

# Combine
TOKEN="${PAYLOAD_B64}.${SIGNATURE_B64}"
echo "Token: $TOKEN"
```

## Local Docker Deployment

### Prerequisites

- Node.js 20+
- Docker or Podman
- Terraform (installed automatically by cdktf)

### Setup

```bash
cd api
npm install
```

### Configuration

Use the `create-session.sh` script to generate keys and a session token:

```bash
cd packages/infra-docker
./scripts/create-session.sh "My Awesome Presentation"
```

This will:
1. Generate RSA key pair in `.keys/` (if not exists)
2. Create a signed session token
3. Write the public key to `.env` for the Docker deployment

The token will be displayed in the output - save it for use with the API.

Alternatively, set `PUBLIC_KEY` manually:

```bash
export PUBLIC_KEY=$(cat public.pem)
```

### Build

```bash
# Build all packages
npm run build

# Build Docker bundles
cd packages/infra-docker
npm run build:docker
```

### Deploy

```bash
cd packages/infra-docker

# Deploy containers
npm run deploy

# View outputs
cdktf output
```

This starts 4 containers:
- **revint-postgres** - PostgreSQL database (internal port 5432)
- **revint-datastore** - Data store service (internal port 3001)
- **revint-api** - REST API (exposed on port 3000)
- **revint-ws** - WebSocket server (exposed on port 3002)

### Test

```bash
# Create a new session
curl -X POST http://localhost:3000/api/v1/session/new/$TOKEN

# Get session state
curl http://localhost:3000/api/v1/session/{sid}/state

# Login (get user ID)
curl -X POST http://localhost:3000/api/v1/login -c cookies.txt -b cookies.txt

# Send a reaction
curl -X POST http://localhost:3000/api/v1/session/$TOKEN/user/{uid}/react/1/thumbsup

# Update state (host only)
curl -X POST http://localhost:3000/api/v1/session/$TOKEN/state/2/voting-open \
  -b cookies.txt
```

### Teardown

```bash
cd packages/infra-docker
npm run destroy
```

## Development

### Project Structure

```
api/
├── package.json          # Lerna monorepo root
├── lerna.json
├── tsconfig.json         # Base TypeScript config
└── packages/
    ├── arch/             # Architecture definitions
    ├── core/             # Shared types
    ├── infra-docker/     # Docker deployment
    └── infra-cloudflare/ # Cloudflare deployment (planned)
```

### Building

```bash
# Build all packages
npm run build

# Build specific package
cd packages/arch && npm run build
```

### Adding a New Implementation

1. Create a new package under `packages/`
2. Import architecture from `@revint/arch`
3. Overload data store functions with your storage implementation
4. Create server that uses `DockerApiServer` pattern or equivalent
5. Deploy using your platform's infrastructure tools
