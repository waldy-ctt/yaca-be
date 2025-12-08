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

  db.run(
    `
    CREATE TABLE IF NOT EXISTS conversation_list (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,           
      lastMessage TEXT,
      isRead BOOLEAN DEFAULT 0,
      isPinned BOOLEAN DEFAULT 0,
      latestTimestamp DATETIME,
      opponentAvatar TEXT,          
      participantIdList TEXT       
    );
    `,
  );
  console.log("✅ Database initialized");
}
