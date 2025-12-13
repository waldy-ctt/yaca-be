// src/app.ts

import "./db/setup.ts";
import { initDB } from "./db/setup";

initDB();

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { wsHandler } from "./ws/ws.handler";
import messageApp from "./modules/message/message.routes.js";
import conversationApp from "./modules/conversation/conversation.routes";
import userApp from "./modules/user/user.routes";

const app = new Hono();

// Middleware
app.use("*", cors({ 
  origin: "*",
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));
app.use("*", logger());

// Routes
app.route("/users", userApp);
app.route("/conversations", conversationApp);
app.route("/messages", messageApp);

// WebSocket route
app.get("/ws/:token", wsHandler);

app.get("/health", (c) => c.json({ status: true }));

Bun.serve({
  port: process.env.PORT || 3000,
  fetch: app.fetch,
});

console.log(`🚀 Server running on http://localhost:${process.env.PORT || 3000}`);

export default app;
