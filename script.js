/* ===== NILCO INT V2.0 - Sales Management System ===== */
// fix deploy
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
const DEFAULT_CLIENTS = [];

const DEFAULT_DATA = {
  users: DEFAULT_USERS,
  clients: DEFAULT_CLIENTS,
  products: [],
  invoices: [],
  followups: [],
  stockAlertsSeenAt: '',
  messages: [],
  invoiceCounter: 0
};

const state = {
  data: null,
  currentUser: null,
  deskTab: 'dashboard',
  workingInvoice: [],
  workingInventory: [],
  filteredProducts: [],
  reportRep: 'all',
  reportFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10),
  reportTo: new Date().toISOString().slice(0,10),
  reportMonth: new Date().toISOString().slice(0,7),
  lastSavedInvoice: null,
  pendingConfirmAction: null,
  viewingInvoice: null,
  serverOnline: false
};

const byId = id => document.getElementById(id);
const money = n => Number(n || 0).toLocaleString('ar-EG', {maximumFractionDigits:2}) + ' ج';
const today = () => new Date().toISOString().slice(0,10);
const monthOf = d => String(d || '').slice(0,7);
const dt = s => new Date(s).toLocaleString('ar-EG');
const save = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data)); };

/* ===== TOAST ===== */
function showToast(msg, duration=2500){
  const t = byId('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

/* ===== SESSION ===== */
function saveSession(){
  try {
    if(!state.currentUser){ localStorage.removeItem(SESSION_KEY); return; }
    const payload = {
      userId: state.currentUser.id,
      deskTab: state.deskTab || 'dashboard',
      repSector: byId('rep-sector')?.value || '',
      repClient: byId('rep-client')?.value || '',
      repStatus: byId('rep-status')?.value || 'invoice',
      repNote: byId('rep-note')?.value || ''
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch(e) {}
}

function saveDraft(){
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ workingInvoice: state.workingInvoice || [] }));
    saveSession();
  } catch(e) {}
}

function clearDraftAndSession(keepUserSession=false){
  try {
    localStorage.removeItem(DRAFT_KEY);
    if(!keepUserSession) localStorage.removeItem(SESSION_KEY);
  } catch(e) {}
}

function restoreSession(){
  try {
    const rawSession = localStorage.getItem(SESSION_KEY);
    const rawDraft = localStorage.getItem(DRAFT_KEY);
    const session = rawSession ? JSON.parse(rawSession) : null;
    const draft = rawDraft ? JSON.parse(rawDraft) : null;
    if(draft && Array.isArray(draft.workingInvoice)) state.workingInvoice = draft.workingInvoice;
    if(!session || !session.userId) return false;
    const user = state.data.users.find(u => u.id === session.userId && u.active !== false);
    if(!user) return false;
    state.currentUser = user;
    state.deskTab = session.deskTab || 'dashboard';
    if(user.role === 'rep') {
      byId('rep-title').innerHTML = 'NILCO <span class="sync-indicator" id="sync-dot"></span>';
      setupRepScreen();
      show('rep-screen');
      if(byId('rep-sector') && session.repSector){
        const opt = [...byId('rep-sector').options].find(o => o.value === session.repSector);
        if(opt) byId('rep-sector').value = session.repSector;
      }
      renderRepClients();
      if(byId('rep-client') && session.repClient){
        const opt = [...byId('rep-client').options].find(o => o.value === session.repClient);
        if(opt) byId('rep-client').value = session.repClient;
      }
      if(byId('rep-status')) byId('rep-status').value = session.repStatus || 'invoice';
      if(byId('rep-note')) byId('rep-note').value = session.repNote || '';
      onClientChange();
      toggleStatusMode();
      renderInvoiceLines();
      onSelectProduct();
    } else {
      byId('desk-title').innerHTML = 'لوحة التحكم <span class="sync-indicator" id="sync-dot-desk"></span>';
      renderDesk();
      show('desk-screen');
    }
    return true;
  } catch(e) {
    console.error('restoreSession failed', e);
    return false;
  }
}

