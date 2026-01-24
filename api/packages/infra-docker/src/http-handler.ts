import { ApiContainer, ServiceEndpoint, FunctionHandler } from "@arinoto/cdk-arch";

/**
 * Creates an HTTP handler that forwards requests to a remote service endpoint.
 */
export function httpHandler<TArgs extends unknown[], TReturn>(
  endpoint: ServiceEndpoint,
  container: ApiContainer,
  routeName: string
): FunctionHandler<TArgs, TReturn> {
  const route = container.getRoute(routeName);

  const [method, rawPath] = route.path.split(" ");
  const paramMatches = rawPath.match(/\{(\w+)\}/g) || [];
  const paramNames = paramMatches.map((m: string) => m.slice(1, -1));

  return async (...args: TArgs): Promise<TReturn> => {
    let path = rawPath;
    let argIndex = 0;

    // Replace path parameters
    for (const paramName of paramNames) {
      path = path.replace(`{${paramName}}`, encodeURIComponent(String(args[argIndex++])));
    }

    const url = `http://${endpoint.host}:${endpoint.port}${path}`;
    const options: RequestInit = {
      method: method.toUpperCase(),
      headers: { "Content-Type": "application/json" },
    };

    // Add body for POST/PUT with remaining args
    if (["POST", "PUT"].includes(method.toUpperCase()) && argIndex < args.length) {
      options.body = JSON.stringify(args[argIndex]);
    }

    const response = await fetch(url, options);
    return response.json() as Promise<TReturn>;
  };
}
