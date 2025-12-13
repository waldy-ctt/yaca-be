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

// ✅ Helper: Enrich message with sender info
function enrichMessage(msg: MessageInterface) {
  const sender = UserRepository.findProfileById(msg.senderId);
  return {
    ...msg,
    senderName: sender?.name,
    senderAvatar: sender?.avatar,
  };
}

// ✅ Helper: Enrich reactions with user names
function enrichReactions(reactions: MessageReactionInterface[]) {
  return reactions.map(r => {
    const user = UserRepository.findProfileById(r.sender);
    return {
      type: r.type,
      sender: r.sender,
      senderName: user?.name || "Unknown",
      senderAvatar: user?.avatar,
    };
  });
}

// Get messages for a conversation
messageApp.get("/conversation/:conversationId", (c) => {
  const convId = c.req.param("conversationId");
  const senderId = c.get("userId");
  const limit = Number(c.req.query("limit")) || 50;

  const conv = ConversationRepository.findById(convId);
  if (!conv || !conv.participants.includes(senderId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  const messages = MessageRepository.findByConversationId(convId, limit);
  const enrichedMessages = messages.map(enrichMessage);

  const nextCursor = messages.length > 0 
    ? messages[messages.length - 1].createdAt 
    : null;

  return c.json({ data: enrichedMessages, nextCursor });
});

// ✅ Get single message with enriched reaction data
messageApp.get("/:messageId", (c) => {
  const messageId = c.req.param("messageId");
  const senderId = c.get("userId");

  const message = MessageRepository.findById(messageId);
  
  if (!message) {
    return c.json({ error: "Message not found" }, 404);
  }

  const conv = ConversationRepository.findById(message.conversationId);
  if (!conv || !conv.participants.includes(senderId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  const sender = UserRepository.findProfileById(message.senderId);
  const enrichedReactions = enrichReactions(message.reaction);

  return c.json({
    ...message,
    senderName: sender?.name,
    senderAvatar: sender?.avatar,
    reaction: enrichedReactions, // ✅ Now includes user names
  });
});

// Send a new message
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

  const lastMessageJson = JSON.stringify({
    content: content,
    type: "text"
  });
  
  ConversationRepository.updateLastMessage(
    conversationId, 
    lastMessageJson,
    saved.createdAt!
  );

  const enrichedMessage = enrichMessage(saved);

  conv.participants.forEach((pid) => {
    if (pid !== senderId) {
      forwardToUser(pid, {
        type: "NEW_MESSAGE",
        message: enrichedMessage,
      });
    }
  });

  return c.json(saved, 201);
});

// ✅ Add/Toggle reaction with enriched broadcast
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

  const conv = ConversationRepository.findById(message.conversationId);
  if (!conv || !conv.participants.includes(senderId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  // Toggle reaction
  const existingIdx = message.reaction.findIndex(r => r.sender === senderId);
  
  if (existingIdx > -1) {
    if (message.reaction[existingIdx].type === reactionType) {
      message.reaction.splice(existingIdx, 1);
      console.log(`🗑️ Removed ${reactionType} from user ${senderId}`);
    } else {
      message.reaction[existingIdx] = new MessageReactionInterface(
        reactionType as "like" | "heart" | "laugh", 
        senderId
      );
      console.log(`🔄 Changed reaction to ${reactionType} for user ${senderId}`);
    }
  } else {
    message.reaction.push(
      new MessageReactionInterface(
        reactionType as "like" | "heart" | "laugh", 
        senderId
      )
    );
    console.log(`➕ Added ${reactionType} from user ${senderId}`);
  }

  const updated = MessageRepository.updateReactions(messageId, message.reaction);
  
  if (!updated) {
    return c.json({ error: "Failed to update reactions" }, 500);
  }

  // ✅ Broadcast with enriched data
  const enrichedMessage = enrichMessage(updated);

  conv.participants.forEach((pid) => {
    forwardToUser(pid, {
      type: "MESSAGE_UPDATED",
      message: enrichedMessage,
    });
  });

  return c.json(updated);
});

// Delete message
messageApp.delete("/:messageId", async (c) => {
  const messageId = c.req.param("messageId");
  const senderId = c.get("userId");

  const message = MessageRepository.findById(messageId);
  if (!message) {
    return c.json({ error: "Message not found" }, 404);
  }

  if (message.senderId !== senderId) {
    return c.json({ error: "You can only delete your own messages" }, 403);
  }

  const success = MessageRepository.delete(messageId);
  if (!success) {
    return c.json({ error: "Failed to delete message" }, 500);
  }

  console.log(`🗑️ Deleted message ${messageId}`);

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
