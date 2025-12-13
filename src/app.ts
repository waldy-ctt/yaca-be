// src/app.ts

import './db/setup.ts';
import { initDB } from "./db/setup";

initDB();

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { wsHandler } from "./ws/ws.handler";
import messageApp from "./modules/message/message.route";
import conversationApp from "./modules/conversation/conversation.routes";
import userApp from "./modules/user/user.routes";

const app = new Hono();

// Middleware
app.use("*", cors({ origin: "*" }));
app.use("*", logger()); // Added for debugging

// Routes
app.route("/users", userApp);
app.route("/conversations", conversationApp);
app.route("/messages", messageApp);

app.get("/ws/:token", wsHandler);

app.get("/health", (c) => c.json({ status: true }));

export default app;
