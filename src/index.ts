// src/index.ts
import { Context, Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";
import { initDB } from "./db";
import userApp from "./modules/user/user.routes";

initDB();

const app = new Hono();

app.route("/users", userApp);

app.get("/health", (c: Context) => c.json({ status: true, uptime: process.uptime() }));

app.get(
  "/ws",
  upgradeWebSocket((c: Context) => {
    return {
      onMessage(event, ws) {
        console.log(`Received: ${event.data}`);
        ws.send(`Echo: ${event.data}`);
      },
    };
  }),
);

console.log("🚀 YACA Server running on http://localhost:3000");

export default {
  port: 3000,
  fetch: app.fetch,
  websocket,
};
