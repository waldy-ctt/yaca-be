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
        clients.set(userId, ws);
        UserRepository.updateStatus(userId, "online");
        console.log(`✅ User ${userId} connected (online)`);
        console.log(`📊 Total connected clients: ${clients.size}`);

        broadcastStatusChange(userId, "online");
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
          console.log("📨 WS Data:", data);

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
              console.log(
                `⌨️ User ${userId} typing in conversation ${data.conversationId}`,
              );
              forwardToConversation(
                data.conversationId,
                {
                  type: "USER_TYPING",
                  conversationId: data.conversationId,
                  from: userId,
                },
                userId,
              );
              break;
            case "READ":
              const { conversationId } = data;
              const conv = ConversationRepository.findById(conversationId);
              if (!conv) {
                console.log(`   ❌ Conversation ${conversationId} not found`);
                break;
              }

              console.log(
                `   📡 Broadcasting READ to ${conv.participants.length} participants`,
              );

              conv.participants.forEach((pid) => {
                console.log(`      → Sending to participant ${pid}`);
                forwardToUser(pid, {
                  type: "READ",
                  conversationId,
                  readerId: userId,
                });
              });

              console.log(`   ✅ READ event broadcast complete`);
              break;
          }
        } catch (e) {
          console.error("WS Error:", e);
        }
      },

      onClose() {
        clients.delete(userId);
        UserRepository.updateStatus(userId, "offline");
        console.log(`❌ User ${userId} disconnected (offline)`);

        broadcastStatusChange(userId, "offline");
      },
    };
  })(c, next);
};

// --- HELPER FUNCTIONS ---

async function handleSendMessage(senderId: string, payload: any, ws: any) {
  const { destinationId, content, destinationType, tempId } = payload;

  console.log("📤 handleSendMessage:", { senderId, destinationId, tempId });

  if (destinationType === "conversation") {
    // ✅ Create message with actual ID
    const messageId = randomUUIDv7();
    const newMessage = new MessageInterface(
      messageId,
      destinationId,
      new MessageContentInterface(content.data, content.type),
      [],
      senderId,
    );

    const savedMsg = MessageRepository.create(newMessage);
    if (!savedMsg) {
      console.error("❌ Failed to save message");
      return;
    }

    console.log("✅ Message saved with ID:", savedMsg.id);

    // Update conversation last message
    const lastMessageJson = JSON.stringify({
      content: content.data,
      type: content.type,
    });

    ConversationRepository.updateLastMessage(
      destinationId,
      lastMessageJson,
      savedMsg.createdAt!,
    );

    // Get sender profile for enrichment
    const senderProfile = UserRepository.findProfileById(senderId);

    const enrichedMessage = {
      ...savedMsg,
      senderName: senderProfile?.name,
      senderAvatar: senderProfile?.avatar,
    };

    // ✅ FIX: Send ACK back to sender with correct structure
    console.log("📤 Sending ACK to sender:", { tempId, messageId: savedMsg.id });
    ws.send(
      JSON.stringify({
        type: "ACK",
        tempId: tempId,           // ✅ Frontend uses this to find optimistic message
        message: enrichedMessage,  // ✅ Complete message data
      }),
    );

    // Broadcast to other participants
    const eventPayload = {
      type: "NEW_MESSAGE",
      message: enrichedMessage,
    };

    forwardToConversation(destinationId, eventPayload, senderId);
  }
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

function broadcastStatusChange(userId: string, status: "online" | "offline") {
  const statusPayload = {
    type: "STATUS_CHANGE",
    userId,
    status,
  };

  console.log(`📡 Broadcasting status change: User ${userId} is now ${status}`);

  clients.forEach((socket, clientId) => {
    if (clientId !== userId) {
      socket.send(JSON.stringify(statusPayload));
    }
  });
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

  console.log(`📤 Broadcasting to conversation ${conversationId}:`, data.type);

  conv.participants.forEach((pid) => {
    if (excludeUserId && pid === excludeUserId) return;
    forwardToUser(pid, data);
  });
}
