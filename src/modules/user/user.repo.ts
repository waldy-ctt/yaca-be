// src/modules/user/user.repo.ts
import { db } from "../../db/setup";
import { removeAccents } from "../../lib/util";
import { UserInterface } from "./user.interface";

export class UserRepository {
  static findNamesByUserIds(userIds: string[]) {
    if (userIds.length === 0) return [];

    // 1. Create dynamic placeholders (?, ?, ?) based on array length
    const placeholders = userIds.map(() => "?").join(",");

    // 2. Run Query
    // bun:sqlite allows passing the array directly as arguments for '?'
    const query = db.query(
      `SELECT id, name FROM users WHERE id IN (${placeholders})`,
    );

    // 3. Return Array of Objects
    return query.all(...userIds) as { id: string; name: string }[];
  }

  static findAll(
    limit: number = 20,
    cursor?: string,
    keyword?: string,
    withCurrentUser: boolean = false, // Default: Hide myself
    currentUserId?: string, // Required if you want to hide yourself
  ) {
    let sql =
      "SELECT id, username, email, name, avatar, status, createdAt FROM users";
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

  static update(id: string, updates: Partial<UserInterface>) {
    // 1. Fetch current data first
    // We need this to rebuild the 'search_vector' correctly.
    // e.g. If they only update 'name', we still need their 'email' to build the vector.
    const currentUser = db
      .query("SELECT * FROM users WHERE id = $id")
      .get({ $id: id }) as UserInterface;

    if (!currentUser) return null;

    // 2. Merge old data with new updates
    const merged = { ...currentUser, ...updates };

    // 3. Re-calculate Search Vector 🧠
    // Even if they didn't change their name, re-running this is safer and cheap.
    const rawData = `${merged.name} ${merged.username} ${merged.email}`;
    const newSearchVector = removeAccents(rawData);

    // 4. Build Dynamic SQL
    // We update fields + updatedAt + search_vector
    const query = db.query(`
      UPDATE users
      SET 
        name = $name,
        username = $username,
        tel = $tel,
        status = $status,
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
      $vector: newSearchVector, // <--- Key Update!
      $now: new Date().toISOString(),
    }) as any;

    // 5. Return safe data (remove password)
    if (updatedRow) {
      const { password: _, search_vector: __, ...safeUser } = updatedRow;
      return safeUser;
    }
    return null;
  }
}
