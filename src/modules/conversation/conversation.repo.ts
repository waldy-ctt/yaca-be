import { db } from "../../db";
import { ConversationInterface } from "./conversation.interface";
export class ConversationRepository {
  // 1. Find All
  static findAll(limit: number = 20, cursor?: string) {
    let sql = "SELECT * FROM conversations";
    const params: any = { $limit: limit };

    if (cursor) {
      sql += " WHERE updatedAt < $cursor";
      params.$cursor = cursor;
    }

    sql += " ORDER BY updatedAt DESC LIMIT $limit";

    const query = db.query(sql);
    const rows = query.all(params) as any[];

    return rows.map((row) => this.mapRowToModel(row));
  }

  // 2. Find One
  static findById(id: string) {
    const query = db.query("SELECT * FROM conversation WHERE id = $id");
    const row = query.get({ $id: id }) as any;

    if (!row) return null;
    return this.mapRowToModel(row);
  }

  // 3. Create
  static create(conv: ConversationInterface) {
    const query = db.query(`
      INSERT INTO conversation (id, participant, avatar, name, lastMessage, lastMessageTimestamp, pinnedBy, createdAt, updatedAt)
      VALUES ($id, $participant, $avatar, $name, $lastMessage, $now, $pinnedBy, $now, $now)
      RETURNING *
    `);

    const row = query.get({
      $id: conv.id,
      $participant: JSON.stringify(conv.participants),
      $avatar: conv.avatar,
      $name: conv.name,
      $lastMessage: conv.lastMessage,
      $pinnedBy: JSON.stringify(conv.pinnedBy),
      $now: new Date().toISOString(),
    }) as any;

    return this.mapRowToModel(row);
  }

  // ---------------------------------------------------------
  // 🔄 THE UPDATE METHODS
  // ---------------------------------------------------------

  // 4. Update Last Message
  static updateLastMessage(id: string, message: string, timestamp: string) {
    const query = db.query(`
      UPDATE conversation 
      SET lastMessage = $msg, 
          lastMessageTimestamp = $ts, 
          updatedAt = $now
      WHERE id = $id
      RETURNING *
    `);

    const row = query.get({
      $id: id,
      $msg: message,
      $ts: timestamp,
      $now: new Date().toISOString(),
    }) as any;

    return row ? this.mapRowToModel(row) : null;
  }

  // 5. Update Profile (Name or Avatar)
  static updateProfile(id: string, name?: string, avatar?: string) {
    if (name) {
      db.run(
        "UPDATE conversation SET name = $val, updatedAt = $now WHERE id = $id",
        {
          $val: name,
          $id: id,
          $now: new Date().toISOString(),
        } as any,
      );
    }
    if (avatar) {
      db.run(
        "UPDATE conversation SET avatar = $val, updatedAt = $now WHERE id = $id",
        {
          $val: avatar,
          $id: id,
          $now: new Date().toISOString(),
        } as any,
      );
    }
    return this.findById(id);
  }

  // 6. Add Participant
  static addParticipant(conversationId: string, userId: string) {
    const conv = this.findById(conversationId);
    if (!conv) return null;

    if (!conv.participants.includes(userId)) {
      conv.participants.push(userId);

      db.run(
        `UPDATE conversation SET participant = $list, updatedAt = $now WHERE id = $id`,
        {
          $id: conversationId,
          $list: JSON.stringify(conv.participants),
          $now: new Date().toISOString(),
        } as any,
      );
    }
    return this.findById(conversationId);
  }

  // 7. Remove Participant
  static removeParticipant(conversationId: string, userId: string) {
    const conv = this.findById(conversationId);
    if (!conv) return null;

    const newList = conv.participants.filter((p) => p !== userId);

    if (newList.length !== conv.participants.length) {
      db.run(
        `UPDATE conversation SET participant = $list, updatedAt = $now WHERE id = $id`,
        {
          $id: conversationId,
          $list: JSON.stringify(newList),
          $now: new Date().toISOString(),
        } as any,
      );
    }
    return this.findById(conversationId);
  }

  // 8. Delete conversation (Hard Delete)
  static delete(id: string): boolean {
    const query = db.query("DELETE FROM conversation WHERE id = $id");
    const result = query.run({ $id: id });
    return result.changes > 0;
  }

  // --- Helper ---
  private static mapRowToModel(row: any): ConversationInterface {
    let participants = [];
    let pinnedBy = [];

    try {
      participants = JSON.parse(row.participant || "[]");
    } catch {
      participants = [];
    }

    try {
      pinnedBy = JSON.parse(row.pinnedBy || "[]");
    } catch {
      pinnedBy = [];
    }

    return new ConversationInterface(
      row.id,
      participants,
      row.avatar,
      row.name,
      row.lastMessage,
      row.lastMessageTimestamp,
      pinnedBy,
      row.updatedAt,
      row.createdAt,
    );
  }
}
