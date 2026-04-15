const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== ENV =====
const STAFF_PIN = process.env.STAFF_PIN || "0000";
const ADMIN_PIN = process.env.ADMIN_PIN || "6969";
const DELETE_PIN = process.env.DELETE_PIN || "1212";

// ===== FILE PATHS =====
const MENU_PATH = path.join(__dirname, "menu.json");
const ORDERS_PATH = path.join(__dirname, "orders.json");
const ONGOING_PATH = path.join(__dirname, "ongoing.json");

// ===== HOME =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "staff.html"));
});

// ===== HELPERS =====
function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function normalizeTableName(name) {
  return String(name || "").trim();
}

function calcTotal(items) {
  return items.reduce((sum, item) => {
    return sum + ((Number(item.price) || 0) * (Number(item.qty) || 0));
  }, 0);
}

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(item => ({
      name: String(item.name || "").trim(),
      price: Number(item.price) || 0,
      qty: Number(item.qty) || 0
    }))
    .filter(item => item.name && item.qty > 0);
}

function getOngoingBills() {
  return readJSON(ONGOING_PATH, []);
}

function saveOngoingBills(data) {
  writeJSON(ONGOING_PATH, data);
}

function getCheckoutBills() {
  return readJSON(ORDERS_PATH, []);
}

function saveCheckoutBills(data) {
  writeJSON(ORDERS_PATH, data);
}

function findBillIndexByTable(bills, tableName) {
  return bills.findIndex(bill => String(bill.table) === String(tableName));
}

function requireStaff(req, res, next) {
  const auth = req.headers.authorization || "";
  if (auth !== "Bearer staff-ok") {
    return res.status(401).json({ error: "Staff unauthorized" });
  }
  next();
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  if (auth !== "Bearer admin-ok") {
    return res.status(401).json({ error: "Admin unauthorized" });
  }
  next();
}

// ===== HEALTH =====
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// ===== MENU =====
app.get("/api/menu", (req, res) => {
  const menu = readJSON(MENU_PATH, { categories: [] });
  res.json(menu);
});

// ===== LOGIN =====
app.post("/api/staff/login", (req, res) => {
  const pin = String(req.body?.pin || "");
  if (pin !== STAFF_PIN) {
    return res.status(401).json({ error: "Invalid staff PIN" });
  }
  res.json({ ok: true, role: "staff", token: "staff-ok" });
});

app.post("/api/admin/login", (req, res) => {
  const pin = String(req.body?.pin || "");
  if (pin !== ADMIN_PIN) {
    return res.status(401).json({ error: "Invalid admin PIN" });
  }
  res.json({ ok: true, role: "admin", token: "admin-ok" });
});

app.post("/api/admin/verify-delete-pin", requireAdmin, (req, res) => {
  const pin = String(req.body?.pin || "").trim();
  if (pin !== DELETE_PIN) {
    return res.status(401).json({ error: "Invalid delete PIN" });
  }
  res.json({ ok: true });
});

// ===== STAFF / ONGOING BILL =====
app.get("/api/ongoing", requireStaff, (req, res) => {
  const bills = getOngoingBills().sort((a, b) => {
    return String(a.table).localeCompare(String(b.table));
  });
  res.json(bills);
});