/* ===== LOAD EXTERNAL CLIENTS ===== */
async function loadExternalClients(){
  try {
    const resp = await fetch('./clients.json');
    if(!resp.ok) return;
    const clients = await resp.json();
    if(!Array.isArray(clients) || !clients.length) return;
    clients.forEach(c => {
      const ex = state.data.clients.find(x => String(x.code||'') === String(c.code||'') || x.name === c.name);
      if(!ex) state.data.clients.push({...c});
      else { ex.code = ex.code || c.code; ex.sector = ex.sector || c.sector; ex.repName = c.repName || ex.repName || ''; }
    });
    save();
  } catch(e) { console.log('Could not load external clients.json', e); }
}

function loadData(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) state.data = JSON.parse(raw);
    else state.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
  } catch(e) { state.data = JSON.parse(JSON.stringify(DEFAULT_DATA)); }
  if(!Array.isArray(state.data.users)) state.data.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
  if(!Array.isArray(state.data.clients)) state.data.clients = [];
  if(!Array.isArray(state.data.products)) state.data.products = [];
  if(!Array.isArray(state.data.invoices)) state.data.invoices = [];
  if(!Array.isArray(state.data.followups)) state.data.followups = [];
  if(!state.data.invoiceCounter) state.data.invoiceCounter = 0;
  DEFAULT_USERS.forEach(u => {
    const ex = state.data.users.find(x => x.id === u.id || x.username === u.username);
    if(!ex) state.data.users.push({...u});
    else { if(!ex.pin) ex.pin = u.pin; if(ex.active == null) ex.active = true; if(!ex.role) ex.role = u.role; if(ex.sector == null) ex.sector = u.sector || ''; }
  });
  save();
}

function show(screenId){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  byId(screenId).classList.add('active');
}

function login(){
  const userId = byId('login-user').value;
  const pin = byId('login-pin').value.trim();
  const msg = byId('login-msg');
  msg.textContent = '';
  const user = state.data.users.find(u => u.id === userId && String(u.pin) === pin && u.active !== false);
  if(!user){ msg.textContent = 'بيانات الدخول غير صحيحة'; return; }
  state.currentUser = user;
  byId('login-pin').value = '';
  saveSession();
  if(user.role === 'rep'){
    byId('rep-title').innerHTML = 'NILCO <span class="sync-indicator" id="sync-dot"></span>';
    setupRepScreen();
    show('rep-screen');
  } else {
    byId('desk-title').innerHTML = 'لوحة التحكم <span class="sync-indicator" id="sync-dot-desk"></span>';
    renderDesk();
    show('desk-screen');
  }
  pullFromServer();
  updateOnlineStatus();
  showToast('مرحباً ' + user.username);
}

function logout(){
  state.currentUser = null;
  state.workingInvoice = [];
  state.lastSavedInvoice = null;
  clearDraftAndSession();
  renderLoginUsers();
  show('login-screen');
  hideWhatsAppBtn();
}

function renderLoginUsers(){
  const users = state.data.users.filter(u => u.active !== false);
  byId('login-user').innerHTML = users.map(u => `<option value="${u.id}">${escapeHtml(u.username)}</option>`).join('');
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}

function repClients(){
  const repName = state.currentUser.username;
  const sector = byId('rep-sector')?.value || state.currentUser.sector || '';
  return state.data.clients.filter(c => c.repName === repName && (!sector || c.sector === sector));
}

function setupRepScreen(){
  state.workingInvoice = [];
  const repName = state.currentUser.username;
  const repClientList = state.data.clients.filter(c => c.repName === repName);
  const sectors = [...new Set(repClientList.map(c => c.sector).filter(Boolean))];
  byId('rep-sector').innerHTML = ['<option value="">كل القطاعات</option>']
    .concat(sectors.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)).join('');
  renderRepClients();
  toggleStatusMode();
    await syncInvoice(inv);
    await pullFromServer();
    filterProducts();

