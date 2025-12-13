// src/modules/message/message.repo.ts
// ← Full repo with all needed methods

import { db } from "../../db/setup";
import { MessageInterface, MessageContentInterface, MessageReactionInterface } from "./message.interface";

export class MessageRepository {
  private static queries = {
    findById: db.prepare("SELECT * FROM message WHERE id = ?"),
    findByConversationId: db.prepare(`
      SELECT * FROM message
      WHERE conversationId = ?
      ORDER BY createdAt DESC
      LIMIT ?
    `),
    insert: db.prepare(`
      INSERT INTO message (id, conversationId, content, reaction, senderId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `),
    updateContent: db.prepare(`
      UPDATE message SET content = ?, updatedAt = ?
      WHERE id = ?
      RETURNING *
    `),
    updateReactions: db.prepare(`
      UPDATE message SET reaction = ?, updatedAt = ?
      WHERE id = ?
      RETURNING *
    `),
    delete: db.prepare("DELETE FROM message WHERE id = ? RETURNING id"),
  };

  static findById(id: string): MessageInterface | null {
    const row = this.queries.findById.get(id);
    return row ? this.rowToModel(row) : null;
  }

  static findByConversationId(conversationId: string, limit = 50): MessageInterface[] {
    const rows = this.queries.findByConversationId.all(conversationId, limit);
    return rows.map(row => this.rowToModel(row));
  }

  static create(msg: MessageInterface): MessageInterface | null {
    const now = new Date().toISOString();
    const row = this.queries.insert.get(
      msg.id,
      msg.conversationId,
      msg.content.toJsonString(),
      JSON.stringify(msg.reaction),
      msg.senderId,
      now,
      now
    );
    return row ? this.rowToModel(row) : null;
  }

  static updateContent(id: string, newContent: MessageContentInterface): MessageInterface | null {
    const now = new Date().toISOString();
    const row = this.queries.updateContent.get(newContent.toJsonString(), now, id);
    return row ? this.rowToModel(row) : null;
  }

  static updateReactions(id: string, reactions: MessageReactionInterface[]): MessageInterface | null {
    const now = new Date().toISOString();
    const row = this.queries.updateReactions.get(JSON.stringify(reactions), now, id);
    return row ? this.rowToModel(row) : null;
  }

  static delete(id: string): boolean {
    const result = this.queries.delete.run(id);
    return result.changes > 0;
  }

  private static rowToModel(row: any): MessageInterface {
    return new MessageInterface(
      row.id,
      row.conversationId,
      MessageContentInterface.fromJsonString(row.content),
      JSON.parse(row.reaction || "[]"),
      row.senderId,
      row.createdAt,
      row.updatedAt
    );
  }
}
