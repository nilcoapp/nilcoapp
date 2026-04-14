/* ===== NILCO INT V2.0 - Sales Management System ===== */

/* ===== SERVER SYNC CONFIG ===== */
const JSON_BIN_URL = 'https://nilcoapp.onrender.com/api/state';
const API_KEY = 'nilco123';
/* ============================== */

const STORAGE_KEY = 'nilco-int-v2';
const SESSION_KEY = STORAGE_KEY + '-session';
const DRAFT_KEY = STORAGE_KEY + '-draft';

const DEFAULT_USERS = [
  {id:"rep1",username:"Van",role:"rep",pin:"1001",active:true,sector:""},
  {id:"rep2",username:"TBC",role:"rep",pin:"1002",active:true,sector:""},
  {id:"rep3",username:"Office",role:"rep",pin:"1003",active:true,sector:""},
  {id:"rep4",username:"No SR",role:"rep",pin:"1004",active:true,sector:""},
  {id:"rep5",username:"Mohamed Gom3a",role:"rep",pin:"1005",active:true,sector:""},
  {id:"rep6",username:"Manager",role:"rep",pin:"1006",active:true,sector:""},
  {id:"rep7",username:"Mahmoud Samir",role:"rep",pin:"1007",active:true,sector:""},
  {id:"rep8",username:"Maher Moheb",role:"rep",pin:"1008",active:true,sector:""},
  {id:"rep9",username:"Hassan Mostafa",role:"rep",pin:"1009",active:true,sector:""},
  {id:"rep10",username:"Halla Hamdy",role:"rep",pin:"1010",active:true,sector:""},
  {id:"rep11",username:"Ahmed Hosny",role:"rep",pin:"1011",active:true,sector:""},
  {id:"rep12",username:"Ahmed Farid",role:"rep",pin:"1012",active:true,sector:""},
  {id:"rep13",username:"Abanoub",role:"rep",pin:"1013",active:true,sector:""},
  {id:"super1",username:"المشرف",role:"supervisor",pin:"3333",active:true,sector:""},
  {id:"admin1",username:"الادمين",role:"admin",pin:"4444",active:true,sector:""}
];

const DEFAULT_DATA = {
  users: DEFAULT_USERS,
  clients: [],
  products: [],
  invoices: [],
  followups: [],
  messages: [],
  onlineUsers: {},
  invoiceCounter: 0
};

const state = {
  data: null,
  currentUser: null,
  workingInvoice: [],
  filteredProducts: []
};

const byId = id => document.getElementById(id);
const money = n => Number(n || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 }) + ' ج';

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.data = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_DATA));
  } catch (e) {
    state.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  if (!Array.isArray(state.data.users)) state.data.users = [];
  if (!Array.isArray(state.data.clients)) state.data.clients = [];
  if (!Array.isArray(state.data.products)) state.data.products = [];
  if (!Array.isArray(state.data.invoices)) state.data.invoices = [];
  if (!Array.isArray(state.data.followups)) state.data.followups = [];
  if (!Array.isArray(state.data.messages)) state.data.messages = [];
  if (!state.data.onlineUsers || typeof state.data.onlineUsers !== 'object') state.data.onlineUsers = {};
  if (typeof state.data.invoiceCounter !== 'number') state.data.invoiceCounter = 0;

  DEFAULT_USERS.forEach(u => {
    const ex = state.data.users.find(x => x.id === u.id || x.username === u.username);
    if (!ex) state.data.users.push({ ...u });
    else {
      if (!ex.pin) ex.pin = u.pin;
      if (ex.active == null) ex.active = true;
      if (!ex.role) ex.role = u.role;
      if (ex.sector == null) ex.sector = u.sector || '';
    }
  });

  save();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[m]));
}

function renderLoginUsers() {
  const users = state.data.users.filter(u => u.active !== false);
  const select = byId('login-user');
  if (!select) return;
  select.innerHTML = users
    .map(u => `<option value="${u.id}">${escapeHtml(u.username)}</option>`)
    .join('');
}

async function pullFromServer() {
  try {
    const r = await fetch(JSON_BIN_URL, {
      cache: 'no-store',
      headers: { 'x-api-key': API_KEY }
    });

    if (!r.ok) return;

    const remote = await r.json();
    if (!remote || typeof remote !== 'object') return;

    state.data = {
      ...state.data,
      ...remote,
      users: Array.isArray(remote.users) ? remote.users : state.data.users,
      clients: Array.isArray(remote.clients) ? remote.clients : state.data.clients,
      products: Array.isArray(remote.products) ? remote.products : state.data.products,
      invoices: Array.isArray(remote.invoices) ? remote.invoices : state.data.invoices,
      followups: Array.isArray(remote.followups) ? remote.followups : state.data.followups,
      messages: Array.isArray(remote.messages) ? remote.messages : state.data.messages,
      onlineUsers: remote.onlineUsers && typeof remote.onlineUsers === 'object'
        ? remote.onlineUsers
        : state.data.onlineUsers,
      invoiceCounter: Number(remote.invoiceCounter || state.data.invoiceCounter || 0)
    };

    DEFAULT_USERS.forEach(u => {
      const ex = state.data.users.find(x => x.id === u.id || x.username === u.username);
      if (!ex) state.data.users.push({ ...u });
      else {
        if (!ex.pin) ex.pin = u.pin;
        if (ex.active == null) ex.active = true;
        if (!ex.role) ex.role = u.role;
        if (ex.sector == null) ex.sector = u.sector || '';
      }
    });

    save();
  } catch (e) {
    console.log('pullFromServer failed', e);
  }
}