function renderRepClients(){
  const list = repClients();
  byId('rep-client').innerHTML = list.length
    ? list.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
    : '<option value="">لا يوجد عملاء لهذا المندوب</option>';
  onClientChange();
}

function onClientChange(){
  const client = getSelectedClient();
  byId('rep-client-code').value = client ? client.code || '' : '';
  saveSession();
}

function getSelectedClient(){
  const selectedId = byId('rep-client').value;
  return state.data.clients.find(c => c.id === selectedId) || null;
}

function toggleStatusMode(){
  const mode = byId('rep-status').value;
  byId('followup-box').classList.toggle('hidden', mode !== 'followup');
  byId('sale-box').classList.toggle('hidden', mode !== 'invoice');
  byId('inventory-box').classList.toggle('hidden', mode !== 'inventory');
  saveSession();
}

function saveFollowup(){
  const client = getSelectedClient();
  const note = byId('rep-note').value.trim();
  if(!client) return alert('اختر العميل');
  if(!note) return alert('اكتب الملاحظة');
  const followup = {
    id:'f_'+Date.now(),
    clientId: client.id,
    clientName: client.name,
    repId: state.currentUser.id,
    repName: state.currentUser.username,
    sector: client.sector || '',
    note,
    createdAt: new Date().toISOString()
  };
  state.data.followups.unshift(followup);
  byId('rep-note').value = '';
  save();
  saveSession();
  syncFollowup(followup);
  showToast('تم حفظ المتابعة');
}

