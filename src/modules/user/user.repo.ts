// src/modules/user/user.repo.ts
import { db } from "../../db";

export interface User {
  id: string;
  username: string;
  email: string;
  // ... add other fields as needed
}

export class UserRepository {
  // 1. Fetch all users
  static findAll() {
    // "prepare" compiles the SQL logic efficiently
    const query = db.query("SELECT * FROM users");
    return query.all();
  }

  // 2. Find by Email (The Safe Way)
  static findByEmail(email: string) {
    // $email is the placeholder
    const query = db.query("SELECT * FROM users WHERE email = $email");

    // We bind the value safely here
    return query.get({ $email: email }) as User | null;
  }

  static findUserByEmailAndPassword(email: string, password: string) {
    const query = db.query(
      "SELECT * FROM users WHERE email = $email and password = $password",
    );

    return query.get({ $email: email, $password: password }) as User | null;
  }

  static findUserByPhoneAndPassword(phone: string, password: string) {
    const query = db.query(
      "SELECT * FROM users WHERE tel = $tel and password = $password",
    );

    return query.get({ $tel: phone, $password: password }) as User | null;
  }

  // 3. Create User (Transaction Example)
  static create(id: string, email: string, username: string) {
    const query = db.query(`
      INSERT INTO users (id, email, username, tel, name, password, createdAt, updatedAt)
      VALUES ($id, $email, $username, '000', 'No Name', 'pass', $now, $now)
      RETURNING *
    `);

    return query.get({
      $id: id,
      $email: email,
      $username: username,
      $now: new Date().toISOString(),
    });
  }
}
