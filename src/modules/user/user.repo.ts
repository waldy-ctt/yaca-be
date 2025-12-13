// src/modules/user/user.repo.ts
import { db } from "../../db/setup";
import { removeAccents } from "../../lib/util";
import { UserInterface } from "./user.interface";

export class UserRepository {
  static findUserByUserId(userId: string) {
    const query = db.query(
      "SELECT * FROM users WHERE id = $id"
    )
    return query.get({
      $id: userId
    }) as UserInterface | null;
  }

  static findNamesByUserIds(userIds: string[]) {
    if (userIds.length === 0) return [];

    const placeholders = userIds.map(() => "?").join(",");
    const query = db.query(
      `SELECT id, name FROM users WHERE id IN (${placeholders})`,
    );

    return query.all(...userIds) as { id: string; name: string }[];
  }

  static findAll(
    limit: number = 20,
    cursor?: string,
    keyword?: string,
    withCurrentUser: boolean = false,
    currentUserId?: string,
  ) {
    let sql =
      "SELECT id, username, email, name, avatar, status, createdAt FROM users";
    const params: any = { $limit: limit };
    const conditions: string[] = [];

    if (keyword) {
      const normKeyword = removeAccents(keyword);
      conditions.push("search_vector LIKE $keyword");
      params.$keyword = `%${normKeyword}%`;
    }

    if (cursor) {
      conditions.push("createdAt < $cursor");
      params.$cursor = cursor;
    }

    if (!withCurrentUser && currentUserId) {
      conditions.push("id != $currentUserId");
      params.$currentUserId = currentUserId;
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY createdAt DESC LIMIT $limit";

    const query = db.query(sql);
    return query.all(params) as UserInterface[];
  }

  static create(user: UserInterface) {
    const rawData = `${user.name} ${user.username} ${user.email}`;
    const searchVector = removeAccents(rawData);

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
      $status: "online",
      $avatar: null,
      $vector: searchVector,
    }) as UserInterface | null;
  }

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

  static getStatus(id: string): "online" | "offline" | "sleep" | "dnd" {
    const query = db.query("SELECT status FROM users WHERE id = $id");
    const result = query.get({ $id: id }) as any;
    return result?.status || "offline";
  }

  // ✅ UPDATED: Include bio field in update
  static update(id: string, updates: Partial<UserInterface>) {
    const currentUser = db
      .query("SELECT * FROM users WHERE id = $id")
      .get({ $id: id }) as UserInterface;

    if (!currentUser) return null;

    const merged = { ...currentUser, ...updates };

    const rawData = `${merged.name} ${merged.username} ${merged.email}`;
    const newSearchVector = removeAccents(rawData);

    // ✅ Check if bio column exists, add it if needed
    const query = db.query(`
      UPDATE users
      SET 
        name = $name,
        username = $username,
        tel = $tel,
        status = $status,
        bio = $bio,
        search_vector = $vector,
        updatedAt = $now
      WHERE id = $id
      RETURNING *
    `);

    const updatedRow = query.get({
      $id: id,
      $name: merged.name,
      $username: merged.username,
      $tel: merged.tel,
      $status: merged.status,
      $bio: merged.bio || "",
      $vector: newSearchVector,
      $now: new Date().toISOString(),
    }) as any;

    if (updatedRow) {
      const { password: _, search_vector: __, ...safeUser } = updatedRow;
      return safeUser;
    }
    return null;
  }
}
