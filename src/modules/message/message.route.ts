import { Context, Hono } from "hono";
import { MessageRepository } from "./message.repo";

const messageApp = new Hono();

messageApp.get("/:conversationId", async (c: Context) => {
  const conversationId = c.req.param("conversationId");
  const limit = Number(c.req.query("limit")) || 50;
  const cursor = c.req.query("cursor");

  const messages = MessageRepository.findByConversationId(
    conversationId,
    limit,
    cursor
  );

  return c.json({
    data: messages,
    nextCursor: messages.length > 0 
      ? messages[messages.length - 1].createdAt 
      : null,
  });
});

export default messageApp;