function filterProducts(){
  const q = (byId('product-search').value || '').trim().toLowerCase();
  const products = state.data.products.filter(p => !q || String(p.name||'').toLowerCase().includes(q) || String(p.barcode||'').includes(q) || String(p.code||'').includes(q));
  state.filteredProducts = products;
  byId('product-select').innerHTML = products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}${p.stock<=50?' - غير متاح':''}</option>`).join('');
  onSelectProduct();
}

function getSelectedProduct(){
  return state.data.products.find(p => p.id === byId('product-select').value) || state.filteredProducts[0] || null;
}

function onSelectProduct(){
  const p = getSelectedProduct();
  byId('stock-view').value = p ? (p.stock ?? 0) : '';
  byId('prod-name-box').textContent = p ? p.name : '—';
  byId('price-box').textContent = p ? money(p.price) : '—';
  const qty = Number(byId('qty-input').value || 0);
  byId('qty-box').textContent = qty || '—';
  byId('line-total-box').textContent = (p && qty) ? money(qty * Number(p.price||0)) : '—';
}

function addLine(){
  const p = getSelectedProduct();
  const qtyText = byId('qty-input').value.trim();
  const qty = Number(qtyText);
  if(!p) return alert('اختر الصنف');
  if(!qtyText || !qty || qty < 1) return alert('اكتب كمية صحيحة');
  if(Number(p.stock || 0) <= 50) return alert('هذا الصنف رصيده 50 أو أقل وغير متاح للطلب');
  if(qty > Number(p.stock || 0)) return alert('الكمية المطلوبة أكبر من المخزون');
  state.workingInvoice.push({
    productId:p.id, name:p.name, code:p.code||'', barcode:p.barcode||'', price:Number(p.price||0), qty, total:Number(p.price||0)*qty
  });
  saveDraft();
  byId('qty-input').value = '';
  renderInvoiceLines();
  onSelectProduct();
  byId('qty-input').focus();
  showToast('تمت إضافة ' + p.name);
}

/* ===== CONFIRM DELETE ===== */
function askRemoveLine(i){
  state.pendingConfirmAction = () => {
    state.workingInvoice.splice(i,1);
    saveDraft();
    renderInvoiceLines();
    showToast('تم حذف السطر');
  };
  byId('confirm-title').textContent = 'تأكيد الحذف';
  byId('confirm-msg').textContent = 'هل أنت متأكد من حذف "' + (state.workingInvoice[i]?.name || '') + '" من الفاتورة؟';
  byId('confirm-modal').classList.add('active');
}
function confirmAction(){
  if(state.pendingConfirmAction) state.pendingConfirmAction();
  state.pendingConfirmAction = null;
  closeConfirm();
}
function closeConfirm(){
  byId('confirm-modal').classList.remove('active');
  state.pendingConfirmAction = null;
}

function removeLine(i){
  askRemoveLine(i);
}

function renderInvoiceLines(){
  const tbody = byId('invoice-lines');
  const rows = state.workingInvoice.map((l,i)=>`<tr>
    <td>${escapeHtml(l.name)}</td>
    <td style="font-size:11px;color:var(--muted)">${escapeHtml(l.barcode||'—')}</td>
    <td>${l.qty}</td>
    <td>${money(l.price)}</td>
    <td>${money(l.total)}</td>
    <td><button class="btn btn-danger" style="padding:6px 10px;font-size:11px" onclick="removeLine(${i})">حذف</button></td>
  </tr>`).join('');
  tbody.innerHTML = rows || '<tr><td colspan="6" class="muted">لا توجد أصناف مضافة</td></tr>';
  const total = state.workingInvoice.reduce((s,l)=>s+Number(l.total||0),0);
  byId('invoice-total').textContent = money(total);
  const countEl = byId('invoice-items-count');
  if(countEl) countEl.textContent = state.workingInvoice.length + ' صنف';
}

async function saveInvoice(){
  const client = getSelectedClient();
  if(!client) return alert('اختر العميل');
  if(!state.workingInvoice.length) return alert('أضف صنفًا واحدًا على الأقل');
  for(const line of state.workingInvoice){
    const prod = state.data.products.find(p => p.id === line.productId);
    if(!prod) return alert('أحد الأصناف غير موجود');
    if(Number(prod.stock||0) < Number(line.qty||0)) return alert('المخزون غير كافٍ للصنف: ' + prod.name);
  }
  state.data.invoiceCounter = (state.data.invoiceCounter || 0) + 1;
  const invNumber = state.data.invoiceCounter;
  state.workingInvoice.forEach(line => {
    const prod = state.data.products.find(p => p.id === line.productId);
    if(prod) prod.stock = Number(prod.stock||0) - Number(line.qty||0);
  });

  const inv = {
    id:'i_'+Date.now(),
    invoiceNumber: invNumber,
    clientId: client.id,
    customer: client.name,
    customerCode: client.code || '',
    sector: client.sector || '',
    repId: state.currentUser.id,
    repName: state.currentUser.username,
    total: state.workingInvoice.reduce((s,l)=>s+Number(l.total||0),0),
    lines: JSON.parse(JSON.stringify(state.workingInvoice)),
    createdAt: new Date().toISOString()
  };
  state.data.invoices.unshift(inv);
  state.lastSavedInvoice = inv;
  state.workingInvoice = [];
  save();
  localStorage.removeItem(DRAFT_KEY);
  saveSession();
  renderInvoiceLines();
  filterProducts();
    await syncInvoice(inv);
    await pullFromServer();
filterProducts();
  showToast('تم حفظ الفاتورة رقم ' + invNumber);
}

/* ===== WHATSAPP ===== */
function showWhatsAppBtn(){
  const container = byId('whatsapp-btn-container');
  if(container) container.classList.remove('hidden');
}
function hideWhatsAppBtn(){
  const container = byId('whatsapp-btn-container');
  if(container) container.classList.add('hidden');
}
function sendWhatsApp(){
  const inv = state.lastSavedInvoice;
  if(!inv) return alert('لا توجد فاتورة محفوظة');
  sendWhatsAppForInvoice(inv);
}
function sendWhatsAppForInvoice(inv){
  if(typeof XLSX === 'undefined') return alert('مكتبة Excel لم تُحمّل');
  const wb = XLSX.utils.book_new();
  const data = [];
  data.push(['NILCO INT. — فاتورة مبيعات']);
  data.push(['رقم الفاتورة:', '#' + (inv.invoiceNumber || '—'), '', 'التاريخ:', String(inv.createdAt).slice(0,10)]);
  data.push(['العميل:', inv.customer, '', 'كود العميل:', inv.customerCode || '']);
  data.push(['المندوب:', inv.repName, '', 'القطاع:', inv.sector || '']);
  data.push([]);
  data.push(['الصنف', 'الباركود', 'الكود', 'الكمية', 'السعر', 'الإجمالي']);
  (inv.lines || []).forEach(l => {
    data.push([l.name, l.barcode || '', l.code || '', l.qty, l.price, l.total]);
  });
  data.push([]);
  data.push(['', '', '', '', 'الإجمالي:', inv.total]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:30},{wch:18},{wch:12},{wch:8},{wch:12},{wch:14}];
  ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:5}}];
  XLSX.utils.book_append_sheet(wb, ws, 'فاتورة');
  const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
  const blob = new Blob([wbout], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const fileName = `فاتورة_${inv.customer}_${inv.invoiceNumber||''}.xlsx`;
  const file = new File([blob], fileName, {type: blob.type});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    navigator.share({title:'فاتورة NILCO', text:`فاتورة #${inv.invoiceNumber||'—'} — ${inv.customer} — الإجمالي: ${Number(inv.total).toLocaleString('ar-EG')} ج`, files:[file]}).catch(()=>{});
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    const text = `فاتورة NILCO رقم #${inv.invoiceNumber||'—'}\nالعميل: ${inv.customer}\nالإجمالي: ${Number(inv.total).toLocaleString('ar-EG')} ج\n\n(الفاتورة مرفقة كملف Excel)`;
    setTimeout(()=>{ window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); }, 500);
  }
}

