let MENU = { categories: [] };
let staffToken = localStorage.getItem("staff_token") || "";
let activeTable = localStorage.getItem("kahu_active_table_v1") || "";

const STORE_KEY = "kahu_qrorder_version_one";

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

function saveStore(store){
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function getCurrentTableData(){
  const store = readStore();
  if(!activeTable || !store.tables[activeTable]){
    return null;
  }
  return store.tables[activeTable];
}

function calcItemsTotal(items){
  return (items || []).reduce((sum, item) => {
    return sum + ((Number(item.price) || 0) * (Number(item.qty) || 0));
  }, 0);
}

function saveActiveTableName(name){
  activeTable = name || "";
  localStorage.setItem("kahu_active_table_v1", activeTable);
}

function showScreen(){
  if(staffToken){
    loginCard.style.display = "none";
    staffCard.style.display = "block";
    loadMenu();
    renderAll();
  }else{
    loginCard.style.display = "block";
    staffCard.style.display = "none";
  }
}

async function staffLogin(){
  loginMsg.textContent = "Logging in...";
  const pin = document.getElementById("staffPin").value.trim();

  const res = await fetch("/api/staff/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin })
  });

  const data = await res.json();
  if(!res.ok){
    loginMsg.textContent = "❌ " + (data.error || "Login failed");
    return;
  }

  staffToken = data.token;
  localStorage.setItem("staff_token", staffToken);
  loginMsg.textContent = "✅ Login successful";
  showScreen();
}

function logout(){
  staffToken = "";
  localStorage.removeItem("staff_token");
  showScreen();
}

async function loadMenu(){
  msg.textContent = "Loading menu...";
  try{
    const res = await fetch("/api/menu");
    const data = await res.json();
    if(!res.ok){
      msg.textContent = "❌ Menu load failed";
      return;
    }

    MENU = data;
    renderMenu();
    renderSelected();
    msg.textContent = "Menu loaded";
  }catch(e){
    msg.textContent = "❌ Menu load failed";
  }
}

function ensureActiveTableForMenu(){
  const store = readStore();
  if(activeTable && store.tables[activeTable]){
    return true;
  }

  const names = Object.keys(store.tables);
  if(names.length){
    saveActiveTableName(names[0]);
    renderAll();
    return true;
  }

  msg.textContent = "❌ First add table";
  return false;
}

