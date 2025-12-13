// src/modules/message/message.routes.ts

import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth";
import { validateSendMessage } from "../../lib/validation";
import { randomUUIDv7 } from "bun";
import { forwardToUser } from "../../ws/ws.handler";
import { UserRepository } from "../user/user.repo";
import { ConversationRepository } from "../conversation/conversation.repo";
import { MessageInterface, MessageContentInterface, MessageReactionInterface } from "../message/message.interface";
import { MessageRepository } from "../message/message.repo";

const messageApp = new Hono();

messageApp.use("*", authMiddleware);

// Get messages for a conversation
messageApp.get("/conversation/:conversationId", (c) => {
  const convId = c.req.param("conversationId");
  const limit = Number(c.req.query("limit")) || 50;
  const cursor = c.req.query("cursor");

  const messages = MessageRepository.findByConversationId(convId, limit, cursor);

  const nextCursor = messages.length > 0 ? messages[messages.length - 1].createdAt : null;

  return c.json({ data: messages, nextCursor });
});

// Get single message by ID (for detail view)
messageApp.get("/:messageId", (c) => {
  const messageId = c.req.param("messageId");
  const senderId = c.get("userId");

  const message = MessageRepository.findById(messageId);
  
  if (!message) {
    return c.json({ error: "Message not found" }, 404);
  }

  // Check if user is part of the conversation
  const conv = ConversationRepository.findById(message.conversationId);
  if (!conv || !conv.participants.includes(senderId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  // Get sender info
  const sender = UserRepository.findProfileById(message.senderId);

  return c.json({
    ...message,
    senderName: sender?.name,
    senderAvatar: sender?.avatar,
  });
});

// Send a message
messageApp.post("/", async (c) => {
  const senderId = c.get("userId");
  const body = await c.req.json();

  const validation = validateSendMessage(body);
  if (!validation.success) {
    return c.json({ error: "Invalid input", details: validation.errors }, 400);
  }

  const { conversationId, content, tempId } = validation.data;

  const conv = ConversationRepository.findById(conversationId);
  if (!conv || !conv.participants.includes(senderId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  const messageId = randomUUIDv7();
  const newMessage = new MessageInterface(
    messageId,
    conversationId,
    new MessageContentInterface(content, "text"),
    [],
    senderId
  );

  const saved = MessageRepository.create(newMessage);

  const lastMessageJson = JSON.stringify({
    content: content,
    type: "text"
  });
  
  ConversationRepository.updateLastMessage(
    conversationId, 
    lastMessageJson,
    saved.createdAt
  );

  const senderProfile = UserRepository.findProfileById(senderId);
  const payload = {
    type: "NEW_MESSAGE",
    message: { ...saved, sender: senderProfile },
  };

  conv.participants.forEach((pid) => {
    if (pid !== senderId) forwardToUser(pid, payload);
  });

  return c.json(saved, 201);
});

// ✅ NEW: Add reaction to message
messageApp.post("/:messageId/reactions", async (c) => {
  const messageId = c.req.param("messageId");
  const senderId = c.get("userId");
  const { reactionType } = await c.req.json();

  if (!["like", "heart", "laugh"].includes(reactionType)) {
    return c.json({ error: "Invalid reaction type" }, 400);
  }

  const message = MessageRepository.findById(messageId);
  if (!message) {
    return c.json({ error: "Message not found" }, 404);
  }

  // Check authorization
  const conv = ConversationRepository.findById(message.conversationId);
  if (!conv || !conv.participants.includes(senderId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  // Toggle reaction
  const existingIdx = message.reaction.findIndex(r => r.sender === senderId);
  
  if (existingIdx > -1) {
    // Remove if same reaction, update if different
    if (message.reaction[existingIdx].type === reactionType) {
      message.reaction.splice(existingIdx, 1);
    } else {
      message.reaction[existingIdx] = new MessageReactionInterface(reactionType as any, senderId);
    }
  } else {
    message.reaction.push(new MessageReactionInterface(reactionType as any, senderId));
  }

  const updated = MessageRepository.updateReactions(messageId, message.reaction);

  // Broadcast to all participants
  conv.participants.forEach((pid) => {
    forwardToUser(pid, {
      type: "MESSAGE_UPDATED",
      message: updated,
    });
  });

  return c.json(updated);
});

// ✅ NEW: Delete message
messageApp.delete("/:messageId", async (c) => {
  const messageId = c.req.param("messageId");
  const senderId = c.get("userId");

  const message = MessageRepository.findById(messageId);
  if (!message) {
    return c.json({ error: "Message not found" }, 404);
  }

  // Only sender can delete their own message
  if (message.senderId !== senderId) {
    return c.json({ error: "You can only delete your own messages" }, 403);
  }

  const success = MessageRepository.delete(messageId);
  if (!success) {
    return c.json({ error: "Failed to delete message" }, 500);
  }

  // Broadcast deletion to all participants
  const conv = ConversationRepository.findById(message.conversationId);
  if (conv) {
    conv.participants.forEach((pid) => {
      forwardToUser(pid, {
        type: "MESSAGE_DELETED",
        messageId,
        conversationId: message.conversationId,
      });
    });
  }

  return c.json({ success: true });
});

export default messageApp;
