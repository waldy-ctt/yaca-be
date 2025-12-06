// src/index.ts
import { Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";
import { initDB } from "./db";
import userApp from "./modules/user/user.routes";

// 1. Start DB
initDB();

const app = new Hono();

// 2. Mount Modules
// Any route inside userApp will now start with /users
app.route("/users", userApp);

app.get("/health", (c) => c.json({ status: true, uptime: process.uptime() }));

// WebSocket Logic (Can also be moved to a module later!)
app.get("/ws", upgradeWebSocket((c) => {
  return {
    onMessage(event, ws) {
      console.log(`Received: ${event.data}`);
      ws.send(`Echo: ${event.data}`);
    },
  };
}));

console.log("🚀 YACA Server running on http://localhost:3000");

export default {
  port: 3000,
  fetch: app.fetch,
  websocket,
};
