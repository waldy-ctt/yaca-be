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
        avatar TEXT,                 
        status TEXT DEFAULT 'offline', 
        lastSeen DATETIME,            
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

function migrateUsersTable() {
  const tableInfo = db.query("PRAGMA table_info(users)").all() as any[];
  // Check if new columns exist
  const hasAvatar = tableInfo.some((c) => c.name === "avatar");

  if (hasAvatar) return; // Already updated

  console.log("🔄 Migrating Users table...");

  db.transaction(() => {
    db.run("ALTER TABLE users RENAME TO users_old");

    // Create NEW table with avatar, status, lastSeen
    db.run(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        tel TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        avatar TEXT,                 
        status TEXT DEFAULT 'offline', 
        lastSeen DATETIME,            
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL
      );
    `);

    // Copy data (Set default values for new columns)
    db.run(`
      INSERT INTO users (id, username, email, tel, name, password, createdAt, updatedAt, status, avatar)
      SELECT id, username, email, tel, name, password, createdAt, updatedAt, 'offline', null
      FROM users_old
    `);

    db.run("DROP TABLE users_old");
  })();
  console.log("✨ Users table migrated!");
}
