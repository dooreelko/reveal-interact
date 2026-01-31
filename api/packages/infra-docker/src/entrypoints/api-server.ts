import express from "express";
import { architectureBinding, createHttpBindings } from "@arinoto/cdk-arch";
import {
  api,
  sessionStoreApi,
  hostStoreApi,
  userStoreApi,
  reactionStoreApi,
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
architectureBinding.bind(sessionStoreApi, {
  baseUrl: sessionStoreEndpoint.baseUrl,
  overloads: createHttpBindings(sessionStoreEndpoint, sessionStoreApi, ["store", "get", "getAll"] as const),
});

architectureBinding.bind(hostStoreApi, {
  baseUrl: hostStoreEndpoint.baseUrl,
  overloads: createHttpBindings(hostStoreEndpoint, hostStoreApi, ["store", "get", "getAll"] as const),
});

architectureBinding.bind(userStoreApi, {
  baseUrl: userStoreEndpoint.baseUrl,
  overloads: createHttpBindings(userStoreEndpoint, userStoreApi, ["store", "get", "getAll"] as const),
});

architectureBinding.bind(reactionStoreApi, {
  baseUrl: reactionStoreEndpoint.baseUrl,
  overloads: createHttpBindings(reactionStoreEndpoint, reactionStoreApi, ["store", "get", "getAll"] as const),
});

// Bind API locally
architectureBinding.bind(api, { baseUrl: `api:${PORT}` });

// Start server
const server = new DockerApiServer(api, { binding: architectureBinding });
server.start(express, PORT);