update cdk-arch to 0.5.0 which allows for Function handlers to have `this` bound to request execution context (requires handler to be js function instead of arrow)
switch to that to allow accessing ctx: RequestContext from `this` (see https://github.com/dooreelko/cdk-arch/blob/main/packages/example/local-docker/src/docker-api-server.ts#L45 and
https://github.com/dooreelko/cdk-arch/blob/main/packages/example/architecture/src/architecture.ts#L52) so that the Function signatures reflect the API interface 1:1 and can be used directly instead of
creating partials by removong the runtime context for non-backend environments. correspondingly update plugin and web to use the types directly.

## Specification

### Goal
Remove `RequestContext` from Function argument lists by using cdk-arch@0.5.0's runtime context binding (`this`). This makes API function signatures match the HTTP interface 1:1, eliminating the need for custom client interfaces that strip the server-only `RequestContext` parameter.

### Current State
- Functions have `RequestContext` as the **last argument** (e.g., `newSessionFunction: (body, ctx) => ...`)
- Infrastructure (docker-api-server, cloudflare-worker-handler) builds `ctx` and passes it as the last argument via `handler.invoke(...args, ctx)`
- Plugin and web clients define custom interface types (`HostApiClient`, `UserApiClient`) that omit `RequestContext` from signatures, then cast `createHttpBindings` results to these types

### Target State
- Functions access `RequestContext` via `this` binding instead of as an argument
- Function handlers must be **regular functions** (not arrow functions) to support `this` binding
- Infrastructure uses `fn.invokeWithRuntimeContext(args, ctx)` instead of `fn.invoke(...args, ctx)`
- Function signatures match API interface 1:1 (no `RequestContext` in args)
- Plugin and web clients can use `createHttpBindings` result types directly without custom interfaces or casting

### cdk-arch 0.5.0 Pattern
```typescript
// Third generic type specifies runtime context type
const myFunction = new Function<[string], string, FunctionRuntimeContextMarker & RequestContext>(
  arch, 'my-handler',
  function(name: string) {  // Must be regular function, not arrow
    const ctx = extractContext<RequestContext>(this);
    // Use ctx.headers, ctx.cookies, ctx.env, ctx.setCookie()
    return Promise.resolve(`Hello ${name}`);
  }
);

// Helper to extract typed context
const extractContext = <T>(that: any): T => {
  if (!that?.runtimeContext) throw new Error('Missing runtime context');
  return that as T;
};

// Infrastructure invokes with context
fn.invokeWithRuntimeContext(args, ctx);  // ctx bound to `this`
```

## Decisions

### Use Third Generic Type Parameter
- **Accepted:** Use `Function<TArgs, TReturn, FunctionRuntimeContextMarker & RequestContext>` pattern
- **Reason:** Provides type safety for runtime context, follows cdk-arch example pattern

### Context Extraction Helper
- **Accepted:** Add `extractContext<T>(this)` helper in architecture.ts
- **Reason:** Provides safe typed access to `this` context with runtime validation

### Regular Functions Required
- **Accepted:** Convert all handler arrow functions to regular function expressions
- **Reason:** Arrow functions lexically bind `this`, preventing runtime context injection

### TypeScript `noImplicitThis` Override
- **Accepted:** Set `noImplicitThis: false` in arch package's tsconfig.json
- **Reason:** Allows using `this` in function handlers without explicit type annotation, keeping handler signatures clean
- **Rejected:** Adding explicit `this: ApiRuntimeContext` parameter - defeats the purpose of removing context from signatures

### Remove Custom Client Interfaces
- **Accepted:** Remove `HostApiClient` and `UserApiClient` custom types from plugin and web lib
- **Reason:** With `RequestContext` removed from args, `createHttpBindings` return types match client needs directly

### Keep RequestContext Type
- **Accepted:** Keep `RequestContext` interface in types.ts
- **Reason:** Still needed for the runtime context type, just not as a function argument

## Implementation Details

### Architecture Changes (api/packages/arch/src/architecture.ts)
- Import `FunctionRuntimeContextMarker` from `@arinoto/cdk-arch`
- Define type alias: `type ApiRuntimeContext = FunctionRuntimeContextMarker & RequestContext`
- Add `extractContext<T>(that)` helper function with runtime validation
- For each Function:
  - Add third generic param: `ApiRuntimeContext`
  - Convert arrow function handler to regular function expression
  - Remove `RequestContext` from argument list
  - Extract context via `const ctx = extractContext<RequestContext>(this);`
- Helper functions continue to receive `ctx` as parameter (they're called by handlers that have ctx)

### tsconfig.json (api/packages/arch/tsconfig.json)
- Add `noImplicitThis: false` to allow implicit `this` in function handlers

### Infrastructure Changes
- **docker-api-server.ts**: Replace `handler.invoke(...args)` with `handler.invokeWithRuntimeContext(args, ctx)`, stop appending ctx to args array
- **cloudflare-worker-handler.ts**: Same pattern - use `invokeWithRuntimeContext` instead of `invoke`

### Plugin Changes (plugin/src/index.ts)
- Replace manual `HostApiClient` interface with `Pick<RouteHandlers<typeof api.routes>, "newSession" | "setState">`
- Remove `as unknown as HostApiClient` cast from `createHostApiClient` - types now match directly
- Import `RouteHandlers` from `@arinoto/cdk-arch`

### Web Library Changes (web/revint-lib/src/index.ts)
- Replace manual `UserApiClient` interface with `Pick<RouteHandlers<typeof api.routes>, "getSession" | "login" | "react" | "getState">`
- Remove casts from `createUserApiClient` and `getSessionInfo` - types now match directly
- Import `RouteHandlers` from `@arinoto/cdk-arch`

### Package Updates
Update `@arinoto/cdk-arch` to `0.5.0` in:
- api/packages/arch/package.json
- api/packages/infra-docker/package.json
- api/packages/infra-cloudflare/package.json
- plugin/package.json
- plugin/e2e-tests/package.json
- web/revint-lib/package.json

## File Changes Summary

1. **api/packages/arch/tsconfig.json** - Add `noImplicitThis: false`
2. **api/packages/arch/src/architecture.ts** - Add extractContext helper, convert handlers to regular functions, use third generic type, remove RequestContext from args
3. **api/packages/infra-docker/src/docker-api-server.ts** - Use invokeWithRuntimeContext
4. **api/packages/infra-cloudflare/src/cloudflare-worker-handler.ts** - Use invokeWithRuntimeContext
5. **plugin/src/index.ts** - Remove HostApiClient, simplify typing
6. **web/revint-lib/src/index.ts** - Remove UserApiClient, simplify typing
7. ***/package.json** - Update cdk-arch version to 0.5.0
