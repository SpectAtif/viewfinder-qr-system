const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "db.json");

function readRaw() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ items: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeRaw(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Simple write queue so concurrent requests don't clobber each other.
let queue = Promise.resolve();
function transact(fn) {
  const result = queue.then(() => {
    const data = readRaw();
    const ret = fn(data);
    writeRaw(data);
    return ret;
  });
  queue = result.catch(() => {});
  return result;
}

function readAll() {
  return readRaw();
}

module.exports = { readAll, transact };
