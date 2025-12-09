// src/index.ts
import { Hono } from "hono";
import { upgradeWebSocket, websocket } from "hono/bun";
import { verify } from "hono/jwt";
import { initDB } from "./db";
import userApp, { JWT_SECRET } from "./modules/user/user.routes";
import { WSContext } from "hono/ws";
import { cors } from "hono/cors";

initDB();

// 1. Type the Hono app so 'c.get' knows about userId
const app = new Hono<{ Variables: { userId: string } }>();

// Global map: userId → WebSocket Context
const clients = new Map<string, WSContext>();

app.use(
  "/*",
  cors({
    origin: "*", // Allow all origins (localhost:5173, etc.)
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.route("/users", userApp);
app.get("/health", (c) => c.json({ status: true, uptime: process.uptime() }));

app.get(
  "/ws/:token",
  // 🟢 STEP 1: The Gatekeeper (Middleware)
  // We check the token via HTTP *before* upgrading
  async (c, next) => {
    const token = c.req.param("token");
    try {
      const payload = await verify(token, JWT_SECRET);

      // Store ID in context for the next step
      c.set("userId", payload.id as string);

      await next(); // Pass the baton to upgradeWebSocket
    } catch (e) {
      console.error("❌ Invalid Token attempt");
      return c.json({ error: "Unauthorized" }, 401);
    }
  },

  // 🟢 STEP 2: The Upgrader
  // This ONLY runs if next() was called above
  upgradeWebSocket((c) => {
    // Retrieve the ID we verified in Step 1
    const userId = c.get("userId");

    return {
      onOpen(event, ws) {
        console.log(`🟢 User ${userId} connected`);
        clients.set(userId, ws);
      },

      async onMessage(event, ws) {
        let raw: string;
        if (typeof event.data === "string") {
          raw = event.data;
        } else if (
          event.data instanceof ArrayBuffer ||
          ArrayBuffer.isView(event.data)
        ) {
          raw = new TextDecoder().decode(event.data);
        } else {
          return;
        }

        try {
          const data = JSON.parse(raw);
          console.log(`📨 [${userId}]:`, data);

          switch (data.type) {
            case "SEND_MESSAGE":
              handleSendMessage(userId, data, ws);
              break;
            case "TYPING":
              forwardSignal(userId, data.toUserId, "USER_TYPING");
              break;
            default:
              console.warn(`Unknown event: ${data.type}`);
          }
        } catch (e) {
          console.error("Error parsing message:", e);
        }
      },

      onClose() {
        console.log(`🔴 User ${userId} disconnected`);
        clients.delete(userId);
      },
    };
  }),
);

// --- Helpers ---

function handleSendMessage(senderId: string, payload: any, senderWs: any) {
  const { toUserId, content } = payload;
  const timestamp = new Date().toISOString();

  console.log(`\n--- 📨 ROUTING MESSAGE ---`);
  console.log(`From: "${senderId}"`);
  console.log(`To:   "${toUserId}"`);
  console.log(`Online:`, Array.from(clients.keys()));

  const recipientSocket = clients.get(toUserId);

  if (recipientSocket) {
    console.log(`✅ Delivering to ${toUserId}`);
    const outGoingMessage = JSON.stringify({
      type: "NEW_MESSAGE",
      from: senderId,
      content,
      timestamp,
    });
    recipientSocket.send(outGoingMessage);
    senderWs.send(JSON.stringify({ type: "ACK", status: "DELIVERED" }));
  } else {
    console.log(`⚠️ User ${toUserId} is offline.`);
  }
  console.log(`--------------------------\n`);
}

function forwardSignal(fromId: string, toId: string, type: string) {
  const target = clients.get(toId);
  if (target) {
    target.send(JSON.stringify({ type, from: fromId }));
  }
}

console.log("YACA Server running on http://localhost:3000");

export default {
  port: 3000,
  fetch: app.fetch,
  websocket,
};
