update cdk-arch to 0.5.0 which allows for Function handlers to have `this` bound to request execution context (requires handler to be js function instead of arrow)
switch to that to allow accessing ctx: RequestContext from `this` (see https://github.com/dooreelko/cdk-arch/blob/main/packages/example/local-docker/src/docker-api-server.ts#L45 and 
https://github.com/dooreelko/cdk-arch/blob/main/packages/example/architecture/src/architecture.ts#L52) so that the Function signatures reflect the API interface 1:1 and can be used directly instead of 
creating partials by removong the runtime context for non-backend environments. correspondingly update plugin and web to use the types directly.
