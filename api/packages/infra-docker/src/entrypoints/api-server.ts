import express from "express";
import { architectureBinding } from "@arinoto/cdk-arch";
import {
  api,
  sessionStoreApi,
  hostStoreApi,
  userStoreApi,
  reactionStoreApi,
} from "@revint/arch";
import { DockerApiServer } from "../docker-api-server";
import { httpHandler } from "../http-handler";

const PORT = parseInt(process.env.PORT || "3000");

// Individual store service endpoints
const sessionStoreEndpoint = {
  host: process.env.SESSION_STORE_HOST || "session-store",
  port: parseInt(process.env.SESSION_STORE_PORT || "3011"),
};

const hostStoreEndpoint = {
  host: process.env.HOST_STORE_HOST || "host-store",
  port: parseInt(process.env.HOST_STORE_PORT || "3012"),
};

const userStoreEndpoint = {
  host: process.env.USER_STORE_HOST || "user-store",
  port: parseInt(process.env.USER_STORE_PORT || "3013"),
};

const reactionStoreEndpoint = {
  host: process.env.REACTION_STORE_HOST || "reaction-store",
  port: parseInt(process.env.REACTION_STORE_PORT || "3014"),
};

// Bind store functions to use HTTP to individual store services
architectureBinding.bind(sessionStoreApi, {
  host: sessionStoreEndpoint.host,
  port: sessionStoreEndpoint.port,
  overloads: {
    store: httpHandler(sessionStoreEndpoint, sessionStoreApi, "store"),
    get: httpHandler(sessionStoreEndpoint, sessionStoreApi, "get"),
    getAll: httpHandler(sessionStoreEndpoint, sessionStoreApi, "getAll"),
  },
});

architectureBinding.bind(hostStoreApi, {
  host: hostStoreEndpoint.host,
  port: hostStoreEndpoint.port,
  overloads: {
    store: httpHandler(hostStoreEndpoint, hostStoreApi, "store"),
    get: httpHandler(hostStoreEndpoint, hostStoreApi, "get"),
    getAll: httpHandler(hostStoreEndpoint, hostStoreApi, "getAll"),
  },
});

architectureBinding.bind(userStoreApi, {
  host: userStoreEndpoint.host,
  port: userStoreEndpoint.port,
  overloads: {
    store: httpHandler(userStoreEndpoint, userStoreApi, "store"),
    get: httpHandler(userStoreEndpoint, userStoreApi, "get"),
    getAll: httpHandler(userStoreEndpoint, userStoreApi, "getAll"),
  },
});

architectureBinding.bind(reactionStoreApi, {
  host: reactionStoreEndpoint.host,
  port: reactionStoreEndpoint.port,
  overloads: {
    store: httpHandler(reactionStoreEndpoint, reactionStoreApi, "store"),
    get: httpHandler(reactionStoreEndpoint, reactionStoreApi, "get"),
    getAll: httpHandler(reactionStoreEndpoint, reactionStoreApi, "getAll"),
  },
});

// Bind API locally
architectureBinding.bind(api, { host: "api", port: PORT });

// Start server
const server = new DockerApiServer(api, { binding: architectureBinding });
server.start(express, PORT);
