// src/modules/conversation/conversation.routes.ts

import { Hono } from "hono";
import { randomUUIDv7 } from "bun";
import { ConversationRepository } from "./conversation.repo";
import { UserRepository } from "../user/user.repo";
import { formatParticipantNames } from "../../lib/util";
import { forwardToUser } from "../../ws/ws.handler";
import { authMiddleware } from "../../middleware/auth"; // ← we'll create this next
import { validateCreateConversation } from "../../lib/validation";
import { ConversationInterface } from "./conversation.interface";

const conversationApp = new Hono();

// Apply auth to all routes
conversationApp.use("*", authMiddleware);

// GET all conversations (for debugging — remove or protect later)
// conversationApp.get("/", (c) => {
//   const conversations = ConversationRepository.findAll();
//   return c.json(conversations);
// });

// GET single conversation
conversationApp.get("/:conversationId", (c) => {
  const id = c.req.param("conversationId");
  const conv = ConversationRepository.findById(id);
  if (!conv) return c.json({ error: "Not found" }, 404);
  return c.json(conv);
});

// GET conversations for a user
conversationApp.get("/user/:userId", (c) => {
  const userId = c.req.param("userId");
  const conversations = ConversationRepository.findAllByUserId(userId);
  return c.json(conversations);
});

// GET or find existing conversation between users
conversationApp.get("/users/:userId", (c) => {
  const targetId = c.req.param("userId");
  const currentUserId = c.get("userId"); // from auth

  const conv = ConversationRepository.findConversationByParticipants([
    currentUserId,
    targetId,
  ]);

  if (!conv) return c.json(null);
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
  const existing =
    ConversationRepository.findConversationByParticipants(participants);
  if (existing) {
    return c.json(existing);
  }

  // Generate name from participant names
  const names = UserRepository.findNamesByUserIds(participants).map(
    (u) => u.name,
  );
  const name = body.name || formatParticipantNames(names);

  const convId = randomUUIDv7();

  const newConv = new ConversationInterface(
    convId,
    participants,
    body.avatar ?? null,
    name,
    "", // no last message yet
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
