instead of calling addRoute for each, pass them as an object to the ApiContainer constructor

## Decisions

### Scope
- **Both ApiContainer and WsContainer** refactored to accept routes in constructor
- Applies to all container instantiations in architecture.ts

### ApiContainer Changes
- ApiContainer from cdk-arch already supports `routes: ApiRoutes` constructor parameter
- Routes format: `{ [name: string]: { path: string, handler: Function } }`

### WsContainer Changes
- WsContainer redesigned to match ApiContainer pattern from cdk-arch
- `WsRouteEntry` no longer contains `name` field (name is the key in `WsRoutes`)
- `public readonly routes: WsRoutes` replaces private `Map`
- `getRouteByName()` renamed to `getRoute()`, throws if not found (like ApiContainer)
- `listRoutes()` returns `string[]` (just names, like ApiContainer)
- Constructor accepts `WsRoutesInput` (partial entries), creates TBDFunctions for missing handlers

### Rejected Alternatives
- Keeping addRoute() calls for readability - rejected, bulk constructor approach preferred per task
- Removing addRoute() method entirely - rejected, method still useful for dynamic route addition

### infra-docker Fixes
- Fixed method name mismatches: `listNamedRoutes()` → `listRoutes()` + `getRoute()`
- Fixed `getRouteByName()` → `getRoute()` to match cdk-arch ApiContainer interface

## Implementation Details
- WsContainer uses `public readonly routes: WsRoutes` (plain object like ApiContainer)
- `WsRoutesInput` for constructor accepts partial entries (handlers optional)
- `WsRouteInput` interface has optional onConnect/onMessage/onDisconnect
- Constructor fills missing handlers with TBDFunctions
- `getRoute(name)` throws if route not found (matches ApiContainer.getRoute)
- architecture.ts uses `ws.getRoute("hostPipe")` instead of `ws.getRouteByName("hostPipe")!`
- addRoute methods remain available for backward compatibility
