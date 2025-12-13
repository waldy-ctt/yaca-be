// src/modules/conversation/conversation.repo.ts

import { db } from "../../db/setup";
import { ConversationInterface } from "./conversation.interface";

export class ConversationRepository {
  private static findByIdStmt = db.prepare("SELECT * FROM conversations WHERE id = ?");
  private static findAllByUserStmt = db.prepare(`
    SELECT c.* FROM conversations c
    WHERE c.participants LIKE ?
    ORDER BY c.lastMessageTimestamp DESC NULLS LAST, c.updatedAt DESC
    LIMIT ?
  `);

  static findById(id: string): ConversationInterface | null {
    const row = this.findByIdStmt.get(id) as any;
    return row ? this.rowToConversation(row) : null;
  }

  static findAllByUserId(userId: string, limit = 50): ConversationInterface[] {
    const rows = this.findAllByUserStmt.all(`%${userId}%`, limit) as any[];
    return rows.map(row => this.rowToConversation(row));
  }

  static findConversationByParticipants(participantIds: string[]): ConversationInterface | null {
    if (participantIds.length === 0) return null;

    // Build pattern: must contain ALL participant IDs
    const patterns = participantIds.map(id => `%${id}%`);
    const placeholders = patterns.map(() => "participants LIKE ?").join(" AND ");

    const stmt = db.prepare(`SELECT * FROM conversations WHERE ${placeholders}`);
    const rows = stmt.all(...patterns) as any[];

    for (const row of rows) {
      const participants = JSON.parse(row.participants);
      if (participantIds.every(id => participants.includes(id)) &&
          participants.length === participantIds.length) {
        return this.rowToConversation(row);
      }
    }
    return null;
  }

  static create(conv: ConversationInterface): ConversationInterface {
    const stmt = db.prepare(`
      INSERT INTO conversations (
        id, participants, avatar, name, lastMessage, lastMessageTimestamp, pinnedBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const row = stmt.get(
      conv.id,
      JSON.stringify(conv.participants),
      conv.avatar,
      conv.name,
      conv.lastMessage,
      conv.lastMessageTimestamp,
      JSON.stringify(conv.pinnedBy),
      new Date().toISOString(),
      new Date().toISOString()
    ) as any;

    return this.rowToConversation(row);
  }

  static updateLastMessage(id: string, message: string, timestamp: string): void {
    db.prepare(`
      UPDATE conversations 
      SET lastMessage = ?, lastMessageTimestamp = ?, updatedAt = ?
      WHERE id = ?
    `).run(message, timestamp, new Date().toISOString(), id);
  }

  static delete(id: string): boolean {
    const result = db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // Helper: convert DB row → domain object
  private static rowToConversation(row: any): ConversationInterface {
    return new ConversationInterface(
      row.id,
      JSON.parse(row.participants || "[]"),
      row.avatar,
      row.name,
      row.lastMessage || "",
      row.lastMessageTimestamp || new Date().toISOString(),
      JSON.parse(row.pinnedBy || "[]"),
      row.updatedAt,
      row.createdAt
    );
  }
}
