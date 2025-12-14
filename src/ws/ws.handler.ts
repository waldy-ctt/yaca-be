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
import { ConversationRepository } from "../conversation/conversation.repo";

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
        console.log(`✅ User ${userId} connected | Total: ${clients.size}`);
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
              const conv = ConversationRepository.findById(data.conversationId);
              if (conv) {
                conv.participants.forEach((pid) => {
                  forwardToUser(pid, {
                    type: "READ",
                    conversationId: data.conversationId,
                    readerId: userId,
                  });
                });
              }
              break;
          }
        } catch (e) {
          console.error("❌ WS Error:", e);
        }
      },

      onClose() {
        clients.delete(userId);
        UserRepository.updateStatus(userId, "offline");
        console.log(`❌ User ${userId} disconnected | Total: ${clients.size}`);
        broadcastStatusChange(userId, "offline");
      },
    };
  })(c, next);
};

// --- HELPER FUNCTIONS ---

async function handleSendMessage(senderId: string, payload: any, ws: any) {
  const { destinationId, content, destinationType, tempId } = payload;

  if (destinationType === "conversation") {
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

    // Update conversation
    const lastMessageJson = JSON.stringify({
      content: content.data,
      type: content.type,
    });

    ConversationRepository.updateLastMessage(
      destinationId,
      lastMessageJson,
      savedMsg.createdAt!,
    );

    // Get sender profile
    const senderProfile = UserRepository.findProfileById(senderId);

    const enrichedMessage = {
      ...savedMsg,
      senderName: senderProfile?.name,
      senderAvatar: senderProfile?.avatar,
    };

    // ✅ Send ACK to sender
    ws.send(
      JSON.stringify({
        type: "ACK",
        tempId: tempId,
        message: enrichedMessage,
      }),
    );

    // Broadcast to others
    forwardToConversation(destinationId, {
      type: "NEW_MESSAGE",
      message: enrichedMessage,
    }, senderId);
  }
}

async function handleEditMessage(senderId: string, payload: any) {
  const { messageId, newContent } = payload;
  const updatedMsg = MessageRepository.updateContent(
    messageId,
    new MessageContentInterface(newContent, "text"),
  );

  if (updatedMsg) {
    forwardToConversation(updatedMsg.conversationId, {
      type: "MESSAGE_UPDATED",
      message: updatedMsg,
    }, senderId);
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
    forwardToConversation(updatedMsg.conversationId, {
      type: "MESSAGE_UPDATED",
      message: updatedMsg,
    }, senderId);
  }
}

async function handleDeleteMessage(senderId: string, payload: any) {
  const { messageId } = payload;
  const msg = MessageRepository.findById(messageId);
  if (!msg) return;

  const success = MessageRepository.delete(messageId);
  if (success) {
    forwardToConversation(msg.conversationId, {
      type: "MESSAGE_DELETED",
      messageId,
    }, senderId);
  }
}

function broadcastStatusChange(userId: string, status: "online" | "offline") {
  const statusPayload = {
    type: "STATUS_CHANGE",
    userId,
    status,
  };

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

  conv.participants.forEach((pid) => {
    if (excludeUserId && pid === excludeUserId) return;
    forwardToUser(pid, data);
  });
}
