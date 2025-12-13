// src/modules/message/message.routes.ts

import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth";
import { validateSendMessage } from "../../lib/validation";
import { MessageRepository } from "./message.repo";
import { randomUUIDv7 } from "bun";
import { 
  MessageInterface, 
  MessageContentInterface, 
  MessageReactionInterface 
} from "./message.interface";
import { forwardToUser } from "../../ws/ws.handler";
import { UserRepository } from "../user/user.repo";
import { ConversationRepository } from "../conversation/conversation.repo";

const messageApp = new Hono();

messageApp.use("*", authMiddleware);

// ✅ Get messages for a conversation (with pagination)
messageApp.get("/conversation/:conversationId", (c) => {
  const convId = c.req.param("conversationId");
  const senderId = c.get("userId");
  const limit = Number(c.req.query("limit")) || 50;

  // Check authorization
  const conv = ConversationRepository.findById(convId);
  if (!conv || !conv.participants.includes(senderId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  const messages = MessageRepository.findByConversationId(convId, limit);

  // Add sender info to each message
  const enrichedMessages = messages.map(msg => {
    const sender = UserRepository.findProfileById(msg.senderId);
    return {
      ...msg,
      senderName: sender?.name,
      senderAvatar: sender?.avatar,
    };
  });

  const nextCursor = messages.length > 0 
    ? messages[messages.length - 1].createdAt 
    : null;

  return c.json({ data: enrichedMessages, nextCursor });
});

// ✅ Get single message by ID (for detail view)
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

// ✅ Send a new message
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
  if (!saved) {
    return c.json({ error: "Failed to create message" }, 500);
  }

  // Update conversation's last message
  const lastMessageJson = JSON.stringify({
    content: content,
    type: "text"
  });
  
  ConversationRepository.updateLastMessage(
    conversationId, 
    lastMessageJson,
    saved.createdAt!
  );

  const senderProfile = UserRepository.findProfileById(senderId);
  const payload = {
    type: "NEW_MESSAGE",
    message: { 
      ...saved, 
      senderName: senderProfile?.name,
      senderAvatar: senderProfile?.avatar,
    },
  };

  // Broadcast to all participants except sender
  conv.participants.forEach((pid) => {
    if (pid !== senderId) forwardToUser(pid, payload);
  });

  return c.json(saved, 201);
});

// ✅ Add/Toggle reaction to message
messageApp.post("/:messageId/reactions", async (c) => {
  const messageId = c.req.param("messageId");
  const senderId = c.get("userId");
  const { reactionType } = await c.req.json();

  // Validate reaction type
  if (!["like", "heart", "laugh"].includes(reactionType)) {
    return c.json({ error: "Invalid reaction type. Must be: like, heart, or laugh" }, 400);
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

  // Toggle reaction logic
  const existingIdx = message.reaction.findIndex(r => r.sender === senderId);
  
  if (existingIdx > -1) {
    // User already reacted
    if (message.reaction[existingIdx].type === reactionType) {
      // Same reaction = remove it
      message.reaction.splice(existingIdx, 1);
      console.log(`🗑️ Removed ${reactionType} reaction from user ${senderId}`);
    } else {
      // Different reaction = update it
      message.reaction[existingIdx] = new MessageReactionInterface(
        reactionType as "like" | "heart" | "laugh", 
        senderId
      );
      console.log(`🔄 Updated reaction to ${reactionType} for user ${senderId}`);
    }
  } else {
    // New reaction
    message.reaction.push(
      new MessageReactionInterface(
        reactionType as "like" | "heart" | "laugh", 
        senderId
      )
    );
    console.log(`➕ Added ${reactionType} reaction from user ${senderId}`);
  }

  // Save to database
  const updated = MessageRepository.updateReactions(messageId, message.reaction);
  
  if (!updated) {
    return c.json({ error: "Failed to update reactions" }, 500);
  }

  // Broadcast to all participants
  const sender = UserRepository.findProfileById(senderId);
  const broadcastPayload = {
    type: "MESSAGE_UPDATED",
    message: {
      ...updated,
      senderName: sender?.name,
      senderAvatar: sender?.avatar,
    },
  };

  conv.participants.forEach((pid) => {
    forwardToUser(pid, broadcastPayload);
  });

  return c.json(updated);
});

// ✅ Delete message
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

  console.log(`🗑️ Deleted message ${messageId} by user ${senderId}`);

  // Broadcast deletion to all participants
  const conv = ConversationRepository.findById(message.conversationId);
  if (conv) {
    const deletePayload = {
      type: "MESSAGE_DELETED",
      messageId,
      conversationId: message.conversationId,
    };

    conv.participants.forEach((pid) => {
      forwardToUser(pid, deletePayload);
    });
  }

  return c.json({ success: true, message: "Message deleted successfully" });
});

// ✅ BONUS: Copy message text (optional, for analytics)
messageApp.get("/:messageId/copy", async (c) => {
  const messageId = c.req.param("messageId");
  const senderId = c.get("userId");

  const message = MessageRepository.findById(messageId);
  if (!message) {
    return c.json({ error: "Message not found" }, 404);
  }

  // Check authorization
  const conv = ConversationRepository.findById(message.conversationId);
  if (!conv || !conv.participants.includes(senderId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  // Just return the text content
  return c.json({ 
    text: message.content.content,
    copiedAt: new Date().toISOString() 
  });
});

export default messageApp;
