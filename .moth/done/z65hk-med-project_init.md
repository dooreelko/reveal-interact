# API
directory: ./api
scaffold a minimal project with node/typescript, cdktf-cli an empty local docker deployment using @cdktf/provider-docker and an empty cloudflare one

## Decisions

### Project Structure
- **Monorepo using Lerna** with packages under `api/packages/`
- Package namespace: `@revint/`
- Package manager: npm

### Packages
- `@revint/core` - shared types/interfaces (architecture package)
- `@revint/infra-docker` - CDKTF stack for local Docker deployment using @cdktf/provider-docker
- `@revint/infra-cloudflare` - CDKTF stack for Cloudflare deployment

### Rejected Alternatives
- Single project structure - rejected in favor of monorepo for better separation of concerns
- pnpm/yarn - npm chosen for simplicity
- Other namespaces (@api/, @reveal/, simple names) - @revint/ chosen

## Implementation Details
- Lerna monorepo initialized in ./api with npm workspaces
- Each package has its own tsconfig extending root tsconfig.json
- CDKTF stacks use pre-built provider packages (@cdktf/provider-docker, @cdktf/provider-cloudflare)
- Each infra package has cdktf.json config, main.ts entry point, and stack.ts with provider setup
- Core package exports DeploymentConfig interface as placeholder

## File Structure
```
api/
├── package.json          # Lerna/workspace root
├── lerna.json
├── tsconfig.json         # Base TypeScript config
├── .gitignore
└── packages/
    ├── core/             # @revint/core
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/index.ts
    ├── infra-docker/     # @revint/infra-docker
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── cdktf.json
    │   └── src/
    │       ├── main.ts
    │       ├── stack.ts
    │       └── index.ts
    └── infra-cloudflare/ # @revint/infra-cloudflare
        ├── package.json
        ├── tsconfig.json
        ├── cdktf.json
        └── src/
            ├── main.ts
            ├── stack.ts
            └── index.ts
```

## Usage
- `npm install` - install all dependencies
- `npm run build` - build all packages
- `cd packages/infra-docker && npm run synth` - synthesize Docker stack
- `cd packages/infra-cloudflare && npm run synth` - synthesize Cloudflare stack