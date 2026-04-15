let MENU = { categories: [] };
let staffToken = localStorage.getItem("staff_token") || "";
let activeTable = "";

const loginCard = document.getElementById("loginCard");
const staffCard = document.getElementById("staffCard");
const menuArea = document.getElementById("menuArea");
const selectedArea = document.getElementById("selectedArea");
const totalText = document.getElementById("totalText");
const msg = document.getElementById("msg");
const loginMsg = document.getElementById("loginMsg");
const tableList = document.getElementById("tableList");
const tableMsg = document.getElementById("tableMsg");
const ongoingList = document.getElementById("ongoingList");
const checkoutList = document.getElementById("checkoutList");
const activeTableText = document.getElementById("activeTableText");

function money(n) {
  return "NPR " + (Number(n) || 0);
}

function calcItemsTotal(items) {
  return (items || []).reduce((sum, item) => {
    return sum + ((Number(item.price) || 0) * (Number(item.qty) || 0));
  }, 0);
}

async function api(url, options = {}) {
  const headers = options.headers || {};
  if (staffToken) {
    headers.Authorization = "Bearer " + staffToken;
  }
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

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

function showScreen() {
  if (staffToken) {
    loginCard.style.display = "none";
    staffCard.style.display = "block";
    loadStartData();
  } else {
    loginCard.style.display = "block";
    staffCard.style.display = "none";
  }
}

async function staffLogin() {
  loginMsg.textContent = "Logging in...";
  try {
    const pin = document.getElementById("staffPin").value.trim();
    const res = await fetch("/api/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin })
    });

    const data = await res.json();
    if (!res.ok) {
      loginMsg.textContent = "❌ " + (data.error || "Login failed");
      return;
    }

    staffToken = data.token;
    localStorage.setItem("staff_token", staffToken);
    loginMsg.textContent = "✅ Login successful";
    showScreen();
  } catch {
    loginMsg.textContent = "❌ Login failed";
  }
}

function logout() {
  staffToken = "";
  activeTable = "";
  localStorage.removeItem("staff_token");
  showScreen();
}

async function loadMenu() {
  const res = await fetch("/api/menu");
  const data = await res.json();
  MENU = data;
  renderMenu();
}

async function loadStartData() {
  msg.textContent = "Loading...";
  try {
    await loadMenu();
    await refreshAll();
    msg.textContent = "Ready";
  } catch (err) {
    msg.textContent = "❌ " + err.message;
  }
}

async function refreshAll() {
  const ongoing = await api("/api/ongoing");
  const checkouts = await api("/api/checkouts");

  if (!activeTable && ongoing.length) {
    activeTable = ongoing[0].table;
  }
  if (activeTable && !ongoing.find(bill => bill.table === activeTable)) {
    activeTable = ongoing.length ? ongoing[0].table : "";
  }

  renderTableList(ongoing);
  renderSelected(ongoing);
  renderOngoingBills(ongoing);
  renderCheckoutBills(checkouts);
}

async function addTable() {
  tableMsg.textContent = "";
  const input = document.getElementById("tableInput");
  const table = input.value.trim();

  if (!table) {
    tableMsg.textContent = "❌ Table name required";
    return;
  }

  try {
    await api("/api/ongoing/open", {
      method: "POST",
      body: JSON.stringify({ table })
    });
    activeTable = table;
    input.value = "";
    tableMsg.textContent = "✅ Table ready";
    await refreshAll();
  } catch (err) {
    tableMsg.textContent = "❌ " + err.message;
  }
}

function selectTable(name) {
  activeTable = name;
  refreshAll();
}

async function deleteWholeTable(name) {
  const ok = confirm("Delete whole ongoing bill?");
  if (!ok) return;

  try {
    await api("/api/ongoing/" + encodeURIComponent(name), {
      method: "DELETE"
    });
    if (activeTable === name) {
      activeTable = "";
    }
    await refreshAll();
  } catch (err) {
    msg.textContent = "❌ " + err.message;
  }
}

