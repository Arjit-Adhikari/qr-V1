let adminToken = localStorage.getItem("admin_token") || "";

const STORE_KEY = "kahu_qrorder_version_one";

const msg = document.getElementById("msg");
const panel = document.getElementById("panel");
const ongoingList = document.getElementById("ongoingList");
const checkoutList = document.getElementById("checkoutList");

function money(n){
  return "NPR " + (Number(n) || 0);
}

function emptyStore(){
  return {
    tables: {},
    checkouts: []
  };
}

function readStore(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    return {
      tables: parsed.tables || {},
      checkouts: Array.isArray(parsed.checkouts) ? parsed.checkouts : []
    };
  }catch(e){
    return emptyStore();
  }
}

async function adminLogin(){
  msg.textContent = "";
  const pin = document.getElementById("adminPin").value.trim();

  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ pin })
  });

  const data = await res.json();
  if(!res.ok){
    msg.textContent = "❌ " + (data.error || "Login failed");
    return;
  }

  adminToken = data.token;
  localStorage.setItem("admin_token", adminToken);
  msg.textContent = "✅ Logged in!";
  panel.style.display = "block";
  await loadAll();
}

function renderOngoing(){
  const store = readStore();
  const names = Object.keys(store.tables).sort((a, b) => a.localeCompare(b));

  ongoingList.innerHTML = "";
  if(!names.length){
    ongoingList.innerHTML = `<div class="muted">No ongoing bills.</div>`;
    return;
  }

  names.forEach(name => {
    const table = store.tables[name];
    const total = (table.items || []).reduce((sum, item) => {
      return sum + ((Number(item.price) || 0) * (Number(item.qty) || 0));
    }, 0);

    const itemsHtml = (table.items || []).length
      ? table.items.map(item => `<div class="muted">• ${item.name} × ${item.qty}</div>`).join("")
      : `<div class="muted">No items yet.</div>`;

    const div = document.createElement("div");
    div.className = "orderCard";
    div.innerHTML = `
      <div class="rowBetween">
        <div>
          <div class="title">${table.table}</div>
          <div class="muted">${new Date(table.updatedAt || table.createdAt || Date.now()).toLocaleString()}</div>
        </div>
        <div class="pill">Ongoing</div>
      </div>
      <hr/>
      <div>${itemsHtml}</div>
      <div class="muted"><b>Total:</b> ${money(total)}</div>
    `;
    ongoingList.appendChild(div);
  });
}

async function loadServerOrders(){
  if(!adminToken) return [];

  const res = await fetch("/api/admin/orders", {
    headers: { "Authorization":"Bearer " + adminToken }
  });

  if(res.status === 401){
    msg.textContent = "❌ Session expired. Login again.";
    adminToken = "";
    localStorage.removeItem("admin_token");
    panel.style.display = "none";
    return [];
  }

  const orders = await res.json();
  return Array.isArray(orders) ? orders : [];
}

function mergeCheckoutBills(localBills, serverBills){
  const merged = [];
  const seen = new Set();

  (serverBills || []).forEach(order => {
    const key = order.id || ("server_" + order.createdAt + "_" + order.table);
    seen.add(key);
    merged.push({
      id: key,
      serverId: order.id || "",
      table: order.table || "Unknown",
      items: order.items || [],
      total: Number(order.total) || 0,
      createdAt: order.createdAt || new Date().toISOString(),
      synced: true
    });
  });

  (localBills || []).forEach(order => {
    const key = order.serverId || order.id;
    if(seen.has(key)) return;
    merged.push({
      id: order.id,
      serverId: order.serverId || "",
      table: order.table || "Unknown",
      items: order.items || [],
      total: Number(order.total) || 0,
      createdAt: order.createdAt || new Date().toISOString(),
      synced: !!order.synced
    });
  });

  merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return merged;
}

async function deleteCheckoutBill(bill){
  if(!confirm("Delete this checkout bill?")) return;

  if(bill.serverId){
    const pin = prompt("Enter DELETE PIN:");
    if(pin === null) return;

    const verify = await fetch("/api/admin/verify-delete-pin", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer " + adminToken
      },
      body: JSON.stringify({ pin: pin.trim() })
    });

    const verifyData = await verify.json();
    if(!verify.ok){
      alert("❌ " + (verifyData.error || "Wrong DELETE PIN"));
      return;
    }

    const res = await fetch("/api/admin/orders/" + bill.serverId, {
      method:"DELETE",
      headers:{ "Authorization":"Bearer " + adminToken }
    });

    const data = await res.json();
    if(!res.ok){
      alert(data.error || "Delete failed");
      return;
    }

    const store = readStore();
    store.checkouts = store.checkouts.filter(item => item.serverId !== bill.serverId);
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    alert("✅ Checkout bill deleted");
    loadAll();
    return;
  }

  const store = readStore();
  store.checkouts = store.checkouts.filter(item => item.id !== bill.id);
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  loadAll();
}

