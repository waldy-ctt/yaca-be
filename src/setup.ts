import { Database } from 'bun:sqlite'

const db = new Database("yaca.sqlite");

db.run(`
       CREATE TABLE IF NOT EXISTS users (
         id TEXT PRIMARY KEY
       )
       `)