/* ===== SERVER SYNC ===== */
async function pullFromServer(){
  try {
    const r = await fetch(JSON_BIN_URL, {cache:'no-store', headers:{'x-api-key': API_KEY}});
const remote = await r.json();
    if(!remote || typeof remote !== 'object') return;
    state.data = {
      ...state.data,
      ...remote,
      users: Array.isArray(remote.users) ? remote.users : state.data.users,
      clients: Array.isArray(remote.clients) ? remote.clients : state.data.clients,
      products: Array.isArray(remote.products) ? remote.products : state.data.products,
      invoices: Array.isArray(remote.invoices) ? remote.invoices : state.data.invoices,
      followups: Array.isArray(remote.followups) ? remote.followups : state.data.followups,
      messages: Array.isArray(remote.messages) ? remote.messages : state.data.messages,
      invoiceCounter: Number(remote.invoiceCounter || state.data.invoiceCounter || 0)
    };
    save();
  } catch(e) {
    console.log('pullFromServer failed', e);
  }
}

async function pushToServer(){
  try {
    await fetch(JSON_BIN_URL, {
      method: 'PUT',
      headers: {'Content-Type':'application/json','x-api-key':API_KEY},
      body: JSON.stringify(state.data)
    });
  } catch(e) {
    console.log('pushToServer failed', e);
  }
}

async function syncInvoice(invoice){ await pushToServer(); }
async function syncFollowup(followup){ await pushToServer(); }

async function updateOnlineStatus(){
  try {
    await fetch('https://nilcoapp.onrender.com/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ onlineUsers: { [state.currentUser?.id || 'guest']: { name: state.currentUser?.username || 'Guest', at: Date.now() } } })
    });
  } catch(e) {
    console.log('updateOnlineStatus failed', e);
  }
}

window.addEventListener('load', async () => {
  loadData();
  await loadExternalClients();
  renderLoginUsers();
  await pullFromServer();
  restoreSession();
});
```

---

# server.js

```javascript
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const API_KEY = 'nilco123';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_STORE = {
  users: [],
  clients: [],
  products: [],
  invoices: [],
  followups: [],
  inventories: [],
  messages: [],
  onlineUsers: {},
  stockAlertsSeenAt: '',
  invoiceCounter: 0,
  lastUpdated: 0
};

