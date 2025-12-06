import { Context, Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";
import { Database } from "bun:sqlite";

const db = new Database("yaca.sqlite");

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: true, uptime: process.uptime() });
});

app.get(
  "/ws",
  upgradeWebSocket((c: Context) => {
    return {
      onOpen(event, ws) {
        console.log("Connection Opened");
        ws.send("Welcome to YACA chat!");
      },
      onMessage(event, ws) {
        console.log("Received: " + event.data);
        ws.send(`You said ${event.data}`);
      },
      onClose(event, ws) {
        console.log("Connection closed");
      },
    };
  }),
);

console.log("YACA BE listening http://localhost:3000");

export default {
  port: 3000,
  fetch: app.fetch,
  websocket,
};
