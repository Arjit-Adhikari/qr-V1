let adminToken = localStorage.getItem("admin_token") || "";

const msg = document.getElementById("msg");
const panel = document.getElementById("panel");
const ongoingList = document.getElementById("ongoingList");
const checkoutList = document.getElementById("checkoutList");

function money(n) {
  return "NPR " + (Number(n) || 0);
}

async function adminApi(url, options = {}) {
  const headers = options.headers || {};
  if (adminToken) {
    headers.Authorization = "Bearer " + adminToken;
  }
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

  if (res.status === 401) {
    msg.textContent = "❌ Session expired. Login again.";
    adminToken = "";
    localStorage.removeItem("admin_token");
    panel.style.display = "none";
    throw new Error("Unauthorized");
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

async function adminLogin() {
  msg.textContent = "";
  const pin = document.getElementById("adminPin").value.trim();

  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ pin })
  });

  const data = await res.json();
  if (!res.ok) {
    msg.textContent = "❌ " + (data.error || "Login failed");
    return;
  }

  adminToken = data.token;
  localStorage.setItem("admin_token", adminToken);
  msg.textContent = "✅ Logged in!";
  panel.style.display = "block";
  await loadAll();
}

function renderOngoing(bills) {
  ongoingList.innerHTML = "";
  if (!bills.length) {
    ongoingList.innerHTML = `<div class="muted">No ongoing bills.</div>`;
    return;
  }

  bills.forEach(bill => {
    const itemsHtml = (bill.items || []).length
      ? bill.items.map(item => `<div class="muted">• ${item.name} × ${item.qty}</div>`).join("")
      : `<div class="muted">No items yet.</div>`;

    const div = document.createElement("div");
    div.className = "orderCard";
    div.innerHTML = `
      <div class="rowBetween">
        <div>
          <div class="title">${bill.table}</div>
          <div class="muted">${new Date(bill.updatedAt || bill.createdAt || Date.now()).toLocaleString()}</div>
        </div>
        <div class="pill">Ongoing</div>
      </div>
      <hr/>
      <div>${itemsHtml}</div>
      <div class="muted"><b>Total:</b> ${money(bill.total)}</div>
    `;
    ongoingList.appendChild(div);
  });
}

async function deleteCheckoutBill(id) {
  if (!confirm("Delete this checkout bill?")) return;

  const pin = prompt("Enter DELETE PIN:");
  if (pin === null) return;

  try {
    await adminApi("/api/admin/verify-delete-pin", {
      method:"POST",
      body: JSON.stringify({ pin: pin.trim() })
    });

    await adminApi("/api/admin/orders/" + id, {
      method:"DELETE"
    });

    alert("✅ Checkout bill deleted");
    loadAll();
  } catch (err) {
    alert("❌ " + err.message);
  }
}

function renderCheckoutBills(bills) {
  checkoutList.innerHTML = "";

  if (!bills.length) {
    checkoutList.innerHTML = `<div class="muted">No checkout bills yet.</div>`;
    return;
  }

  bills.forEach(bill => {
    const itemsHtml = (bill.items || []).map(item => {
      return `<div class="muted">• ${item.name} × ${item.qty} (${money((Number(item.price) || 0) * (Number(item.qty) || 0))})</div>`;
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
      <div class="actions">
        <button class="small danger fitBtn" data-delete-bill="${bill.id}">🗑 Delete</button>
      </div>
    `;
    checkoutList.appendChild(div);
  });

  checkoutList.querySelectorAll("[data-delete-bill]").forEach(btn => {
    btn.onclick = () => deleteCheckoutBill(btn.dataset.deleteBill);
  });
}

async function loadAll() {
  const ongoing = await adminApi("/api/admin/ongoing");
  const bills = await adminApi("/api/admin/orders");
  renderOngoing(ongoing);
  renderCheckoutBills(bills);
}

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

async function printTodaySales() {
  const bills = await adminApi("/api/admin/orders");
  const now = new Date();

  const todayBills = (bills || []).filter(bill => {
    const d = new Date(bill.createdAt);
    return isSameLocalDay(d, now);
  });

  let grandTotal = 0;
  const byTable = {};

  todayBills.forEach(bill => {
    grandTotal += Number(bill.total) || 0;
    const t = bill.table || "Unknown";
    if (!byTable[t]) byTable[t] = { total: 0, count: 0, itemsMap: {} };
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
  if (!w) {
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

if (adminToken) {
  panel.style.display = "block";
  loadAll().catch(() => {});
}

setInterval(() => {
  if (adminToken) {
    loadAll().catch(() => {});
  }
}, 3000);
