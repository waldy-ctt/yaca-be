// src/db/index.ts
import { Database } from "bun:sqlite";
import { removeAccents } from "../modules/lib/util";

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
        search_vector TEXT,  -- 🆕 Added directly to schema
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
      content TEXT NOT NULL,
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
  // Check if avatar column exists (marker for V2 schema)
  const hasAvatar = tableInfo.some((c) => c.name === "avatar");

  if (hasAvatar) return; // Already updated

  console.log("🔄 Migrating Users table (V1 -> V2)...");

  db.transaction(() => {
    db.run("ALTER TABLE users RENAME TO users_old");

    // Re-create table with V2 schema
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
        search_vector TEXT, -- Ensure migration includes this too
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL
      );
    `);

    // Copy data
    db.run(`
      INSERT INTO users (id, username, email, tel, name, password, createdAt, updatedAt, status, avatar)
      SELECT id, username, email, tel, name, password, createdAt, updatedAt, 'offline', null
      FROM users_old
    `);

    db.run("DROP TABLE users_old");
  })();
  console.log("✨ Users table migrated!");
}

function migrateSearchVector() {
  const tableInfo = db.query("PRAGMA table_info(users)").all() as any[];
  const hasSearchVector = tableInfo.some(c => c.name === "search_vector");

  if (hasSearchVector) return; // Already has the column? Skip.

  console.log("🔄 Adding 'search_vector' column to users...");

  // 1. Add the column
  db.run("ALTER TABLE users ADD COLUMN search_vector TEXT");

  // 2. Backfill existing data
  const allUsers = db.query("SELECT id, name, username, email FROM users").all() as any[];
  
  const updateStmt = db.prepare("UPDATE users SET search_vector = $vec WHERE id = $id");
  
  db.transaction(() => {
    for (const user of allUsers) {
      const raw = `${user.name} ${user.username} ${user.email}`;
      const vector = removeAccents(raw);
      updateStmt.run({ $vec: vector, $id: user.id });
    }
  })();
  
  console.log(`✨ Backfilled search_vector for ${allUsers.length} users.`);
}
