// src/modules/user/user.repo.ts
import { db } from "../../db";
import { removeAccents } from "../lib/util";
import { UserInterface } from "./user.interface";

export class UserRepository {
static findAll(
    limit: number = 20,
    cursor?: string,
    keyword?: string,
    withCurrentUser: boolean = false, // Default: Hide myself
    currentUserId?: string            // Required if you want to hide yourself
  ) {
    let sql = "SELECT id, username, email, name, avatar, status, createdAt FROM users";
    const params: any = { $limit: limit };
    const conditions: string[] = [];

    // 1. Keyword Search
    if (keyword) {
      const normKeyword = removeAccents(keyword);
      conditions.push("search_vector LIKE $keyword");
      params.$keyword = `%${normKeyword}%`;
    }

    // 2. Cursor Pagination
    if (cursor) {
      conditions.push("createdAt < $cursor");
      params.$cursor = cursor;
    }

    // 3. 🆕 Exclude Current User
    // Logic: If "withCurrentUser" is false AND we know who the current user is...
    if (!withCurrentUser && currentUserId) {
      conditions.push("id != $currentUserId");
      params.$currentUserId = currentUserId;
    }

    // Build WHERE Clause
    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    // Sort & Limit
    sql += " ORDER BY createdAt DESC LIMIT $limit";

    const query = db.query(sql);
    return query.all(params) as UserInterface[];
  }

  // 2. UPDATED CREATE LOGIC
  static create(user: UserInterface) {
    // A. Generate the Search Vector
    const rawData = `${user.name} ${user.username} ${user.email}`;
    const searchVector = removeAccents(rawData);

    // B. Insert including the new column
    const query = db.query(`
      INSERT INTO users (id, email, username, tel, name, password, createdAt, updatedAt, status, avatar, search_vector)
      VALUES ($id, $email, $username, $tel, $name, $pass, $now, $now, $status, $avatar, $vector)
      RETURNING *
    `);

    return query.get({
      $id: user.id,
      $email: user.email,
      $username: user.username,
      $tel: user.tel,
      $name: user.name,
      $pass: user.password,
      $now: new Date().toISOString(),
      $status: "online", // Default to online on signup if you want
      $avatar: null,
      $vector: searchVector, // <--- The magic sauce
    }) as UserInterface | null;
  }

  // Find by Email OR Username (Flexible Login)
  static findByIdentifier(identifier: string) {
    const query = db.query(
      "SELECT * FROM users WHERE email = $id OR username = $id",
    );
    return query.get({ $id: identifier }) as UserInterface | null;
  }

  static findProfileById(id: string) {
    const query = db.query(`
      SELECT id, username, name, avatar, status, lastSeen 
      FROM users WHERE id = $id
    `);
    return query.get({ $id: id }) as any;
  }

  static updateStatus(id: string, status: "online" | "offline") {
    const now = new Date().toISOString();
    db.run(
      `
      UPDATE users 
      SET status = $status, lastSeen = $now, updatedAt = $now 
      WHERE id = $id
    `,
      {
        $id: id,
        $status: status,
        $now: now,
      } as any,
    );
  }
}
