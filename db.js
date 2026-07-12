require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target TEXT NOT NULL,
      category TEXT,
      type TEXT NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at BIGINT,
      scans JSONB DEFAULT '[]'
    );
  `);

  console.log("Database Ready ✅");
}

async function readAll() {
  const result = await pool.query(
    "SELECT * FROM items ORDER BY created_at DESC"
  );

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      target: row.target,
      category: row.category,
      type: row.type,
      active: row.active,
      createdAt: Number(row.created_at),
      scans: row.scans || [],
    })),
  };
}

async function createItem(item) {
  await pool.query(
    `
    INSERT INTO items
    (id,name,target,category,type,active,created_at,scans)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
`,
    [
      item.id,
      item.name,
      item.target,
      item.category,
      item.type,
      item.active,
      item.createdAt,
      JSON.stringify(item.scans),
    ]
  );
}

module.exports = {
  pool,
  initDB,
  readAll,
  createItem,
};