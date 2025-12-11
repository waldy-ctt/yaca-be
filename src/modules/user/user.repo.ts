// src/modules/user/user.repo.ts
import { db } from "../../db";
import { UserInterface } from "./user.interface";

export class UserRepository {
  static findAll() {
    const query = db.query("SELECT id, username, email, name FROM users"); // Don't return passwords!
    return query.all() as UserInterface[] | [];
  }

  // Find by Email OR Username (Flexible Login)
  static findByIdentifier(identifier: string) {
    const query = db.query(
      "SELECT * FROM users WHERE email = $id OR username = $id",
    );
    return query.get({ $id: identifier }) as UserInterface | null;
  }

  // Keep your create method, it's good!
  static create(user: UserInterface) {
    const query = db.query(`
      INSERT INTO users (id, email, username, tel, name, password, createdAt, updatedAt)
      VALUES ($id, $email, $username, $tel, $name, $pass, $now, $now)
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
    }) as UserInterface | null;
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
