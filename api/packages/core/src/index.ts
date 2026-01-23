// @revint/core - shared types and interfaces

export interface DeploymentConfig {
  name: string;
  environment: "local" | "production";
}