async function pushToServer() {
  try {
    await fetch(JSON_BIN_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify(state.data)
    });
  } catch (e) {
    console.log('pushToServer failed', e);
  }
}

async function syncInvoice() {
  await pushToServer();
}

async function syncFollowup() {
  await pushToServer();
}

async function updateOnlineStatus() {
  try {
    if (!state.currentUser) return;

    await fetch('https://nilcoapp.onrender.com/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({
        onlineUsers: {
          [state.currentUser.id]: {
            name: state.currentUser.username,
            at: Date.now()
          }
        }
      })
    });
  } catch (e) {
    console.log('updateOnlineStatus failed', e);
  }
}

function login() {
  const userId = byId('login-user')?.value;
  const pin = byId('login-pin')?.value?.trim();
  const msg = byId('login-msg');

  if (msg) msg.textContent = '';

  const user = state.data.users.find(
    u => u.id === userId && String(u.pin) === String(pin) && u.active !== false
  );

  if (!user) {
    if (msg) msg.textContent = 'بيانات الدخول غير صحيحة';
    else alert('بيانات الدخول غير صحيحة');
    return;
  }

  state.currentUser = user;
  if (byId('login-pin')) byId('login-pin').value = '';

  if (user.role === 'rep') {
    setupRepScreen();
    if (byId('rep-screen')) show('rep-screen');
  } else {
    if (typeof renderDesk === 'function') renderDesk();
    if (byId('desk-screen')) show('desk-screen');
  }

  updateOnlineStatus();
}

function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = byId(screenId);
  if (el) el.classList.add('active');
}

function repClients() {
  if (!state.currentUser) return [];
  const repName = state.currentUser.username;
  const sector = byId('rep-sector')?.value || state.currentUser.sector || '';
  return state.data.clients.filter(c => c.repName === repName && (!sector || c.sector === sector));
}

