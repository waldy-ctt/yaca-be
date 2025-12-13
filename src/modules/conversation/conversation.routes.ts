// src/modules/conversation/conversation.routes.ts

import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth";
import { ConversationRepository } from "./conversation.repo";
import { ConversationInterface } from "./conversation.interface";
import { MessageRepository } from "../message/message.repo";
import { MessageInterface, MessageContentInterface } from "../message/message.interface";
import { UserRepository } from "../user/user.repo";
import { randomUUIDv7 } from "bun";
import { formatParticipantNames } from "../../lib/util";
import { forwardToUser } from "../../ws/ws.handler";

const conversationApp = new Hono();

conversationApp.use("*", authMiddleware);

// ✅ Get all conversations for current user
conversationApp.get("/user/:userId", (c) => {
  const userId = c.req.param("userId");
  const currentUserId = c.get("userId");

  // Security: Users can only fetch their own conversations
  if (userId !== currentUserId) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  const conversations = ConversationRepository.findAllByUserId(userId);

  console.log(`📋 Found ${conversations.length} conversations for user ${userId}`);

  return c.json(conversations);
});

// ✅ Get single conversation by ID
conversationApp.get("/:conversationId", (c) => {
  const conversationId = c.req.param("conversationId");
  const currentUserId = c.get("userId");

  const conversation = ConversationRepository.findById(conversationId, currentUserId);

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Check authorization
  if (!conversation.participants.includes(currentUserId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  console.log(`🔍 Retrieved conversation ${conversationId} for user ${currentUserId}`);

  return c.json(conversation);
});

// ✅ Create new conversation (or get existing one)
conversationApp.post("/", async (c) => {
  const senderId = c.get("userId");
  const body = await c.req.json();

  const { recipientId, content, participants } = body;

  // Validate input
  if (!recipientId && !participants) {
    return c.json({ error: "recipientId or participants required" }, 400);
  }

  if (!content || typeof content !== "string" || !content.trim()) {
    return c.json({ error: "content required" }, 400);
  }

  // Determine participants
  let participantIds: string[];
  if (participants && Array.isArray(participants)) {
    participantIds = participants;
  } else {
    participantIds = [senderId, recipientId];
  }

  // Remove duplicates and ensure sender is included
  participantIds = Array.from(new Set(participantIds));
  if (!participantIds.includes(senderId)) {
    participantIds.push(senderId);
  }

  console.log(`🔍 Checking for existing conversation with participants:`, participantIds);

  // Check if conversation already exists
  let conversation = ConversationRepository.findConversationByParticipants(participantIds);

  if (conversation) {
    console.log(`✅ Found existing conversation: ${conversation.id}`);

    // Send message to existing conversation
    const messageId = randomUUIDv7();
    const newMessage = new MessageInterface(
      messageId,
      conversation.id,
      new MessageContentInterface(content, "text"),
      [],
      senderId
    );

    const savedMsg = MessageRepository.create(newMessage);
    if (!savedMsg) {
      return c.json({ error: "Failed to create message" }, 500);
    }

    // Update last message
    const lastMessageJson = JSON.stringify({
      content: content,
      type: "text"
    });
    
    ConversationRepository.updateLastMessage(
      conversation.id,
      lastMessageJson,
      savedMsg.createdAt!
    );

    // Broadcast new message
    const senderProfile = UserRepository.findProfileById(senderId);
    conversation.participants.forEach((pid) => {
      if (pid !== senderId) {
        forwardToUser(pid, {
          type: "NEW_MESSAGE",
          message: {
            ...savedMsg,
            senderName: senderProfile?.name,
            senderAvatar: senderProfile?.avatar,
          },
        });
      }
    });

    // Return the existing conversation with the new message
    return c.json({
      ...conversation,
      lastMessage: lastMessageJson,
      lastMessageTimestamp: savedMsg.createdAt,
    }, 200);
  }

  // Create new conversation
  console.log(`➕ Creating new conversation`);

  const conversationId = randomUUIDv7();
  
  // Get participant names for conversation name
  const participantNames = UserRepository.findNamesByUserIds(
    participantIds.filter(id => id !== senderId)
  );
  
  const conversationName = participantIds.length === 2
    ? participantNames[0]?.name || "Unknown User"
    : formatParticipantNames(participantNames.map(p => p.name));

  // Get avatar for 1-on-1 chats
  let avatar: string | null = null;
  if (participantIds.length === 2) {
    const otherUserId = participantIds.find(id => id !== senderId);
    if (otherUserId) {
      const otherUser = UserRepository.findProfileById(otherUserId);
      avatar = otherUser?.avatar || null;
    }
  }

  const newConversation = new ConversationInterface(
    conversationId,
    participantIds,
    avatar,
    conversationName,
    JSON.stringify({ content, type: "text" }),
    new Date().toISOString(),
    []
  );

  const savedConv = ConversationRepository.create(newConversation);
  if (!savedConv) {
    return c.json({ error: "Failed to create conversation" }, 500);
  }

  // Create first message
  const messageId = randomUUIDv7();
  const firstMessage = new MessageInterface(
    messageId,
    conversationId,
    new MessageContentInterface(content, "text"),
    [],
    senderId
  );

  const savedMsg = MessageRepository.create(firstMessage);
  if (!savedMsg) {
    return c.json({ error: "Failed to create first message" }, 500);
  }

  // Update conversation with first message timestamp
  ConversationRepository.updateLastMessage(
    conversationId,
    JSON.stringify({ content, type: "text" }),
    savedMsg.createdAt!
  );

  console.log(`✅ Created new conversation ${conversationId} with ${participantIds.length} participants`);

  // Broadcast to all participants except sender
  const senderProfile = UserRepository.findProfileById(senderId);
  participantIds.forEach((pid) => {
    if (pid !== senderId) {
      forwardToUser(pid, {
        type: "NEW_MESSAGE",
        message: {
          ...savedMsg,
          senderName: senderProfile?.name,
          senderAvatar: senderProfile?.avatar,
        },
      });
    }
  });

  return c.json(savedConv, 201);
});

// ✅ Update conversation name
conversationApp.put("/:conversationId", async (c) => {
  const conversationId = c.req.param("conversationId");
  const userId = c.get("userId");
  const { name } = await c.req.json();

  if (!name || typeof name !== "string" || !name.trim()) {
    return c.json({ error: "Name is required" }, 400);
  }

  const conversation = ConversationRepository.findById(conversationId);

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  if (!conversation.participants.includes(userId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  // Update the conversation name
  const success = ConversationRepository.updateName(conversationId, name.trim());

  if (!success) {
    return c.json({ error: "Failed to update conversation name" }, 500);
  }

  console.log(`✏️ Updated conversation ${conversationId} name to: ${name}`);

  // Return updated conversation
  const updated = ConversationRepository.findById(conversationId, userId);
  return c.json(updated);
});

// ✅ Delete conversation
conversationApp.delete("/:conversationId", (c) => {
  const conversationId = c.req.param("conversationId");
  const userId = c.get("userId");

  const conversation = ConversationRepository.findById(conversationId);

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  // Check authorization
  if (!conversation.participants.includes(userId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  const success = ConversationRepository.delete(conversationId);

  if (!success) {
    return c.json({ error: "Failed to delete conversation" }, 500);
  }

  console.log(`🗑️ Deleted conversation ${conversationId} by user ${userId}`);

  return c.json({ success: true });
});

// ✅ Pin/Unpin conversation (optional feature)
conversationApp.put("/:conversationId/pin", async (c) => {
  const conversationId = c.req.param("conversationId");
  const userId = c.get("userId");

  const conversation = ConversationRepository.findById(conversationId);

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  if (!conversation.participants.includes(userId)) {
    return c.json({ error: "Not authorized" }, 403);
  }

  // Toggle pin status
  const isPinned = conversation.pinnedBy.includes(userId);
  
  if (isPinned) {
    conversation.pinnedBy = conversation.pinnedBy.filter(id => id !== userId);
  } else {
    conversation.pinnedBy.push(userId);
  }

  // Note: You'll need to add an update method to ConversationRepository
  // For now, this is just the structure

  return c.json({ success: true, pinned: !isPinned });
});

export default conversationApp;
