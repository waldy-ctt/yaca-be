// src/modules/conversation/conversation.routes.ts
import { Context, Hono } from "hono";
import { randomUUIDv7 } from "bun";
import { ConversationRepository } from "./conversation.repo";
import {
  MessageContentInterface,
  MessageInterface,
} from "../message/message.interface";
import { ConversationInterface } from "./conversation.interface";
import { formatParticipantNames } from "../lib/util";
import { verify } from "hono/jwt";
import { JWT_SECRET } from "../user/user.routes";
import { UserRepository } from "../user/user.repo";
import { forwardToUser } from "../../ws/ws.handler";

const converstationApp = new Hono();

converstationApp.get("/", async (c: Context) => {
  const users = ConversationRepository.findAll();
  return c.json(users);
});

converstationApp.get("/users/", async (c: Context) => {
  const userId = c.req.param("userId");
  const token = c.req.header("Authorization");
  let currentUserId: string;
  if (token) {
    const payload = await verify(token, JWT_SECRET);
    currentUserId = payload.id as string;

    return c.json(
      !!ConversationRepository.findConversationByParticipants([
        userId,
        currentUserId,
      ]),
    );
  }
});

converstationApp.post("/", async (c: Context) => {
  const { initMessage, senderId, participants, name, avatar } = await c.req.json();

  const conversationId: string = randomUUIDv7();

  // 1. Create the Message Object
  const message = new MessageInterface(
    randomUUIDv7(),
    conversationId,
    new MessageContentInterface(initMessage.content, initMessage.type),
    [],
    senderId,
  );

  // 2. Create the Conversation (DB)
  const newConversation = new ConversationInterface(
    conversationId,
    participants, // e.g. ["userA", "userB"]
    avatar ?? null,
    name ?? formatParticipantNames(participants), // You might want to resolve names here
    message.content.toJsonString(), // Store last message preview
    message.createdAt ?? new Date().toISOString(),
    [],
  );

  const savedConv = ConversationRepository.create(newConversation);
  
  // 3. Save the Initial Message (DB) - Don't forget this!
  // Your previous code missed saving the actual message to the message table!
  // (Assuming you have MessageRepository available, or add logic here)
  // MessageRepository.create(message); <-- Add this if needed

  // -----------------------------------------------------
  // 🚀 REAL-TIME MAGIC: Notify Recipients
  // -----------------------------------------------------
  
  // Prepare the WS Payload
  // We send a "NEW_CONVERSATION" event so the frontend knows to add it to the top of the list
  const wsPayload = {
    type: "NEW_CONVERSATION",
    conversation: savedConv,
    // Optional: Include the hydration (sender profile) if your UI needs it
    sender: UserRepository.findProfileById(senderId)
  };

  // Loop through participants and notify everyone (except sender)
  participants.forEach((pId: string) => {
    if (pId !== senderId) {
      forwardToUser(pId, wsPayload);
    }
  });

  return c.json(savedConv);
});

export default converstationApp;
