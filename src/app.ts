// src/app.ts

import "./db/setup.ts";
import { initDB } from "./db/setup";

initDB();

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { wsHandler } from "./ws/ws.handler";

// ✅ FIXED: Import correct route files
import messageApp from "./modules/message/message.routes";
import conversationApp from "./modules/conversation/conversation.routes";
import userApp from "./modules/user/user.routes";

const app = new Hono();

// ✅ FIXED: Enhanced CORS configuration
app.use("*", cors({
  origin: (origin) => {
    // Allow all origins (or specify your frontend URL)
    return origin || "*";
  },
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposeHeaders: ["Content-Length", "X-Request-Id"],
  maxAge: 86400, // 24 hours
}));

app.use("*", logger());

// ✅ Routes - Order matters!
app.route("/users", userApp);
app.route("/conversations", conversationApp);
app.route("/messages", messageApp);

// WebSocket route
app.get("/ws/:token", wsHandler);

// Health check
app.get("/health", (c) => c.json({ status: true, timestamp: new Date().toISOString() }));

// 404 handler
app.notFound((c) => c.json({ error: "Not found" }, 404));

Bun.serve({
  port: process.env.PORT || 3000,
  fetch: app.fetch,
  // ✅ Add WebSocket handler configuration
  websocket: {
    message() {}, // Will be handled by Hono's upgradeWebSocket
    open() {},
    close() {},
  },
});

console.log(`🚀 Server running on http://localhost:${process.env.PORT || 3000}`);

export default app;
