import { Context, Hono } from "hono";
import { MessageRepository } from "./message.repo";
import { MessageContentInterface, MessageInterface } from "./message.interface";
import { randomUUIDv7 } from "bun";

const messageApp = new Hono();

// Get all message  TODO: make this paging or somewhat for performance wise
messageApp.get('/', async (c: Context) => {
  const messages = MessageRepository.findAll();
  return c.json(messages);
})

messageApp.post('/conversation/:conversationId', async (c: Context) => {
  const conversationId: string = c.req.param('conversationId');
  const { senderId, content } = await c.req.json();
  
  const result = MessageRepository.create(
    new MessageInterface(
      randomUUIDv7(),
      conversationId,
      MessageContentInterface.fromJsonString(content),
      senderId,
      new Date().toISOString(),
      new Date().toISOString()
    )
  )
})
