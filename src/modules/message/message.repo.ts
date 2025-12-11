// src/modules/message/message.repo.ts
import { db } from "../../db";
import { MessageInterface, MessageReactionInterface } from "./message.interface";

export class MessageRepository {
  static findAll() {
    const query = db.query("SELECT * name FROM message");
    return query.all() as MessageInterface[] | [];
  }

  static findById(id: string) {
    const query = db.query("SELECT * FROM message WHERE id = $id ");
    return query.get({ $id: id }) as MessageInterface | null;
  }

  static findByConversationId(conversationId: string) {
    const query = db.query(
      "SELECT * FROM message WHERE conversationId = $conversationId",
    );
    return query.get({ $conversationId: conversationId }) as
      | MessageInterface[]
      | null;
  }

  static create(message: MessageInterface) {
    const query = db.query(`
      INSERT INTO message (id, conversationId, content, reaction, senderId, createdAt, updatedAt)
      VALUES ($id, $conversationId, $content, $reaction, $senderId, $now, $now)
      RETURNING *
    `);

    return query.get({
      $id: message.id,
      $conversationId: message.conversationId,
      $content: message.content.toJsonString(),
      $reaction: MessageReactionInterface.arrayToJsonString(message.reaction),
      $senderId: message.senderId,
      $now: new Date().toISOString(),
    }) as MessageInterface | null;
  }
}
