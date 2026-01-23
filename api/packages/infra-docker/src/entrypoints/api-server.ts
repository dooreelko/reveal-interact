import express from "express";
import { architectureBinding, ApiContainer } from "@arinoto/cdk-arch";
import {
  api,
  sessionStore,
  hostStore,
  userStore,
  reactionStore,
} from "@revint/arch";
import { DockerApiServer } from "../docker-api-server";
import { httpHandler } from "../http-handler";

const PORT = parseInt(process.env.PORT || "3000");

// Datastore service endpoint
const datastoreEndpoint = {
  host: process.env.DATASTORE_HOST || "datastore",
  port: parseInt(process.env.DATASTORE_PORT || "3001"),
};

// Create datastore API container for HTTP handlers
const datastoreApi = new ApiContainer(
  { node: { id: "datastore-api" } } as never,
  "datastore-api"
);

// Register store routes for httpHandler - each store separately to maintain types
datastoreApi.addRoute("session-store", "POST /store/session/{key}", sessionStore.storeFunction);
datastoreApi.addRoute("session-get", "GET /store/session/{key}", sessionStore.getFunction);
datastoreApi.addRoute("session-getAll", "GET /store/session", sessionStore.getAllFunction);

datastoreApi.addRoute("host-store", "POST /store/host/{key}", hostStore.storeFunction);
datastoreApi.addRoute("host-get", "GET /store/host/{key}", hostStore.getFunction);
datastoreApi.addRoute("host-getAll", "GET /store/host", hostStore.getAllFunction);

datastoreApi.addRoute("user-store", "POST /store/user/{key}", userStore.storeFunction);
datastoreApi.addRoute("user-get", "GET /store/user/{key}", userStore.getFunction);
datastoreApi.addRoute("user-getAll", "GET /store/user", userStore.getAllFunction);

datastoreApi.addRoute("reaction-store", "POST /store/reaction/{key}", reactionStore.storeFunction);
datastoreApi.addRoute("reaction-get", "GET /store/reaction/{key}", reactionStore.getFunction);
datastoreApi.addRoute("reaction-getAll", "GET /store/reaction", reactionStore.getAllFunction);

// Bind store functions to use HTTP to datastore service
sessionStore.storeFunction.overload(httpHandler(datastoreEndpoint, datastoreApi, "session-store") as never);
sessionStore.getFunction.overload(httpHandler(datastoreEndpoint, datastoreApi, "session-get") as never);
sessionStore.getAllFunction.overload(httpHandler(datastoreEndpoint, datastoreApi, "session-getAll") as never);

hostStore.storeFunction.overload(httpHandler(datastoreEndpoint, datastoreApi, "host-store") as never);
hostStore.getFunction.overload(httpHandler(datastoreEndpoint, datastoreApi, "host-get") as never);
hostStore.getAllFunction.overload(httpHandler(datastoreEndpoint, datastoreApi, "host-getAll") as never);

userStore.storeFunction.overload(httpHandler(datastoreEndpoint, datastoreApi, "user-store") as never);
userStore.getFunction.overload(httpHandler(datastoreEndpoint, datastoreApi, "user-get") as never);
userStore.getAllFunction.overload(httpHandler(datastoreEndpoint, datastoreApi, "user-getAll") as never);

reactionStore.storeFunction.overload(httpHandler(datastoreEndpoint, datastoreApi, "reaction-store") as never);
reactionStore.getFunction.overload(httpHandler(datastoreEndpoint, datastoreApi, "reaction-get") as never);
reactionStore.getAllFunction.overload(httpHandler(datastoreEndpoint, datastoreApi, "reaction-getAll") as never);

// API functions are implemented in @revint/arch
// Store functions are overloaded above to use HTTP to datastore service

// Bind API locally
architectureBinding.bind(api, { host: "api", port: PORT });

// Start server
const server = new DockerApiServer(api, { binding: architectureBinding });
server.start(express, PORT);
