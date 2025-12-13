// src/modules/message/message.routes.ts

import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth";
import { validateSendMessage } from "../../lib/validation";
import { MessageRepository } from "./message.repo";
import { randomUUIDv7 } from "bun";
import { MessageInterface, MessageContentInterface } from "./message.interface";
import { forwardToUser } from "../../ws/ws.handler";
import { UserRepository } from "../user/user.repo";
import { ConversationRepository } from "../conversation/conversation.repo";

const messageApp = new Hono();

messageApp.use("*", authMiddleware);

messageApp.get("/conversation/:conversationId", (c) => {
  const convId = c.req.param("conversationId");
  const limit = Number(c.req.query("limit")) || 50;
  const cursor = c.req.query("cursor");

  const messages = MessageRepository.findByConversationId(convId, limit, cursor);

  const nextCursor = messages.length > 0 ? messages[messages.length - 1].createdAt : null;

  return c.json({ data: messages, nextCursor });
});

messageApp.post("/", async (c) => {
  const senderId = c.get("userId");
  const body = await c.req.json();

  const validation = validateSendMessage(body);
  if (!validation.success) {
    return c.json({ error: "Invalid input", details: validation.errors }, 400);
  }

  const { conversationId, content, tempId } = validation.data;

  // Optional: verify user is in conversation
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
    lastMessageJson,  // Pass JSON string instead of plain text
    saved.createdAt
  );

  // Broadcast to all participants except sender
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

export default messageApp;