app.get("/api/checkouts", requireStaff, (req, res) => {
  const orders = getCheckoutBills()
    .filter(order => String(order.status || "") === "Checkout")
    .sort((a, b) => {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  res.json(orders);
});

app.post("/api/ongoing/open", requireStaff, (req, res) => {
  const table = normalizeTableName(req.body?.table);
  if (!table) {
    return res.status(400).json({ error: "Table required" });
  }

  const bills = getOngoingBills();
  const idx = findBillIndexByTable(bills, table);

  if (idx === -1) {
    const bill = {
      id: "og_" + Date.now(),
      table,
      items: [],
      total: 0,
      status: "Ongoing",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    bills.unshift(bill);
    saveOngoingBills(bills);
    return res.json({ ok: true, bill });
  }

  bills[idx].updatedAt = new Date().toISOString();
  saveOngoingBills(bills);
  return res.json({ ok: true, bill: bills[idx] });
});

app.post("/api/ongoing/:table/items", requireStaff, (req, res) => {
  const table = normalizeTableName(req.params.table);
  const name = String(req.body?.name || "").trim();
  const price = Number(req.body?.price) || 0;
  const qty = Number(req.body?.qty) || 1;

  if (!table) return res.status(400).json({ error: "Table required" });
  if (!name) return res.status(400).json({ error: "Item name required" });
  if (qty <= 0) return res.status(400).json({ error: "Invalid quantity" });

  const bills = getOngoingBills();
  const idx = findBillIndexByTable(bills, table);
  if (idx === -1) {
    return res.status(404).json({ error: "Table not found" });
  }

  const bill = bills[idx];
  const itemIdx = bill.items.findIndex(item => item.name === name);

  if (itemIdx === -1) {
    bill.items.push({ name, price, qty });
  } else {
    bill.items[itemIdx].qty += qty;
    bill.items[itemIdx].price = price || bill.items[itemIdx].price;
  }

  bill.total = calcTotal(bill.items);
  bill.updatedAt = new Date().toISOString();
  saveOngoingBills(bills);

  res.json({ ok: true, bill });
});

app.patch("/api/ongoing/:table/items", requireStaff, (req, res) => {
  const table = normalizeTableName(req.params.table);
  const name = String(req.body?.name || "").trim();
  const delta = Number(req.body?.delta) || 0;

  if (!table) return res.status(400).json({ error: "Table required" });
  if (!name) return res.status(400).json({ error: "Item name required" });
  if (!delta) return res.status(400).json({ error: "Delta required" });

  const bills = getOngoingBills();
  const idx = findBillIndexByTable(bills, table);
  if (idx === -1) {
    return res.status(404).json({ error: "Table not found" });
  }

  const bill = bills[idx];
  const itemIdx = bill.items.findIndex(item => item.name === name);
  if (itemIdx === -1) {
    return res.status(404).json({ error: "Item not found" });
  }

  bill.items[itemIdx].qty += delta;

  if (bill.items[itemIdx].qty <= 0) {
    bill.items.splice(itemIdx, 1);
  }

  bill.total = calcTotal(bill.items);
  bill.updatedAt = new Date().toISOString();
  saveOngoingBills(bills);

  res.json({ ok: true, bill });
});

app.delete("/api/ongoing/:table/items", requireStaff, (req, res) => {
  const table = normalizeTableName(req.params.table);
  const name = String(req.body?.name || "").trim();

  if (!table) return res.status(400).json({ error: "Table required" });
  if (!name) return res.status(400).json({ error: "Item name required" });

  const bills = getOngoingBills();
  const idx = findBillIndexByTable(bills, table);
  if (idx === -1) {
    return res.status(404).json({ error: "Table not found" });
  }

  const bill = bills[idx];
  bill.items = bill.items.filter(item => item.name !== name);
  bill.total = calcTotal(bill.items);
  bill.updatedAt = new Date().toISOString();
  saveOngoingBills(bills);

  res.json({ ok: true, bill });
});

app.delete("/api/ongoing/:table", requireStaff, (req, res) => {
  const table = normalizeTableName(req.params.table);
  const bills = getOngoingBills();
  const idx = findBillIndexByTable(bills, table);

  if (idx === -1) {
    return res.status(404).json({ error: "Table not found" });
  }

  bills.splice(idx, 1);
  saveOngoingBills(bills);
  res.json({ ok: true });
});

app.post("/api/ongoing/:table/checkout", requireStaff, (req, res) => {
  const table = normalizeTableName(req.params.table);

  const bills = getOngoingBills();
  const idx = findBillIndexByTable(bills, table);
  if (idx === -1) {
    return res.status(404).json({ error: "Table not found" });
  }

  const bill = bills[idx];
  const cleanBillItems = cleanItems(bill.items);

  if (!cleanBillItems.length) {
    return res.status(400).json({ error: "No items in bill" });
  }

  const orders = getCheckoutBills();
  const checkoutBill = {
    id: Date.now().toString(),
    table: bill.table,
    items: cleanBillItems,
    total: calcTotal(cleanBillItems),
    status: "Checkout",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  orders.unshift(checkoutBill);
  saveCheckoutBills(orders);

  bills.splice(idx, 1);
  saveOngoingBills(bills);

  res.json({ ok: true, orderId: checkoutBill.id, bill: checkoutBill });
});

// ===== ADMIN =====
app.get("/api/admin/ongoing", requireAdmin, (req, res) => {
  const bills = getOngoingBills().sort((a, b) => {
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
  res.json(bills);
});

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const orders = getCheckoutBills()
    .filter(order => String(order.status || "") === "Checkout")
    .sort((a, b) => {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  res.json(orders);
});

app.delete("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const orders = getCheckoutBills();
  const idx = orders.findIndex(order => order.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: "Order not found" });
  }

  orders.splice(idx, 1);
  saveCheckoutBills(orders);
  res.json({ ok: true });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