function addTable(){
  tableMsg.textContent = "";
  const input = document.getElementById("tableInput");
  const name = input.value.trim();

  if(!name){
    tableMsg.textContent = "❌ Table name required";
    return;
  }

  const store = readStore();
  if(!store.tables[name]){
    store.tables[name] = {
      table: name,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveStore(store);
  }

  saveActiveTableName(name);
  input.value = "";
  tableMsg.textContent = "✅ Table ready";
  renderAll();
}

function selectTable(name){
  saveActiveTableName(name);
  renderAll();
}

function deleteWholeTable(name){
  const store = readStore();
  if(!store.tables[name]) return;

  if(store.tables[name].items && store.tables[name].items.length){
    const ok = confirm("This table still has items. Delete whole ongoing bill?");
    if(!ok) return;
  }

  delete store.tables[name];
  saveStore(store);

  if(activeTable === name){
    const nextTable = Object.keys(store.tables)[0] || "";
    saveActiveTableName(nextTable);
  }

  renderAll();
}

function addItemToActiveTable(name, price){
  if(!ensureActiveTableForMenu()) return;

  const store = readStore();
  const table = store.tables[activeTable];
  if(!table) return;

  let found = table.items.find(item => item.name === name);
  if(found){
    found.qty += 1;
  }else{
    table.items.push({
      name,
      price: Number(price) || 0,
      qty: 1
    });
  }

  table.updatedAt = new Date().toISOString();
  saveStore(store);
  renderAll();
}

function updateItemQty(name, delta){
  const store = readStore();
  const table = store.tables[activeTable];
  if(!table) return;

  const found = table.items.find(item => item.name === name);
  if(!found) return;

  found.qty += delta;

  if(found.qty <= 0){
    table.items = table.items.filter(item => item.name !== name);
  }

  table.updatedAt = new Date().toISOString();
  saveStore(store);
  renderAll();
}

function removeItem(name){
  const store = readStore();
  const table = store.tables[activeTable];
  if(!table) return;

  table.items = table.items.filter(item => item.name !== name);
  table.updatedAt = new Date().toISOString();
  saveStore(store);
  renderAll();
}

function renderMenu(){
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

function renderTableList(){
  const store = readStore();
  const names = Object.keys(store.tables).sort((a, b) => a.localeCompare(b));
  tableList.innerHTML = "";

  if(!names.length){
    tableList.innerHTML = `<div class="muted">No tables yet.</div>`;
    return;
  }

  names.forEach(name => {
    const table = store.tables[name];
    const total = calcItemsTotal(table.items || []);
    const div = document.createElement("div");
    div.className = "tableCard" + (name === activeTable ? " activeTableCard" : "");
    div.innerHTML = `
      <div>
        <div><b>${name}</b></div>
        <div class="muted">${(table.items || []).length} item types • ${money(total)}</div>
      </div>
      <div class="inlineActions">
        <button class="small fitBtn ${name === activeTable ? "secondary" : ""}" data-select-table="${name}">
          ${name === activeTable ? "Selected" : "Open"}
        </button>
        <button class="small danger fitBtn" data-remove-table="${name}">Delete</button>
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

function renderSelected(){
  const table = getCurrentTableData();
  selectedArea.innerHTML = "";

  if(!table){
    activeTableText.textContent = "No table selected";
    selectedArea.innerHTML = `<div class="muted">Choose or add a table first.</div>`;
    totalText.textContent = money(0);
    return;
  }

  activeTableText.textContent = table.table;

  if(!(table.items || []).length){
    selectedArea.innerHTML = `<div class="muted">No items in this bill yet.</div>`;
    totalText.textContent = money(0);
    return;
  }

  table.items.forEach(item => {
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

  totalText.textContent = money(calcItemsTotal(table.items || []));

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

function renderOngoingBills(){
  const store = readStore();
  const names = Object.keys(store.tables).sort((a, b) => a.localeCompare(b));
  ongoingList.innerHTML = "";

  if(!names.length){
    ongoingList.innerHTML = `<div class="muted">No ongoing bills.</div>`;
    return;
  }

  names.forEach(name => {
    const table = store.tables[name];
    const itemsHtml = (table.items || []).length
      ? table.items.map(item => `<div class="muted">• ${item.name} × ${item.qty}</div>`).join("")
      : `<div class="muted">No items yet.</div>`;

    const div = document.createElement("div");
    div.className = "miniBill";
    div.innerHTML = `
      <div class="rowBetween">
        <div><b>${table.table}</b></div>
        <div class="pill">Ongoing</div>
      </div>
      <div style="height:8px"></div>
      ${itemsHtml}
      <div class="muted"><b>Total:</b> ${money(calcItemsTotal(table.items || []))}</div>
    `;
    ongoingList.appendChild(div);
  });
}

function renderCheckoutBills(){
  const store = readStore();
  const bills = [...store.checkouts].sort((a, b) => {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  checkoutList.innerHTML = "";

  if(!bills.length){
    checkoutList.innerHTML = `<div class="muted">No checkout bills yet.</div>`;
    return;
  }

  bills.forEach(bill => {
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
      <div class="muted">${bill.synced ? "Saved to server" : "Local only"}</div>
    `;
    checkoutList.appendChild(div);
  });
}

function renderAll(){
  renderTableList();
  renderSelected();
  renderOngoingBills();
  renderCheckoutBills();
}

async function checkoutActiveTable(){
  const store = readStore();
  const table = store.tables[activeTable];

  if(!table){
    msg.textContent = "❌ Select table first";
    return;
  }

  if(!(table.items || []).length){
    msg.textContent = "❌ No items in this bill";
    return;
  }

  const billItems = table.items.map(item => ({
    name: item.name,
    price: Number(item.price) || 0,
    qty: Number(item.qty) || 0
  }));

  const localBill = {
    id: "local_" + Date.now(),
    table: table.table,
    items: billItems,
    total: calcItemsTotal(billItems),
    createdAt: new Date().toISOString(),
    synced: false,
    serverId: ""
  };

  let message = "✅ Checkout complete";
  try{
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization":"Bearer " + staffToken
      },
      body: JSON.stringify({
        table: table.table,
        items: billItems
      })
    });

    const data = await res.json();
    if(res.ok){
      localBill.synced = true;
      localBill.serverId = data.id || "";
      message = "✅ Checkout complete and saved";
    }else{
      message = "✅ Checkout saved locally. Server save failed.";
    }
  }catch(e){
    message = "✅ Checkout saved locally. Server unavailable.";
  }

  store.checkouts.unshift(localBill);
  delete store.tables[activeTable];
  saveStore(store);

  const nextTable = Object.keys(store.tables)[0] || "";
  saveActiveTableName(nextTable);
  renderAll();
  msg.textContent = message;
}

document.getElementById("staffLoginBtn").addEventListener("click", staffLogin);
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("addTableBtn").addEventListener("click", addTable);
document.getElementById("checkoutBtn").addEventListener("click", checkoutActiveTable);

document.getElementById("tableInput").addEventListener("keydown", e => {
  if(e.key === "Enter"){
    addTable();
  }
});

showScreen();
