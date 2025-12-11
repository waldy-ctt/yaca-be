// src/modules/conversation/conversation.repo.ts
import { db } from "../../db";
import { ConversationInterface } from "./conversation.interface";

export class ConversationRepository {
  static findAll() {
    const query = db.query("SELECT * name FROM conversation");
    return query.all() as ConversationInterface[] | [];
  }

  static findById(id: string) {
    const query = db.query("SELECT * FROM conversation WHERE id = $id ");
    return query.get({ $id: id }) as ConversationInterface | null;
  }

  static create(conversation: ConversationInterface) {
    const query = db.query(`
      INSERT INTO conversation (id, participant, avatar, name, lastMessage, lastMessageTimestamp, pinnedBy, createdAt, updatedAt)
      VALUES ($id, $participant, $avatar, $name, $lastMessage, $now, $pinnedBy, $now, $now)
      RETURNING *
    `);

    return query.get({
      $id: conversation.id,
      $participant: conversation.participant.toString(),
      $avatar: conversation.avatar,
      $name: conversation.name,
      $lastMessage: conversation.lastMessage,
      $pinnedBy: [].toString(),
      $now: new Date().toISOString(),
    }) as ConversationInterface | null;
  }
}
