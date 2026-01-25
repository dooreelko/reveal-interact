implement cloudflare version of the architecture

## Decisions

### Infrastructure Management
- **CDKTF** with @cdktf/provider-cloudflare for consistency with docker approach
- Terraform state managed locally

### Storage Strategy
- **Separate KV namespaces** for each data store: session-kv, host-kv, user-kv, reaction-kv
- Consistent with split datastore pattern from docker implementation

### WebSocket Strategy
- **Deferred** - REST API only for initial implementation
- Durable Objects for WebSocket would require wrangler or manual configuration
- CDKTF Cloudflare provider doesn't support Durable Object resources directly
- Can be added later with wrangler.toml configuration

### Worker Architecture
- Single Worker handles all API routes (unlike docker which has separate services)
- KV bindings directly in the main worker
- No separate store workers needed (KV accessed directly)

### Rejected Alternatives
- Wrangler CLI - rejected for consistency with CDKTF approach
- Single KV with prefixes - rejected for cleaner separation matching docker pattern
- Multiple Workers - rejected, single Worker simpler for Cloudflare serverless model

## Implementation Details
- Single Worker handles all API routes via fetch handler
- Worker is standalone - doesn't import constructs or cdk-arch to avoid Node.js dependencies
- Uses Web Crypto API for RSA signature verification (crypto.subtle)
- KV store functions directly call KV namespace methods (no HTTP calls like docker)
- CDKTF stack creates: WorkersScript, WorkersScriptSubdomain, 4 WorkersKvNamespace resources
- WorkersScriptSubdomain enables the workers.dev subdomain via Terraform
- Configuration: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_WORKERS_SUBDOMAIN from .env, PUBLIC_KEY from scripts/setup-keys.sh
- esbuild bundles worker directly from TypeScript for proper ESM output
- $ in bundled JS is escaped as $$ for Terraform interpolation

## File Structure
```
api/packages/infra-cloudflare/
├── package.json
├── tsconfig.json
├── cdktf.json
├── .env                    # CLOUDFLARE_ACCOUNT_ID, PUBLIC_KEY
├── scripts/
│   ├── bundle.js           # esbuild bundler for worker
│   └── e2e-test.sh         # deploy, enable subdomain, test, destroy
└── src/
    ├── index.ts            # Exports CloudflareStack
    ├── main.ts             # CDKTF app entry point
    ├── stack.ts            # CloudflareStack with Worker + KV resources
    └── workers/
        └── main.ts         # Standalone worker fetch handler
```

## Usage
- `npm run build` - compile TypeScript
- `npm run build:worker` - build + bundle worker
- `npm run synth` - synthesize terraform
- `npm run deploy` - build and deploy to Cloudflare
- `npm run destroy` - tear down resources
- `npm run test:e2e` - deploy, run e2e tests, destroy (reads worker-url from terraform output)