function normalizeStore(data) {
  const parsed = data && typeof data === 'object' ? data : {};
  return {
    ...DEFAULT_STORE,
    ...parsed,
    users: Array.isArray(parsed.users) ? parsed.users : [],
    clients: Array.isArray(parsed.clients) ? parsed.clients : [],
    products: Array.isArray(parsed.products) ? parsed.products : [],
    invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
    followups: Array.isArray(parsed.followups) ? parsed.followups : [],
    inventories: Array.isArray(parsed.inventories) ? parsed.inventories : [],
    messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    onlineUsers: parsed.onlineUsers && typeof parsed.onlineUsers === 'object' ? parsed.onlineUsers : {}
  };
}

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return normalizeStore(JSON.parse(raw));
    }
  } catch (error) {
    console.error('loadStore error:', error);
  }
  return { ...DEFAULT_STORE };
}

function saveStore(data) {
  const payload = normalizeStore({
    ...data,
    lastUpdated: Date.now()
  });
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
}

function sendJson(res, obj, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  }[ext] || 'application/octet-stream';
}

function safeJoin(base, target) {
  const finalPath = path.normalize(path.join(base, target));
  if (!finalPath.startsWith(base)) return null;
  return finalPath;
}

function serveFile(res, filePath) {
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return false;
    }
    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
    return true;
  } catch (error) {
    console.error('serveFile error:', error);
    sendJson(res, { success: false, error: 'File serving failed' }, 500);
    return true;
  }
}

function requireApiKey(req, res) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) {
    sendJson(res, { success: false, error: 'Unauthorized' }, 401);
    return false;
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  if (req.method === 'GET' && (pathname === '/' || pathname === '/health' || pathname === '/api/health')) {
    if (pathname === '/') {
      const indexPath = path.join(ROOT, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return fs.createReadStream(indexPath).pipe(res);
      }
    }
    return sendJson(res, { success: true, status: 'ok', timestamp: Date.now() });
  }

  if (req.method === 'GET' && (pathname === '/api/state' || pathname === '/api/store')) {
    if (!requireApiKey(req, res)) return;
    return sendJson(res, loadStore());
  }

  if (req.method === 'PUT' && (pathname === '/api/state' || pathname === '/api/store')) {
    if (!requireApiKey(req, res)) return;
    try {
      const body = await readBody(req);
      const incoming = body ? JSON.parse(body) : {};
      const saved = saveStore(incoming);
      return sendJson(res, saved);
    } catch (error) {
      return sendJson(res, { success: false, error: error.message }, 400);
    }
  }

  if (req.method === 'GET' && pathname === '/api/products') {
    if (!requireApiKey(req, res)) return;
    const store = loadStore();
    return sendJson(res, { success: true, products: store.products });
  }

  if (req.method === 'POST' && pathname === '/api/sync') {
    if (!requireApiKey(req, res)) return;
    try {
      const body = await readBody(req);
      const incoming = body ? JSON.parse(body) : {};
      const saved = saveStore({
        ...loadStore(),
        ...incoming
      });
      return sendJson(res, { success: true, data: saved, products: saved.products });
    } catch (error) {
      return sendJson(res, { success: false, error: error.message }, 400);
    }
  }

  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = safeJoin(ROOT, requestedPath.replace(/^\/+/, ''));

  if (filePath && serveFile(res, filePath)) {
    return;
  }

  const fallbackIndex = path.join(ROOT, 'index.html');
  if (fs.existsSync(fallbackIndex)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(fallbackIndex).pipe(res);
  }

  return sendJson(res, { success: false, error: 'Not found' }, 404);
});

server.listen(PORT, () => {
  console.log(`NILCO app server running on port ${PORT}`);
});
```
