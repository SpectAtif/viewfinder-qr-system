const express = require("express");
const crypto = require("crypto");
const QRCode = require("qrcode");
const path = require("path");
const { pool, initDB } = require("./db");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

function todayStr(d) {
  return (d || new Date()).toISOString().slice(0, 10);
}

function baseUrl(req) {
  // Respects reverse proxies (Render/Railway/nginx) so the encoded link
  // always matches the domain people actually type/scan.
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

function shortUrl(req, item) {
  return item.type === "dynamic" ? `${baseUrl(req)}/r/${item.id}` : item.target;
}



function renderMessage(title, sub) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title><style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;
    background:#0B1120;color:#E7ECF5;font-family:system-ui,sans-serif;text-align:center;padding:20px;}
    h1{font-size:20px;margin:0;} p{color:#8894AD;font-size:14px;margin:0;}
  </style></head><body><h1>${title}</h1><p>${sub}</p></body></html>`;
}

// ---------- API ----------
app.get("/qr/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM items WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("QR not found");
    }

    const item = result.rows[0];

    const qrText =
      item.type === "dynamic"
        ? `${baseUrl(req)}/r/${item.id}`
        : item.target;

    const png = await QRCode.toBuffer(qrText, {
      type: "png",
      width: 512,
      margin: 2,
    });

    res.setHeader("Content-Type", "image/png");
    res.send(png);

  } catch (err) {
    console.error(err);
    res.status(500).send("QR generation failed");
  }
});

app.post("/api/items", async (req, res) => {
  try {
    let { name, target, category, type } = req.body || {};

    if (!name || !target) {
      return res.status(400).json({
        error: "name and target are required",
      });
    }

    if (!/^https?:\/\//i.test(target)) {
      target = "https://" + target;
    }

    type = type === "static" ? "static" : "dynamic";

    const item = {
      id: crypto.randomBytes(5).toString("hex"),
      name: String(name).slice(0, 120),
      target,
      category: category ? String(category).slice(0, 60) : "",
      type,
      active: true,
      createdAt: Date.now(),
      scans: [],
    };

    await pool.query(
      `
      INSERT INTO items
      (id,name,target,category,type,active,created_at,scans)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
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

    res.json({
      item: {
        ...item,
        shortUrl:
          item.type === "dynamic"
            ? `${baseUrl(req)}/r/${item.id}`
            : item.target,
      },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Database Error",
    });
  }
});
app.put("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let { name, target, category, active } = req.body;

    if (target && !/^https?:\/\//i.test(target)) {
      target = "https://" + target;
    }

    await pool.query(
      `
      UPDATE items
      SET
        name = COALESCE($1, name),
        target = COALESCE($2, target),
        category = COALESCE($3, category),
        active = COALESCE($4, active)
      WHERE id = $5
      `,
      [name, target, category, active, id]
    );

    const result = await pool.query(
      "SELECT * FROM items WHERE id=$1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Item not found",
      });
    }

    const item = result.rows[0];

    res.json({
      item: {
        id: item.id,
        name: item.name,
        target: item.target,
        category: item.category,
        type: item.type,
        active: item.active,
        createdAt: Number(item.created_at),
        scans: item.scans || [],
        shortUrl:
          item.type === "dynamic"
            ? `${baseUrl(req)}/r/${item.id}`
            : item.target,
      },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Database Error",
    });
  }
});

app.delete("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      "DELETE FROM items WHERE id = $1",
      [id]
    );

    res.json({
      ok: true,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Database Error",
    });
  }
});

// Server-rendered PNG — always downloadable, works for print (300+ DPI safe at 1024px).
app.get("/api/items", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM items ORDER BY created_at DESC"
    );

    const items = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      target: row.target,
      category: row.category,
      type: row.type,
      active: row.active,
      createdAt: Number(row.created_at),
      scans: row.scans || [],
      shortUrl:
        row.type === "dynamic"
          ? `${baseUrl(req)}/r/${row.id}`
          : row.target,
    }));

    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database Error" });
  }
});

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`VIEWFINDER QR server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection failed:");
    console.error(err);
    process.exit(1);
  });
