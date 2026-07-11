# VIEWFINDER — QR Console

A real, self-hosted dynamic QR system: printed codes point at your server, and you
can change where they go at any time without reprinting anything.

## Why you need to deploy this somewhere

A QR code just encodes a URL. For a code to keep working after it's printed, that
URL has to point at a server that's always online at a fixed address. This project
IS that server — you just need to run it somewhere with a real domain (not your
laptop) before you print anything.

## Run it locally first (to try it out)

```bash
npm install
node server.js
```

Open http://localhost:3000 — you can create codes and click into them, but codes
created here will only work when scanned from a phone on the same network as your
computer (via your LAN IP), and only while the server is running. Fine for testing,
not for print.

## Deploy for real (pick one)

Any of these give you a permanent `https://yourapp.example.com` address. Once
deployed, every dynamic QR code will encode `https://yourapp.example.com/r/<id>`
automatically — no code changes needed.

**Render.com / Railway.app (easiest, free tier available)**
1. Push this folder to a GitHub repo.
2. Create a new "Web Service" from that repo.
3. Build command: `npm install` — Start command: `node server.js`.
4. Deploy. Use the URL it gives you (or attach your own domain).

**Your own VPS**
1. Copy this folder to the server.
2. `npm install --production`
3. Run it with a process manager so it survives reboots/crashes:
   `npm install -g pm2 && pm2 start server.js --name viewfinder && pm2 save`
4. Put it behind nginx/Caddy with your domain + HTTPS.

**A subdomain you already own is worth setting up** (e.g. `qr.yourbusiness.com`)
so the printed links look clean and are yours permanently.

## How it stays editable after printing

Each dynamic code's QR image encodes `https://yourdomain.com/r/<id>` — a fixed link
tied to that code's ID, not to the destination. The destination is stored in
`data/db.json` on the server. Editing it in the dashboard changes where `/r/<id>`
redirects to, instantly, for every already-printed copy of that code.

## Data storage

Everything lives in `data/db.json`, a plain JSON file, created automatically on
first run. Back it up like any other file (copy it, put it in your deploy's
persistent volume, etc.) — on most free hosting tiers, disks are wiped on redeploy,
so for serious use either enable a persistent disk (Render/Railway both offer this)
or point `db.js` at a real database once you outgrow a JSON file.

## Notes

- Static codes encode the destination directly — they work with zero deployment,
  anywhere, forever, but can't be edited or tracked.
- Dynamic codes require the server above to be running and reachable.
- No accounts, no billing, no limits on codes or scans.