async function addItemToActiveTable(name, price) {
  if (!activeTable) {
    msg.textContent = "❌ First add or open a table";
    return;
  }

  try {
    await api("/api/ongoing/" + encodeURIComponent(activeTable) + "/items", {
      method: "POST",
      body: JSON.stringify({ name, price, qty: 1 })
    });
    msg.textContent = "✅ Item added";
    await refreshAll();
  } catch (err) {
    msg.textContent = "❌ " + err.message;
  }
}

async function updateItemQty(name, delta) {
  if (!activeTable) return;

  try {
    await api("/api/ongoing/" + encodeURIComponent(activeTable) + "/items", {
      method: "PATCH",
      body: JSON.stringify({ name, delta })
    });
    await refreshAll();
  } catch (err) {
    msg.textContent = "❌ " + err.message;
  }
}

async function removeItem(name) {
  if (!activeTable) return;

  try {
    await api("/api/ongoing/" + encodeURIComponent(activeTable) + "/items", {
      method: "DELETE",
      body: JSON.stringify({ name })
    });
    await refreshAll();
  } catch (err) {
    msg.textContent = "❌ " + err.message;
  }
}

function renderMenu() {
  menuArea.innerHTML = "";

  (MENU.categories || []).forEach(cat => {
    const box = document.createElement("div");
    box.className = "cat";

    const header = document.createElement("div");
    header.className = "catHeader";
    header.innerHTML = `<span>${cat.name}</span><span>Tap</span>`;

    const itemsDiv = document.createElement("div");
    itemsDiv.className = "catItems";

    (cat.items || []).forEach(it => {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML = `
        <div>
          <div class="itemName">${it.name}</div>
          <div class="itemPrice">${money(it.price)}</div>
        </div>
        <div class="qtyBox">
          <button class="small fitBtn" data-add-item="${it.name}" data-price="${it.price}">Add</button>
        </div>
      `;
      itemsDiv.appendChild(row);
    });

    header.onclick = () => itemsDiv.classList.toggle("open");

    box.appendChild(header);
    box.appendChild(itemsDiv);
    menuArea.appendChild(box);
  });

  menuArea.querySelectorAll("[data-add-item]").forEach(btn => {
    btn.onclick = () => {
      addItemToActiveTable(btn.dataset.addItem, Number(btn.dataset.price));
    };
  });
}

function renderTableList(ongoing) {
  tableList.innerHTML = "";

  if (!ongoing.length) {
    tableList.innerHTML = `<div class="muted">No tables yet.</div>`;
    return;
  }

  ongoing.forEach(bill => {
    const div = document.createElement("div");
    div.className = "tableCard" + (bill.table === activeTable ? " activeTableCard" : "");
    div.innerHTML = `
      <div>
        <div><b>${bill.table}</b></div>
        <div class="muted">${(bill.items || []).length} item types • ${money(bill.total)}</div>
      </div>
      <div class="inlineActions">
        <button class="small fitBtn ${bill.table === activeTable ? "secondary" : ""}" data-select-table="${bill.table}">
          ${bill.table === activeTable ? "Selected" : "Open"}
        </button>
        <button class="small danger fitBtn" data-remove-table="${bill.table}">Delete</button>
      </div>
    `;
    tableList.appendChild(div);
  });

  tableList.querySelectorAll("[data-select-table]").forEach(btn => {
    btn.onclick = () => selectTable(btn.dataset.selectTable);
  });

  tableList.querySelectorAll("[data-remove-table]").forEach(btn => {
    btn.onclick = () => deleteWholeTable(btn.dataset.removeTable);
  });
}

