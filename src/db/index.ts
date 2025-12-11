// src/db/index.ts
import { Database } from "bun:sqlite";

// Singleton: Create the connection once
export const db = new Database("yaca.sqlite");

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

  db.run(`
    CREATE TABLE IF NOT EXISTS conversation (
      id TEXT PRIMARY KEY,
      participants TEXT,
      avatar TEXT,
      name TEXT NOT NULL,           
      lastMessage TEXT,
      lastMessageTimestamp DATETIME,
      pinnedBy TEXT,
      updatedAt DATETIME NOT NULL,
      createdAt DATETIME NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      content TEXT NOTE NULL,
      reaction TEXT,
      senderId TEXT NOT NULL,           
      updatedAt DATETIME NOT NULL,
      createdAt DATETIME NOT NULL
    );
  `);

  console.log("✅ Database initialized");
}