function renderCheckoutBills(bills){
  checkoutList.innerHTML = "";

  if(!bills.length){
    checkoutList.innerHTML = `<div class="muted">No checkout bills yet.</div>`;
    return;
  }

  bills.forEach(bill => {
    const itemsHtml = (bill.items || []).map(item => {
      return `<div class="muted">• ${item.name} × ${item.qty} (${money((Number(item.price)||0) * (Number(item.qty)||0))})</div>`;
    }).join("");

    const div = document.createElement("div");
    div.className = "orderCard";
    div.innerHTML = `
      <div class="rowBetween">
        <div>
          <div class="title">${bill.table}</div>
          <div class="muted">${new Date(bill.createdAt).toLocaleString()}</div>
        </div>
        <div class="pill">Checkout</div>
      </div>
      <hr/>
      <div>${itemsHtml || `<div class="muted">No items</div>`}</div>
      <div class="muted"><b>Total:</b> ${money(bill.total)}</div>
      <div class="muted">${bill.synced ? "Saved to server" : "Local only"}</div>
      <div class="actions">
        <button class="small danger fitBtn" data-delete-bill="${bill.id}">🗑 Delete</button>
      </div>
    `;
    checkoutList.appendChild(div);
  });

  checkoutList.querySelectorAll("[data-delete-bill]").forEach(btn => {
    btn.onclick = () => {
      const bill = bills.find(item => item.id === btn.dataset.deleteBill);
      if(bill){
        deleteCheckoutBill(bill);
      }
    };
  });
}

async function loadAll(){
  renderOngoing();
  const store = readStore();
  const serverBills = await loadServerOrders();
  const merged = mergeCheckoutBills(store.checkouts || [], serverBills || []);
  renderCheckoutBills(merged);
}

function isSameLocalDay(a, b){
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

async function printTodaySales(){
  const store = readStore();
  const serverBills = await loadServerOrders();
  const bills = mergeCheckoutBills(store.checkouts || [], serverBills || []);

  const now = new Date();
  const todayBills = bills.filter(bill => {
    const d = new Date(bill.createdAt);
    return isSameLocalDay(d, now);
  });

  let grandTotal = 0;
  const byTable = {};

  todayBills.forEach(bill => {
    grandTotal += Number(bill.total) || 0;
    const t = bill.table || "Unknown";
    if(!byTable[t]) byTable[t] = { total: 0, count: 0, itemsMap: {} };
    byTable[t].total += Number(bill.total) || 0;
    byTable[t].count += 1;

    (bill.items || []).forEach(it => {
      const key = it.name;
      byTable[t].itemsMap[key] = (byTable[t].itemsMap[key] || 0) + (Number(it.qty) || 0);
    });
  });

  const tableNames = Object.keys(byTable).sort((a,b) => a.localeCompare(b));
  const dateText = now.toLocaleDateString() + " " + now.toLocaleTimeString();

  const rows = tableNames.map((t, idx) => {
    const itemsList = Object.entries(byTable[t].itemsMap)
      .sort((a,b) => a[0].localeCompare(b[0]))
      .map(([name, qty]) => `${name} × ${qty}`)
      .join("<br>");

    return `
      <tr>
        <td>${idx + 1}</td>
        <td><b>${t}</b><br><span style="color:#555">Bills: ${byTable[t].count}</span></td>
        <td>${itemsList || "-"}</td>
        <td style="text-align:right"><b>${money(byTable[t].total)}</b></td>
      </tr>
    `;
  }).join("");

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Today Sales</title>
<style>
  body{ font-family: Arial, sans-serif; padding: 18px; }
  h1{ margin:0 0 6px 0; font-size:20px; }
  .meta{ color:#444; font-size:12px; margin-bottom:14px; }
  .box{ border:1px solid #ddd; padding:12px; border-radius:10px; }
  table{ width:100%; border-collapse: collapse; margin-top:10px; }
  th, td{ border:1px solid #ddd; padding:8px; vertical-align: top; font-size:12px; }
  th{ background:#f5f5f5; text-align:left; }
  .totals{ margin-top:12px; font-size:13px; }
  @media print{
    body{ padding:0; }
    .noPrint{ display:none; }
  }
</style>
</head>
<body>
  <div class="noPrint" style="margin-bottom:10px;">
    <button onclick="window.print()">Print</button>
    <button onclick="window.close()">Close</button>
  </div>

  <h1>Kahundanda Resort Tappu — Today Sales Report</h1>
  <div class="meta">Generated: ${dateText}</div>

  <div class="box">
    <div class="totals">
      <b>Total Checkout Bills Today:</b> ${todayBills.length}<br>
      <b>Grand Total:</b> ${money(grandTotal)}
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th style="width:160px;">Table</th>
          <th>Items Summary</th>
          <th style="width:120px; text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="4">No checkout bills today.</td></tr>`}
      </tbody>
    </table>
  </div>

<script>
  setTimeout(() => window.print(), 400);
</script>
</body>
</html>
  `;

  const w = window.open("", "_blank");
  if(!w){
    alert("Popup blocked! Allow popups for this site.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}

document.getElementById("adminLoginBtn").addEventListener("click", adminLogin);
document.getElementById("printTodayBtn").addEventListener("click", printTodaySales);

if(adminToken){
  panel.style.display = "block";
  loadAll();
}

setInterval(() => {
  if(adminToken){
    loadAll();
  }
}, 3000);
