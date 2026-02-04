import express from "express";
import { architectureBinding, createHttpBindings } from "@arinoto/cdk-arch";
import {
  api,
  sessionStore,
  hostStore,
  userStore,
  reactionStore,
} from "@revint/arch";
import { DockerApiServer } from "../docker-api-server";

const PORT = parseInt(process.env.PORT || "3000");

// Individual store service endpoints
const sessionStoreEndpoint = {
  baseUrl: `http://${process.env.SESSION_STORE_HOST || "session-store"}:${parseInt(process.env.SESSION_STORE_PORT || "3011")}`,
};

const hostStoreEndpoint = {
  baseUrl: `http://${process.env.HOST_STORE_HOST || "host-store"}:${parseInt(process.env.HOST_STORE_PORT || "3012")}`,
};

const userStoreEndpoint = {
  baseUrl: `http://${process.env.USER_STORE_HOST || "user-store"}:${parseInt(process.env.USER_STORE_PORT || "3013")}`,
};

const reactionStoreEndpoint = {
  baseUrl: `http://${process.env.REACTION_STORE_HOST || "reaction-store"}:${parseInt(process.env.REACTION_STORE_PORT || "3014")}`,
};

// Bind store functions to use HTTP to individual store services
architectureBinding.bind(sessionStore, {
  baseUrl: sessionStoreEndpoint.baseUrl,
  overloads: createHttpBindings(sessionStoreEndpoint, sessionStore, ["store", "get", "list"] as const),
});

architectureBinding.bind(hostStore, {
  baseUrl: hostStoreEndpoint.baseUrl,
  overloads: createHttpBindings(hostStoreEndpoint, hostStore, ["store", "get", "list"] as const),
});

architectureBinding.bind(userStore, {
  baseUrl: userStoreEndpoint.baseUrl,
  overloads: createHttpBindings(userStoreEndpoint, userStore, ["store", "get", "list"] as const),
});

architectureBinding.bind(reactionStore, {
  baseUrl: reactionStoreEndpoint.baseUrl,
  overloads: createHttpBindings(reactionStoreEndpoint, reactionStore, ["store", "get", "list"] as const),
});

// Bind API locally
architectureBinding.bind(api, { baseUrl: `api:${PORT}` });

// Start server
const server = new DockerApiServer(api, { binding: architectureBinding });
server.start(express, PORT);