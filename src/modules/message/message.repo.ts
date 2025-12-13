import { db } from "../../db";
import {
  MessageInterface,
  MessageContentInterface,
  MessageReactionInterface,
} from "./message.interface";

export class MessageRepository {
  // 1. Find All (Global - mostly for admin)
  static findAll(limit: number = 20, cursor?: string) {
    let sql = "SELECT * FROM message";
    const params: any = { $limit: limit };

    if (cursor) {
      // Pagination: Get messages older than the cursor
      sql += " WHERE createdAt < $cursor";
      params.$cursor = cursor;
    }

    sql += " ORDER BY createdAt ASC LIMIT $limit";

    const query = db.query(sql);
    const rows = query.all(params) as any[];
    return rows.map((row) => this.mapRowToModel(row));
  }

  // 2. Find All for a Specific Conversation (CRITICAL for Chat UI) 💬
  static findByConversationId(
    conversationId: string,
    limit: number = 50,
    cursor?: string,
  ) {
    let sql = "SELECT * FROM message WHERE conversationId = $convId";
    const params: any = {
      $convId: conversationId,
      $limit: limit,
    };

    if (cursor) {
      // Infinite Scroll: "Load messages older than this timestamp"
      sql += " AND createdAt < $cursor";
      params.$cursor = cursor;
    }

    // Sort Newest -> Oldest (Standard for fetching history)
    sql += " ORDER BY createdAt ASC LIMIT $limit";

    const query = db.query(sql);

    const rows = query.all(params) as any[];

    return rows.map((row) => this.mapRowToModel(row));
  }

  // 3. Find One
  static findById(id: string) {
    const query = db.query("SELECT * FROM message WHERE id = $id");
    const row = query.get({ $id: id }) as any;
    if (!row) return null;
    return this.mapRowToModel(row);
  }

  // 4. Create Message
  static create(message: MessageInterface) {
    const query = db.query(`
      INSERT INTO message (id, conversationId, content, reaction, senderId, createdAt, updatedAt)
      VALUES ($id, $conversationId, $content, $reaction, $senderId, $now, $now)
      RETURNING *
    `);

    // Use query.get() to receive the single inserted row
    const row = query.get({
      $id: message.id,
      $conversationId: message.conversationId,
      // Serialize Objects to JSON Strings 📦
      $content: message.content.toJsonString(),
      $reaction: MessageReactionInterface.arrayToJsonString(message.reaction),
      $senderId: message.senderId,
      $now: new Date().toISOString(),
    }) as any;

    return row ? this.mapRowToModel(row) : null;
  }

  // 5. Update Message Content (Edit) ✏️
  static updateContent(id: string, newContent: MessageContentInterface) {
    const query = db.query(`
      UPDATE message 
      SET content = $content, updatedAt = $now 
      WHERE id = $id
      RETURNING *
    `);

    const row = query.get({
      $id: id,
      $content: newContent.toJsonString(), // 📦 Re-pack the object
      $now: new Date().toISOString(),
    }) as any;

    return row ? this.mapRowToModel(row) : null;
  }

  // 6. Update Reactions (The "Set" Approach) 👍
  // Usage: Get the message -> Modify array in JS -> Pass new array here
  static updateReactions(id: string, reactions: MessageReactionInterface[]) {
    const query = db.query(`
      UPDATE message 
      SET reaction = $reaction, updatedAt = $now 
      WHERE id = $id
      RETURNING *
    `);

    const row = query.get({
      $id: id,
      // 📦 Pack the Array of Objects back into a String
      $reaction: MessageReactionInterface.arrayToJsonString(reactions),
      $now: new Date().toISOString(),
    }) as any;

    return row ? this.mapRowToModel(row) : null;
  }

  // 7. Delete Message (Hard Delete) 🗑️
  static delete(id: string): boolean {
    const query = db.query("DELETE FROM message WHERE id = $id");
    const result = query.run({ $id: id });

    // changes > 0 means a row was actually deleted
    return result.changes > 0;
  }

  // ---------------------------------------------------------
  // 🔧 THE HYDRATOR (Row -> Class Instance)
  // ---------------------------------------------------------
  private static mapRowToModel(row: any): MessageInterface {
    // 1. Unpack Content 📦
    // We use the static helper we made earlier
    let content: MessageContentInterface;
    try {
      content = MessageContentInterface.fromJsonString(row.content);
    } catch {
      // Safety Fallback: If DB data is corrupted, don't crash the app
      console.warn(`⚠️ Corrupt content for msg ${row.id}`);
      content = new MessageContentInterface("Error loading message", "text");
    }

    // 2. Unpack Reactions 📦
    // We use the static array helper
    const reactions = MessageReactionInterface.arrayFromJsonString(
      row.reaction,
    );

    // 3. Return the clean Class Instance
    return new MessageInterface(
      row.id,
      row.conversationId,
      content,
      reactions,
      row.senderId,
      row.createdAt,
      row.updatedAt,
    );
  }
}
