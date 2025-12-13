// src/db/setup.ts  

import { Database } from "bun:sqlite";

export const db = new Database("data/yaca.sqlite", { create: true });

export function initDB() {
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      tel TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT,
      bio TEXT DEFAULT '',
      status TEXT DEFAULT 'offline',
      lastSeen DATETIME,
      search_vector TEXT,
      createdAt DATETIME NOT NULL,
      updatedAt DATETIME NOT NULL
    );
  `);

  // ✅ NEW: Add bio column to existing tables (migration)
  try {
    db.run(`ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''`);
    console.log("✅ Added bio column to users table");
  } catch (e) {
    // Column already exists, ignore error
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      participants TEXT NOT NULL,
      avatar TEXT,
      name TEXT NOT NULL,
      lastMessage TEXT,
      lastMessageTimestamp DATETIME,
      pinnedBy TEXT,
      createdAt DATETIME NOT NULL,
      updatedAt DATETIME NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      content TEXT NOT NULL,
      reaction TEXT,
      senderId TEXT NOT NULL,
      createdAt DATETIME NOT NULL,
      updatedAt DATETIME NOT NULL,
      FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);

  console.log("✅ Database initialized");
}