function renderSelected(ongoing) {
  const bill = ongoing.find(item => item.table === activeTable);
  selectedArea.innerHTML = "";

  if (!bill) {
    activeTableText.textContent = "No table selected";
    selectedArea.innerHTML = `<div class="muted">Choose or add a table first.</div>`;
    totalText.textContent = money(0);
    return;
  }

  activeTableText.textContent = bill.table;

  if (!(bill.items || []).length) {
    selectedArea.innerHTML = `<div class="muted">No items in this bill yet.</div>`;
    totalText.textContent = money(0);
    return;
  }

  bill.items.forEach(item => {
    const row = document.createElement("div");
    row.className = "selectedRow";
    row.innerHTML = `
      <div>
        <div><b>${item.name}</b></div>
        <div class="muted">${money(item.price)} × ${item.qty} = ${money(item.price * item.qty)}</div>
      </div>
      <div class="inlineActions">
        <button class="small fitBtn" data-minus="${item.name}">-</button>
        <button class="small fitBtn" data-plus="${item.name}">+</button>
        <button class="small danger fitBtn" data-delete-item="${item.name}">Delete</button>
      </div>
    `;
    selectedArea.appendChild(row);
  });

  totalText.textContent = money(calcItemsTotal(bill.items || []));

  selectedArea.querySelectorAll("[data-minus]").forEach(btn => {
    btn.onclick = () => updateItemQty(btn.dataset.minus, -1);
  });
  selectedArea.querySelectorAll("[data-plus]").forEach(btn => {
    btn.onclick = () => updateItemQty(btn.dataset.plus, 1);
  });
  selectedArea.querySelectorAll("[data-delete-item]").forEach(btn => {
    btn.onclick = () => removeItem(btn.dataset.deleteItem);
  });
}

function renderOngoingBills(ongoing) {
  ongoingList.innerHTML = "";

  if (!ongoing.length) {
    ongoingList.innerHTML = `<div class="muted">No ongoing bills.</div>`;
    return;
  }

  ongoing.forEach(bill => {
    const itemsHtml = (bill.items || []).length
      ? bill.items.map(item => `<div class="muted">• ${item.name} × ${item.qty}</div>`).join("")
      : `<div class="muted">No items yet.</div>`;

    const div = document.createElement("div");
    div.className = "miniBill";
    div.innerHTML = `
      <div class="rowBetween">
        <div><b>${bill.table}</b></div>
        <div class="pill">Ongoing</div>
      </div>
      <div class="muted">${new Date(bill.updatedAt || bill.createdAt || Date.now()).toLocaleString()}</div>
      <div style="height:8px"></div>
      ${itemsHtml}
      <div class="muted"><b>Total:</b> ${money(bill.total)}</div>
    `;
    ongoingList.appendChild(div);
  });
}

function renderCheckoutBills(checkouts) {
  checkoutList.innerHTML = "";

  if (!checkouts.length) {
    checkoutList.innerHTML = `<div class="muted">No checkout bills yet.</div>`;
    return;
  }

  checkouts.slice(0, 20).forEach(bill => {
    const div = document.createElement("div");
    div.className = "miniBill";
    div.innerHTML = `
      <div class="rowBetween">
        <div><b>${bill.table}</b></div>
        <div class="pill">Checkout</div>
      </div>
      <div class="muted">${new Date(bill.createdAt).toLocaleString()}</div>
      <div style="height:8px"></div>
      ${(bill.items || []).map(item => `<div class="muted">• ${item.name} × ${item.qty}</div>`).join("")}
      <div class="muted"><b>Total:</b> ${money(bill.total)}</div>
    `;
    checkoutList.appendChild(div);
  });
}

async function checkoutActiveTable() {
  if (!activeTable) {
    msg.textContent = "❌ Select table first";
    return;
  }

  try {
    await api("/api/ongoing/" + encodeURIComponent(activeTable) + "/checkout", {
      method: "POST"
    });
    msg.textContent = "✅ Checkout complete";
    activeTable = "";
    await refreshAll();
  } catch (err) {
    msg.textContent = "❌ " + err.message;
  }
}

document.getElementById("staffLoginBtn").addEventListener("click", staffLogin);
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("addTableBtn").addEventListener("click", addTable);
document.getElementById("checkoutBtn").addEventListener("click", checkoutActiveTable);
document.getElementById("tableInput").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    addTable();
  }
});

showScreen();

setInterval(() => {
  if (staffToken) {
    refreshAll().catch(() => {});
  }
}, 3000);
