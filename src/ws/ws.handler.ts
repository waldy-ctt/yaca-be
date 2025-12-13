// src/ws/ws.handler.ts
import { Context, Next } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { verify } from "hono/jwt";
import { WSContext } from "hono/ws";
import { MessageRepository } from "../modules/message/message.repo";
import {
  MessageInterface,
  MessageContentInterface,
  MessageReactionInterface,
} from "../modules/message/message.interface";
import { randomUUIDv7 } from "bun";
import { UserRepository } from "../modules/user/user.repo";
import { JWT_SECRET } from "../config";
import { ConversationRepository } from "../modules/conversation/conversation.repo";

const clients = new Map<string, WSContext>();

export const wsHandler = async (c: Context, next: Next) => {
  const token = c.req.param("token");
  let userId: string;

  try {
    const payload = await verify(token, JWT_SECRET);
    userId = payload.id as string;
  } catch (e) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return upgradeWebSocket((c) => {
    return {
      onOpen(event, ws) {
        console.log(`🟢 User ${userId} connected`);
        clients.set(userId, ws);
        UserRepository.updateStatus(userId, "online");
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
            case "READ":
              const { conversationId } = data;
              forwardToConversation(
                conversationId,
                {
                  type: "READ",
                  conversationId,
                  readerId: userId,
                },
                userId,
              ); // exclude reader
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
  })(c, next);
};

// --- HELPER FUNCTIONS ---

async function handleSendMessage(senderId: string, payload: any, ws: any) {
  const { conversationId, content, tempId } = payload; // toUserId no longer needed

  const newMessage = new MessageInterface(
    randomUUIDv7(),
    conversationId,
    new MessageContentInterface(content, "text"),
    [],
    senderId,
  );

  const savedMsg = MessageRepository.create(newMessage);
  if (!savedMsg) return;

  const senderProfile = UserRepository.findProfileById(senderId);

  const eventPayload = {
    type: "NEW_MESSAGE",
    message: {
      ...savedMsg,
      sender: senderProfile,
    },
  };

  // Broadcast to ALL participants except sender
  forwardToConversation(conversationId, eventPayload, senderId);

  // Send ACK to sender for optimistic UI
  ws.send(
    JSON.stringify({
      type: "ACK",
      tempId,
      message: eventPayload.message,
    }),
  );
}

async function handleEditMessage(senderId: string, payload: any) {
  const { messageId, newContent } = payload;
  const updatedMsg = MessageRepository.updateContent(
    messageId,
    new MessageContentInterface(newContent, "text"),
  );

  if (updatedMsg) {
    const event = { type: "MESSAGE_UPDATED", message: updatedMsg };
    forwardToConversation(updatedMsg.conversationId, event, senderId);
  }
}

async function handleReaction(senderId: string, payload: any) {
  const { messageId, reactionType } = payload;
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
    forwardToConversation(updatedMsg.conversationId, event, senderId);
  }
}

async function handleDeleteMessage(senderId: string, payload: any) {
  const { messageId } = payload;
  const msg = MessageRepository.findById(messageId);
  if (!msg) return;

  const success = MessageRepository.delete(messageId);
  if (success) {
    const event = { type: "MESSAGE_DELETED", messageId };
    forwardToConversation(msg.conversationId, event, senderId);
  }
}

export function forwardToUser(userId: string, data: any) {
  const socket = clients.get(userId);
  if (socket) {
    socket.send(JSON.stringify(data));
  }
}

function forwardToConversation(
  conversationId: string,
  data: any,
  excludeUserId?: string,
) {
  const conv = ConversationRepository.findById(conversationId);
  if (!conv) return;

  conv.participants.forEach((pid) => {
    if (excludeUserId && pid === excludeUserId) return;
    forwardToUser(pid, data);
  });
}
