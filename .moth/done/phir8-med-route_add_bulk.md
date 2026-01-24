instead of calling addRoute for each, pass them as an object to the ApiContainer constructor

## Decisions

### Scope
- **Both ApiContainer and WsContainer** refactored to accept routes in constructor
- Applies to all container instantiations in architecture.ts

### ApiContainer Changes
- ApiContainer from cdk-arch already supports `routes: ApiRoutes` constructor parameter
- Routes format: `{ [name: string]: { path: string, handler: Function } }`

### WsContainer Changes
- WsContainer (custom construct in @revint/arch) modified to accept routes in constructor
- Routes format: `{ [name: string]: { path: string, handlers?: {...} } }` matching addRoute signature
- Constructor processes routes and calls addRoute internally for each entry

### Rejected Alternatives
- Keeping addRoute() calls for readability - rejected, bulk constructor approach preferred per task
- Removing addRoute() method entirely - rejected, method still useful for dynamic route addition

### infra-docker Fixes
- Fixed method name mismatches: `listNamedRoutes()` → `listRoutes()` + `getRoute()`
- Fixed `getRouteByName()` → `getRoute()` to match cdk-arch ApiContainer interface

## Implementation Details
- WsContainer constructor extended with optional `routes` parameter of type `WsRoutes`
- New `WsRouteInput` interface exported for route configuration
- architecture.ts refactored to pass route objects inline to constructors
- WsContainer routes accessed via `getRouteByName()` after construction for exports
- addRoute methods remain available for backward compatibility
