const express = require("express");
const crypto = require("crypto");
const QRCode = require("qrcode");
const path = require("path");
const { readAll, transact } = require("./db");

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

// ---------- THE REDIRECT (this is what the printed QR code points to) ----------
app.get("/r/:id", async (req, res) => {
  const { id } = req.params;
  const result = await transact((data) => {
    const item = data.items.find((i) => i.id === id);
    if (!item) return { status: "missing" };
    if (item.active === false) return { status: "paused" };
    item.scans = item.scans || [];
    item.scans.push({
      ts: Date.now(),
      day: todayStr(),
      ua: (req.headers["user-agent"] || "").slice(0, 200),
      ref: (req.headers["referer"] || "").slice(0, 200),
    });
    return { status: "ok", target: item.target };
  });

  if (result.status === "missing") {
    return res.status(404).send(renderMessage("Code not found", "This QR code doesn't exist (or was deleted)."));
  }
  if (result.status === "paused") {
    return res.status(200).send(renderMessage("This code is paused", "The owner has temporarily disabled this destination."));
  }
  return res.redirect(302, result.target);
});

function renderMessage(title, sub) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title><style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;
    background:#0B1120;color:#E7ECF5;font-family:system-ui,sans-serif;text-align:center;padding:20px;}
    h1{font-size:20px;margin:0;} p{color:#8894AD;font-size:14px;margin:0;}
  </style></head><body><h1>${title}</h1><p>${sub}</p></body></html>`;
}

// ---------- API ----------
app.get("/api/items", async (req, res) => {
  const data = readAll();
  const items = data.items.map((i) => ({ ...i, shortUrl: shortUrl(req, i) }));
  res.json({ items });
});

app.post("/api/items", async (req, res) => {
  let { name, target, category, type } = req.body || {};
  if (!name || !target) return res.status(400).json({ error: "name and target are required" });
  if (!/^https?:\/\//i.test(target)) target = "https://" + target;
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
  await transact((data) => data.items.push(item));
  res.json({ item: { ...item, shortUrl: shortUrl(req, item) } });
});

app.put("/api/items/:id", async (req, res) => {
  const { id } = req.params;
  let { name, target, category, active } = req.body || {};
  const result = await transact((data) => {
    const item = data.items.find((i) => i.id === id);
    if (!item) return null;
    if (name !== undefined) item.name = String(name).slice(0, 120);
    if (category !== undefined) item.category = String(category).slice(0, 60);
    if (active !== undefined) item.active = !!active;
    if (target !== undefined && item.type === "dynamic") {
      if (!/^https?:\/\//i.test(target)) target = "https://" + target;
      item.target = target;
    }
    return item;
  });
  if (!result) return res.status(404).json({ error: "not found" });
  res.json({ item: { ...result, shortUrl: shortUrl(req, result) } });
});

app.delete("/api/items/:id", async (req, res) => {
  const { id } = req.params;
  await transact((data) => {
    data.items = data.items.filter((i) => i.id !== id);
  });
  res.json({ ok: true });
});

// Server-rendered PNG — always downloadable, works for print (300+ DPI safe at 1024px).
app.get("/api/items/:id/qr.png", async (req, res) => {
  const data = readAll();
  const item = data.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).end();
  const size = Math.min(2048, Math.max(128, parseInt(req.query.size) || 1024));
  const download = req.query.download === "1";
  try {
    const buffer = await QRCode.toBuffer(shortUrl(req, item), {
      type: "png",
      width: size,
      margin: 2,
      color: { dark: "#0B1120", light: "#FFFFFF" },
      errorCorrectionLevel: "H",
    });
    res.setHeader("Content-Type", "image/png");
    if (download) {
      const fname = (item.name || "qr-code").replace(/[^a-z0-9]/gi, "_").toLowerCase() + "_qr.png";
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    }
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: "qr generation failed" });
  }
});

app.listen(PORT, () => {
  console.log(`VIEWFINDER QR server running on http://localhost:${PORT}`);
});
