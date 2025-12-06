// src/db/index.ts
import { Database } from "bun:sqlite";

// Singleton: Create the connection once
export const db = new Database("yaca.sqlite");

// We can keep your init logic here or in a migration script
export function initDB() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      tel TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      createdAt DATETIME NOT NULL,
      updatedAt DATETIME NOT NULL
    );
  `);
  console.log("✅ Database initialized");
}
