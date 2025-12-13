// src/app.ts  ← New entry file (replace index.ts)

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { initDB } from "./db/setup";
import conversationRoutes from "./modules/conversation/conversation.routes";
import userRoutes from "./modules/user/user.routes";
import { wsHandler } from "./ws/ws.handler";

initDB();

const app = new Hono();

// Middleware
app.use("*", cors({ origin: "*" }));
app.use("*", logger()); // Added for debugging

// Routes
app.route("/users", userRoutes);
app.route("/conversations", conversationRoutes);
app.route("/messages", messageRoutes);

// WebSocket
app.get("/ws/:token", wsHandler);

app.get("/health", (c) => c.json({ status: true }));

export default app; // Simplified for Bun server
