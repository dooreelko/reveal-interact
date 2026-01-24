import express from "express";
import { architectureBinding } from "@arinoto/cdk-arch";
import {
  api,
  datastoreApi,
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

// Bind store functions to use HTTP to datastore service
architectureBinding.bind(datastoreApi, {
  host: datastoreEndpoint.host,
  port: datastoreEndpoint.port,
  overloads: {
    "session-store": httpHandler(datastoreEndpoint, datastoreApi, "session-store"),
    "session-get": httpHandler(datastoreEndpoint, datastoreApi, "session-get"),
    "session-getAll": httpHandler(datastoreEndpoint, datastoreApi, "session-getAll"),

    "host-store": httpHandler(datastoreEndpoint, datastoreApi, "host-store"),
    "host-get": httpHandler(datastoreEndpoint, datastoreApi, "host-get"),
    "host-getAll": httpHandler(datastoreEndpoint, datastoreApi, "host-getAll"),

    "user-store": httpHandler(datastoreEndpoint, datastoreApi, "user-store"),
    "user-get": httpHandler(datastoreEndpoint, datastoreApi, "user-get"),
    "user-getAll": httpHandler(datastoreEndpoint, datastoreApi, "user-getAll"),

    "reaction-store": httpHandler(datastoreEndpoint, datastoreApi, "reaction-store"),
    "reaction-get": httpHandler(datastoreEndpoint, datastoreApi, "reaction-get"),
    "reaction-getAll": httpHandler(datastoreEndpoint, datastoreApi, "reaction-getAll"),
  },
});

// Bind API locally
architectureBinding.bind(api, { host: "api", port: PORT });

// Start server
const server = new DockerApiServer(api, { binding: architectureBinding });
server.start(express, PORT);
