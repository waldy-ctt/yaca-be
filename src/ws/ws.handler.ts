// src/ws/ws.handler.ts
import { Context, Next } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { verify } from "hono/jwt";
import { WSContext } from "hono/ws";
import { JWT_SECRET } from "../modules/user/user.routes";
import { MessageRepository } from "../modules/message/message.repo";
import {
  MessageInterface,
  MessageContentInterface,
  MessageReactionInterface,
} from "../modules/message/message.interface";
import { randomUUIDv7 } from "bun";
import { UserRepository } from "../modules/user/user.repo";

const clients = new Map<string, WSContext>();

export const wsHandler = async (c: Context, next: Next) => {
  const token = c.req.param("token");
  let userId: string;

  // 1. Auth Check (The Gatekeeper)
  try {
    const payload = await verify(token, JWT_SECRET);
    userId = payload.id as string;
  } catch (e) {
    // ✅ Safe 401 response (No WebSocket upgrade happens)
    return c.json({ error: "Unauthorized" }, 401);
  }

  // 2. If Auth passes, we delegate to the actual WebSocket upgrader
  return upgradeWebSocket((c) => {
    return {
      onOpen(event, ws) {
        console.log(`🟢 User ${userId} connected`);
        clients.set(userId, ws);
        UserRepository.updateStatus(userId, "online");
      },

      async onMessage(event, ws) {
        // 🟢 FIX 2: Strict Type Narrowing for TextDecoder
        let raw: string;

        if (typeof event.data === "string") {
          raw = event.data;
        } else if (
          event.data instanceof ArrayBuffer ||
          ArrayBuffer.isView(event.data)
        ) {
          // TypeScript now knows this is definitely a Buffer
          raw = new TextDecoder().decode(event.data);
        } else {
          // It's a Blob or something else we don't handle
          return;
        }

        try {
          const data = JSON.parse(raw);
          console.log(`📨 [${userId}] Event: ${data.type}`);

          switch (data.type) {
            case "SEND_MESSAGE":
              await handleSendMessage(userId, data, ws);
              break;
            case "EDIT_MESSAGE":
              await handleEditMessage(userId, data);
              break;
            case "REACT_MESSAGE":
              await handleReaction(userId, data);
              break;
            case "DELETE_MESSAGE":
              await handleDeleteMessage(userId, data);
              break;
            case "TYPING":
              forwardToUser(data.toUserId, {
                type: "USER_TYPING",
                from: userId,
              });
              break;
          }
        } catch (e) {
          console.error("WS Error:", e);
        }
      },

      onClose() {
        clients.delete(userId);
        console.log(`🔴 User ${userId} disconnected`);
        UserRepository.updateStatus(userId, "offline");
      },
    };
  })(c, next); // <--- We call the upgrader manually here
};

// --- HELPER FUNCTIONS ---

async function handleSendMessage(senderId: string, payload: any, ws: any) {
  const { conversationId, content, toUserId, tempId } = payload;

  // A. Save Message
  const newMessage = new MessageInterface(
    randomUUIDv7(),
    conversationId,
    new MessageContentInterface(content, "text"),
    [],
    senderId,
  );
  const savedMsg = MessageRepository.create(newMessage);
  if (!savedMsg) return;

  // B. Fetch Sender Profile (The Hydration) 💧
  const senderProfile = UserRepository.findProfileById(senderId);

  // C. Construct "Hydrated" Payload
  // We attach the sender object so the UI can render the avatar immediately
  const eventPayload = {
    type: "NEW_MESSAGE",
    message: {
      ...savedMsg, // The raw message data
      sender: senderProfile, // { id, name, avatar, status }
    },
  };

  // D. Send
  forwardToUser(toUserId, eventPayload);

  // Confirm to self (also hydrated, useful for optimistic UI confirmation)
  ws.send(
    JSON.stringify({
      type: "ACK",
      tempId,
      message: eventPayload.message,
    }),
  );
}

async function handleEditMessage(senderId: string, payload: any) {
  const { messageId, newContent, toUserId } = payload;
  const updatedMsg = MessageRepository.updateContent(
    messageId,
    new MessageContentInterface(newContent, "text"),
  );

  if (updatedMsg) {
    const event = { type: "MESSAGE_UPDATED", message: updatedMsg };
    forwardToUser(toUserId, event);
    forwardToUser(senderId, event);
  }
}

async function handleReaction(senderId: string, payload: any) {
  const { messageId, reactionType, toUserId } = payload;
  const msg = MessageRepository.findById(messageId);
  if (!msg) return;

  const existingIdx = msg.reaction.findIndex((r) => r.sender === senderId);
  if (existingIdx > -1) {
    msg.reaction.splice(existingIdx, 1);
  } else {
    msg.reaction.push(new MessageReactionInterface(reactionType, senderId));
  }

  const updatedMsg = MessageRepository.updateReactions(messageId, msg.reaction);
  if (updatedMsg) {
    const event = { type: "MESSAGE_UPDATED", message: updatedMsg };
    forwardToUser(toUserId, event);
    forwardToUser(senderId, event);
  }
}

async function handleDeleteMessage(senderId: string, payload: any) {
  const { messageId, toUserId } = payload;
  const success = MessageRepository.delete(messageId);
  if (success) {
    const event = { type: "MESSAGE_DELETED", messageId };
    forwardToUser(toUserId, event);
    forwardToUser(senderId, event);
  }
}

function forwardToUser(userId: string, data: any) {
  const socket = clients.get(userId);
  if (socket) {
    socket.send(JSON.stringify(data));
  }
}
