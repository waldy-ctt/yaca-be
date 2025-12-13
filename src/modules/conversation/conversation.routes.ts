// src/modules/conversation/conversation.routes.ts

import { Hono } from "hono";
import { randomUUIDv7 } from "bun";
import { ConversationRepository } from "./conversation.repo";
import { UserRepository } from "../user/user.repo";
import { formatParticipantNames } from "../../lib/util";
import { forwardToUser } from "../../ws/ws.handler";
import { authMiddleware } from "../../middleware/auth";
import { validateCreateConversation } from "../../lib/validation";
import { ConversationInterface } from "./conversation.interface";

const conversationApp = new Hono();

// Apply auth to all routes
conversationApp.use("*", authMiddleware);

// ✅ UPDATED: Get single conversation with dynamic name
conversationApp.get("/:conversationId", (c) => {
  const id = c.req.param("conversationId");
  const currentUserId = c.get("userId"); // Get current user from auth
  
  const conv = ConversationRepository.findById(id, currentUserId);
  if (!conv) return c.json({ error: "Not found" }, 404);
  
  return c.json(conv);
});

// ✅ ALREADY CORRECT: This uses findAllByUserId which handles dynamic names
conversationApp.get("/user/:userId", (c) => {
  const userId = c.req.param("userId");
  const conversations = ConversationRepository.findAllByUserId(userId);
  return c.json(conversations);
});

// ✅ UPDATED: Get or find existing conversation with dynamic name
conversationApp.get("/users/:userId", (c) => {
  const targetId = c.req.param("userId");
  const currentUserId = c.get("userId");

  const conv = ConversationRepository.findConversationByParticipants([
    currentUserId,
    targetId,
  ]);

  if (!conv) return c.json(null);
  
  // Apply dynamic naming for 1-on-1
  if (conv.participants.length === 2) {
    const otherUserId = conv.participants.find(id => id !== currentUserId);
    if (otherUserId) {
      const otherUser = UserRepository.findProfileById(otherUserId);
      conv.name = otherUser?.name || "Unknown User";
    }
  }
  
  return c.json(conv);
});

// DELETE conversation
conversationApp.delete("/:conversationId", (c) => {
  const id = c.req.param("conversationId");
  const success = ConversationRepository.delete(id);
  return c.json({ success });
});

// CREATE new conversation
conversationApp.post("/", async (c) => {
  const currentUserId = c.get("userId");

  const body = await c.req.json();
  const validation = validateCreateConversation(body);

  if (!validation.success) {
    return c.json({ error: "Invalid input", details: validation.errors }, 400);
  }

  const { participants } = validation.data;

  // Security: current user must be in participants
  if (!participants.includes(currentUserId)) {
    return c.json({ error: "You must be a participant" }, 400);
  }

  // Idempotent: return existing if already exists
  const existing = ConversationRepository.findConversationByParticipants(participants);
  if (existing) {
    // Apply dynamic naming before returning
    if (existing.participants.length === 2) {
      const otherUserId = existing.participants.find(id => id !== currentUserId);
      if (otherUserId) {
        const otherUser = UserRepository.findProfileById(otherUserId);
        existing.name = otherUser?.name || "Unknown User";
      }
    }
    return c.json(existing);
  }

  // Generate name from participant names
  const names = UserRepository.findNamesByUserIds(participants).map((u) => u.name);
  const name = body.name || formatParticipantNames(names);

  const convId = randomUUIDv7();

  const newConv = new ConversationInterface(
    convId,
    participants,
    body.avatar ?? null,
    name, // This will be the group name for 3+ participants
    "",
    new Date().toISOString(),
    [],
  );

  const saved = ConversationRepository.create(newConv);

  // Notify all participants except creator
  const payload = {
    type: "NEW_CONVERSATION",
    conversation: saved,
  };

  participants.forEach((pid) => {
    if (pid !== currentUserId) {
      forwardToUser(pid, payload);
    }
  });

  return c.json(saved, 201);
});

export default conversationApp;
