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

const converstationApp = new Hono();

converstationApp.get("/", async (c: Context) => {
  const users = ConversationRepository.findAll();
  return c.json(users);
});

converstationApp.post("/", async (c: Context) => {
  const { initMessage, senderId, participants, name, avatar } =
    await c.req.json();

  const conversationId: string = randomUUIDv7();

  const message = new MessageInterface(
    randomUUIDv7(),
    conversationId,
    new MessageContentInterface(initMessage.content, initMessage.type),
    [],
    senderId,
  );

  const result = ConversationRepository.create(
    new ConversationInterface(
      conversationId,
      participants,
      avatar ?? null,
      name ?? formatParticipantNames(participants),
      message.id,
      message.createdAt ?? new Date().toISOString(),
      [],
    ),
  );

  return c.json(result);
});

export default converstationApp;
