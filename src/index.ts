import { Hono } from "hono";
import { cors } from "hono/cors";
import { websocket } from "hono/bun";
import { initDB } from "./db";
import userApp from "./modules/user/user.routes";
import { wsHandler } from "./ws/ws.handler";
import messageApp from "./modules/message/message.route";
import converstationApp from "./modules/conversation/conversation.routes";

initDB();

const app = new Hono();

// Middleware
app.use("/*", cors({ origin: "*" }));

// API Routes
app.route("/users", userApp);
app.route('/conversation', converstationApp)
app.route("/messages", messageApp); // History handling

// WebSocket Route (Clean 1-liner!)
app.get("/ws/:token", wsHandler);

app.get("/health", (c) => c.json({ status: true }));

console.log("🚀 YACA Server running on http://localhost:3000");

export default {
  port: 3000,
  fetch: app.fetch,
  websocket,
};
