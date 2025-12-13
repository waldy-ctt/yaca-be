// src/modules/conversation/conversation.repo.ts

import { db } from "../../db/setup";
import { ConversationInterface } from "./conversation.interface";
import { UserRepository } from "../user/user.repo";

export class ConversationRepository {
  private static findByIdStmt = db.prepare("SELECT * FROM conversations WHERE id = ?");
  private static findAllByUserStmt = db.prepare(`
    SELECT c.* FROM conversations c
    WHERE c.participants LIKE ?
    ORDER BY c.lastMessageTimestamp DESC NULLS LAST, c.updatedAt DESC
    LIMIT ?
  `);

  static findById(id: string, currentUserId?: string): ConversationInterface | null {
    const row = this.findByIdStmt.get(id) as any;
    if (!row) return null;
    
    const conv = this.rowToConversation(row);
    
    if (currentUserId) {
      conv.name = this.getDynamicName(conv, currentUserId);
    }
    
    return conv;
  }

  // ✅ UPDATED: Include opponent status for 1-on-1 chats
  static findAllByUserId(userId: string, limit = 50): ConversationInterface[] {
    const rows = this.findAllByUserStmt.all(`%${userId}%`, limit) as any[];
    
    return rows.map(row => {
      const conv = this.rowToConversation(row);
      
      // Set dynamic name
      conv.name = this.getDynamicName(conv, userId);
      
      // ✅ NEW: For 1-on-1 chats, get opponent's status
      if (conv.participants.length === 2) {
        const otherUserId = conv.participants.find(id => id !== userId);
        if (otherUserId) {
          const otherUser = UserRepository.findProfileById(otherUserId);
          // Add status to the conversation object
          (conv as any).status = otherUser?.status || "offline";
          (conv as any).avatar = otherUser?.avatar || conv.avatar;
        }
      }
      
      return conv;
    });
  }

  static findConversationByParticipants(participantIds: string[]): ConversationInterface | null {
    if (participantIds.length === 0) return null;

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

  private static getDynamicName(conv: ConversationInterface, currentUserId: string): string {
    const participants = conv.participants;
    
    if (participants.length === 2) {
      const otherUserId = participants.find(id => id !== currentUserId);
      
      if (otherUserId) {
        const otherUser = UserRepository.findProfileById(otherUserId);
        return otherUser?.name || "Unknown User";
      }
    }
    
    return conv.name || "Group Chat";
  }

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