function setupRepScreen() {
  state.workingInvoice = [];

  const repName = state.currentUser.username;
  const repClientList = state.data.clients.filter(c => c.repName === repName);
  const sectors = [...new Set(repClientList.map(c => c.sector).filter(Boolean))];

  if (byId('rep-sector')) {
    byId('rep-sector').innerHTML = ['<option value="">كل القطاعات</option>']
      .concat(sectors.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`))
      .join('');
  }

  renderRepClients();
  if (typeof toggleStatusMode === 'function') toggleStatusMode();
  filterProducts();
  renderInvoiceLines();
  if (typeof hideWhatsAppBtn === 'function') hideWhatsAppBtn();
}

function renderRepClients() {
  const list = repClients();
  const select = byId('rep-client');
  if (!select) return;

  select.innerHTML = list.length
    ? list.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
    : '<option value="">لا يوجد عملاء لهذا المندوب</option>';

  onClientChange();
}

function onClientChange() {
  const client = getSelectedClient();
  const codeInput = byId('rep-client-code');
  if (codeInput) codeInput.value = client ? client.code || '' : '';
}

function getSelectedClient() {
  const selectedId = byId('rep-client')?.value;
  return state.data.clients.find(c => c.id === selectedId) || null;
}

function toggleStatusMode() {
  const mode = byId('rep-status')?.value || 'invoice';
  byId('followup-box')?.classList.toggle('hidden', mode !== 'followup');
  byId('sale-box')?.classList.toggle('hidden', mode !== 'invoice');
  byId('inventory-box')?.classList.toggle('hidden', mode !== 'inventory');
}

function saveFollowup() {
  const client = getSelectedClient();
  const note = byId('rep-note')?.value?.trim();

  if (!client) return alert('اختر العميل');
  if (!note) return alert('اكتب الملاحظة');

  const followup = {
    id: 'f_' + Date.now(),
    clientId: client.id,
    clientName: client.name,
    repId: state.currentUser.id,
    repName: state.currentUser.username,
    sector: client.sector || '',
    note,
    createdAt: new Date().toISOString()
  };

  state.data.followups.unshift(followup);
  if (byId('rep-note')) byId('rep-note').value = '';
  save();
  syncFollowup();
}

function filterProducts() {
  const q = (byId('product-search')?.value || '').trim().toLowerCase();
  const products = state.data.products.filter(
    p =>
      !q ||
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.barcode || '').includes(q) ||
      String(p.code || '').includes(q)
  );

  state.filteredProducts = products;

  const select = byId('product-select');
  if (!select) return;

  select.innerHTML = products
    .map(p => `<option value="${p.id}">${escapeHtml(p.name)}${Number(p.stock || 0) <= 50 ? ' - غير متاح' : ''}</option>`)
    .join('');

  onSelectProduct();
}

function getSelectedProduct() {
  return state.data.products.find(p => p.id === byId('product-select')?.value) || state.filteredProducts[0] || null;
}

function onSelectProduct() {
  const p = getSelectedProduct();
  if (byId('stock-view')) byId('stock-view').value = p ? (p.stock ?? 0) : '';
  if (byId('prod-name-box')) byId('prod-name-box').textContent = p ? p.name : '—';
  if (byId('price-box')) byId('price-box').textContent = p ? money(p.price) : '—';

  const qty = Number(byId('qty-input')?.value || 0);
  if (byId('qty-box')) byId('qty-box').textContent = qty || '—';
  if (byId('line-total-box')) byId('line-total-box').textContent =
    p && qty ? money(qty * Number(p.price || 0)) : '—';
}

function addLine() {
  const p = getSelectedProduct();
  const qtyText = byId('qty-input')?.value?.trim();
  const qty = Number(qtyText);

  if (!p) return alert('اختر الصنف');
  if (!qtyText || !qty || qty < 1) return alert('اكتب كمية صحيحة');
  if (Number(p.stock || 0) <= 50) return alert('هذا الصنف رصيده 50 أو أقل وغير متاح للطلب');
  if (qty > Number(p.stock || 0)) return alert('الكمية المطلوبة أكبر من المخزون');

  state.workingInvoice.push({
    productId: p.id,
    name: p.name,
    code: p.code || '',
    barcode: p.barcode || '',
    price: Number(p.price || 0),
    qty,
    total: Number(p.price || 0) * qty
  });

  if (byId('qty-input')) byId('qty-input').value = '';
  renderInvoiceLines();
  onSelectProduct();
}

function askRemoveLine(i) {
  state.workingInvoice.splice(i, 1);
  renderInvoiceLines();
}

function removeLine(i) {
  askRemoveLine(i);
}

function renderInvoiceLines() {
  const tbody = byId('invoice-lines');
  if (!tbody) return;

  const rows = state.workingInvoice.map((l, i) => `
    <tr>
      <td>${escapeHtml(l.name)}</td>
      <td style="font-size:11px;color:var(--muted)">${escapeHtml(l.barcode || '—')}</td>
      <td>${l.qty}</td>
      <td>${money(l.price)}</td>
      <td>${money(l.total)}</td>
      <td><button class="btn btn-danger" style="padding:6px 10px;font-size:11px" onclick="removeLine(${i})">حذف</button></td>
    </tr>
  `).join('');

  tbody.innerHTML = rows || '<tr><td colspan="6" class="muted">لا توجد أصناف مضافة</td></tr>';

  const total = state.workingInvoice.reduce((s, l) => s + Number(l.total || 0), 0);
  if (byId('invoice-total')) byId('invoice-total').textContent = money(total);
  if (byId('invoice-items-count')) byId('invoice-items-count').textContent = state.workingInvoice.length + ' صنف';
}

async function saveInvoice() {
  const client = getSelectedClient();
  if (!client) return alert('اختر العميل');
  if (!state.workingInvoice.length) return alert('أضف صنفًا واحدًا على الأقل');

  for (const line of state.workingInvoice) {
    const prod = state.data.products.find(p => p.id === line.productId);
    if (!prod) return alert('أحد الأصناف غير موجود');
    if (Number(prod.stock || 0) < Number(line.qty || 0)) {
      return alert('المخزون غير كافٍ للصنف: ' + prod.name);
    }
  }

  state.data.invoiceCounter = (state.data.invoiceCounter || 0) + 1;
  const invNumber = state.data.invoiceCounter;

  state.workingInvoice.forEach(line => {
    const prod = state.data.products.find(p => p.id === line.productId);
    if (prod) prod.stock = Number(prod.stock || 0) - Number(line.qty || 0);
  });

  const inv = {
    id: 'i_' + Date.now(),
    invoiceNumber: invNumber,
    clientId: client.id,
    customer: client.name,
    customerCode: client.code || '',
    sector: client.sector || '',
    repId: state.currentUser.id,
    repName: state.currentUser.username,
    total: state.workingInvoice.reduce((s, l) => s + Number(l.total || 0), 0),
    lines: JSON.parse(JSON.stringify(state.workingInvoice)),
    createdAt: new Date().toISOString()
  };

  state.data.invoices.unshift(inv);
  state.workingInvoice = [];
  save();

  renderInvoiceLines();

  await syncInvoice();
  await pullFromServer();
  filterProducts();

  alert('تم حفظ الفاتورة رقم ' + invNumber);
}

function showWhatsAppBtn() {}
function hideWhatsAppBtn() {}
function sendWhatsApp() {}
function sendWhatsAppForInvoice() {}

window.addEventListener('load', async () => {
  loadData();
  renderLoginUsers();
  await pullFromServer();
  renderLoginUsers();
});
