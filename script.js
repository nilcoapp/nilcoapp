/* ===== NILCO INT V2.0 - Sales Management System ===== */

/* ===== SERVER SYNC CONFIG ===== */
const JSON_BIN_URL = 'https://nilcoapp.onrender.com/api/state';
const API_KEY = 'nilco123';
/* ============================== */

const STORAGE_KEY = 'nilco-int-v2';
const SESSION_KEY = STORAGE_KEY + '-session';
const DRAFT_KEY = STORAGE_KEY + '-draft';
const LOW_STOCK_THRESHOLD = 20;
const CLIENTS_OVERWRITE_GRACE_MS = 8000;
const COLLECTION_OVERWRITE_GRACE_MS = 8000;
const SYNC_POLL_INTERVAL_MS = 15000;
const COLLECTION_TIMESTAMP_FIELDS = {
  clients: 'clientsLastUpdatedAt',
  products: 'productsLastUpdatedAt',
  invoices: 'invoicesLastUpdatedAt',
  followups: 'followupsLastUpdatedAt',
  messages: 'messagesLastUpdatedAt',
  users: 'usersLastUpdatedAt',
  inventories: 'inventoriesLastUpdatedAt'
};
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
  inventories: [],
  messages: [],
  onlineUsers: {},
  clientsLastUpdatedAt: 0,
  productsLastUpdatedAt: 0,
  invoicesLastUpdatedAt: 0,
  followupsLastUpdatedAt: 0,
  messagesLastUpdatedAt: 0,
  usersLastUpdatedAt: 0,
  inventoriesLastUpdatedAt: 0,
  stockAlertsSeenAt: '',
  invoiceCounter: 0
};

const state = {
  data: null,
  currentUser: null,
  deskTab: 'dashboard',
  workingInvoice: [],
  workingInvoiceDiscount: 0,
  workingInventory: [],
  filteredProducts: [],
  productOptionsCacheKey: '',
  repClientOptionsCacheKey: '',
  reportRep: 'all',
  reportFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10),
  reportTo: new Date().toISOString().slice(0,10),
  reportMonth: new Date().toISOString().slice(0,7),
  lastSavedInvoice: null,
  lastSavedInventory: null,
  pendingConfirmAction: null,
  viewingInvoice: null,
  viewingInventory: null,
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
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      workingInvoice: state.workingInvoice || [],
      workingInvoiceDiscount: state.workingInvoiceDiscount || 0
    }));
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
    if(draft) state.workingInvoiceDiscount = normalizeDiscountValue(draft.workingInvoiceDiscount);
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
      setInvoiceDiscount(state.workingInvoiceDiscount);
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
      const normalizedClient = normalizeClientRepLink(c);
      if(!ex) state.data.clients.push({
        ...normalizedClient,
        repMatchType: undefined
      });
      else {
        ex.code = ex.code || c.code;
        ex.sector = ex.sector || c.sector;
        ex.repName = normalizedClient.repName || ex.repName || '';
        ex.repId = ex.repId || normalizedClient.repId || '';
      }
    });
    markCollectionUpdated('clients');
    save();
    if(state.currentUser?.role === 'rep') {
      state.repClientOptionsCacheKey = '';
      setupRepScreen();
    } else if(state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'supervisor') && state.deskTab === 'clients') {
      renderDesk();
    }
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
  if(!Array.isArray(state.data.inventories)) state.data.inventories = [];
  if(!Array.isArray(state.data.messages)) state.data.messages = [];
  if(!state.data.onlineUsers || typeof state.data.onlineUsers !== 'object') state.data.onlineUsers = {};
  if(!state.data.invoiceCounter) state.data.invoiceCounter = 0;
  if(!state.data.clientsLastUpdatedAt) state.data.clientsLastUpdatedAt = 0;
  Object.values(COLLECTION_TIMESTAMP_FIELDS).forEach(field => {
    if(!state.data[field]) state.data[field] = 0;
  });
  DEFAULT_USERS.forEach(u => {
    const ex = state.data.users.find(x => x.id === u.id || x.username === u.username);
    if(!ex) state.data.users.push({...u});
    else { if(!ex.pin) ex.pin = u.pin; if(ex.active == null) ex.active = true; if(!ex.role) ex.role = u.role; if(ex.sector == null) ex.sector = u.sector || ''; }
  });
  state.data.clients = state.data.clients.map(c => {
    const normalizedClient = normalizeClientRepLink(c);
    return {
      ...normalizedClient,
      repMatchType: undefined
    };
  });
  save();
}

function show(screenId){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  byId(screenId).classList.add('active');
}

async function login(){
  const userId = byId('login-user').value;
  const pin = byId('login-pin').value.trim();
  const msg = byId('login-msg');
  msg.textContent = '';
  const user = state.data.users.find(u => u.id === userId && String(u.pin) === pin && u.active !== false);
  if(!user){ msg.textContent = 'بيانات الدخول غير صحيحة'; return; }
  state.currentUser = user;
  byId('login-pin').value = '';
  await pullFromServer();
  state.currentUser = state.data.users.find(u => u.id === userId && u.active !== false) || user;
  saveSession();
  if(state.currentUser.role === 'rep'){
    byId('rep-title').innerHTML = 'NILCO <span class="sync-indicator" id="sync-dot"></span>';
    setupRepScreen();
    show('rep-screen');
  } else {
    byId('desk-title').innerHTML = 'لوحة التحكم <span class="sync-indicator" id="sync-dot-desk"></span>';
    renderDesk();
    show('desk-screen');
  }
  updateOnlineStatus();
  syncToServer();
  showToast('مرحباً ' + user.username);
}

function logout(){
  state.currentUser = null;
  state.workingInvoice = [];
  state.workingInvoiceDiscount = 0;
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

function isLowStock(stock){
  return Number(stock || 0) <= LOW_STOCK_THRESHOLD;
}

function getRepUsers(){
  return state.data.users.filter(u => u.role === 'rep' && u.active !== false);
}

function normalizeRepLinkText(value){
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,،;؛:_\-()[\]{}'"`~!@#$%^&*+=\\/|<>?]+/g, '')
    .toLowerCase();
}

function findRepUserByImportedValue({repId='', repName=''} = {}){
  const reps = getRepUsers();
  if(repId){
    const byIdUser = reps.find(u => u.id === repId);
    if(byIdUser) return { user: byIdUser, matchType: 'repId' };
  }
  if(repName){
    const exactUser = reps.find(u => u.username === repName);
    if(exactUser) return { user: exactUser, matchType: 'exactUsername' };
    const normalizedName = normalizeRepLinkText(repName);
    if(normalizedName){
      const normalizedUser = reps.find(u => normalizeRepLinkText(u.username) === normalizedName);
      if(normalizedUser) return { user: normalizedUser, matchType: 'normalizedUsername' };
    }
  }
  return { user: null, matchType: 'unmatched' };
}

function normalizeClientRepLink(client = {}){
  const repMatch = findRepUserByImportedValue({
    repId: client.repId || '',
    repName: client.repName || ''
  });
  return {
    ...client,
    repId: repMatch.user?.id || client.repId || '',
    repName: repMatch.user?.username || client.repName || '',
    repMatchType: repMatch.matchType
  };
}

function markClientsUpdated(timestamp = Date.now()){
  state.data.clientsLastUpdatedAt = Math.max(Number(state.data.clientsLastUpdatedAt || 0), Number(timestamp || 0));
}

function getCollectionTimestamp(collectionName){
  const field = COLLECTION_TIMESTAMP_FIELDS[collectionName];
  return field ? Number(state.data[field] || 0) : 0;
}

function markCollectionUpdated(collectionName, timestamp = Date.now()){
  const field = COLLECTION_TIMESTAMP_FIELDS[collectionName];
  if(!field) return;
  state.data[field] = Math.max(Number(state.data[field] || 0), Number(timestamp || 0));
}

function getServerCollectionTimestamp(serverData, collectionName){
  const field = COLLECTION_TIMESTAMP_FIELDS[collectionName];
  return field ? Number(serverData?.[field] || 0) : 0;
}

function getRepUserByClient(client){
  if(!client) return null;
  if(client.repId) {
    const byIdUser = state.data.users.find(u => u.id === client.repId && u.role === 'rep');
    if(byIdUser) return byIdUser;
  }
  if(client.repName) {
    const exactUser = state.data.users.find(u => u.role === 'rep' && u.username === client.repName);
    if(exactUser) return exactUser;
    const normalizedName = normalizeRepLinkText(client.repName);
    return state.data.users.find(u => u.role === 'rep' && normalizeRepLinkText(u.username) === normalizedName) || null;
  }
  return null;
}

function getClientRepDisplayName(client){
  return getRepUserByClient(client)?.username || client?.repName || '';
}

function isClientAssignedToRep(client, repUser = state.currentUser){
  if(!client || !repUser) return false;
  if(client.repId && client.repId === repUser.id) return true;
  if(client.repName && normalizeRepLinkText(client.repName) === normalizeRepLinkText(repUser.username)) return true;
  return false;
}

function buildClientPayload({name, code, sector, repId}){
  const repUser = state.data.users.find(u => u.id === repId && u.role === 'rep');
  return {
    name,
    code,
    sector,
    repId: repUser?.id || '',
    repName: repUser?.username || ''
  };
}

function getSupervisors(){
  return state.data.users.filter(u => u.role === 'supervisor' && u.active !== false);
}

function isMessageVisibleToUser(message, user){
  if(!message || !user) return false;
  return message.senderId === user.id || message.target === user.id;
}

function getSavedInvoiceForExport(){
  if(state.workingInvoice.length) {
    alert('احفظ الفاتورة أولاً ثم صدّرها أو أرسلها');
    return null;
  }
  if(!state.lastSavedInvoice) {
    alert('لا توجد فاتورة محفوظة');
    return null;
  }
  return state.lastSavedInvoice;
}

function normalizeDiscountValue(value){
  if(value === '' || value == null) return 0;
  const num = Number(value);
  if(!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, num));
}

function getInvoiceDiscount(){
  return normalizeDiscountValue(byId('invoice-discount')?.value);
}

function setInvoiceDiscount(value, syncInput=true){
  state.workingInvoiceDiscount = normalizeDiscountValue(value);
  if(syncInput && byId('invoice-discount')) {
    byId('invoice-discount').value = state.workingInvoiceDiscount ? String(state.workingInvoiceDiscount) : '';
  }
}

function getInvoiceTotals(lines = state.workingInvoice, discount = getInvoiceDiscount()){
  const originalTotal = lines.reduce((s,l)=>s+Number(l.total||0),0);
  const discountPercentage = normalizeDiscountValue(discount);
  const discountAmount = originalTotal * (discountPercentage / 100);
  const finalTotal = Math.max(0, originalTotal - discountAmount);
  return { originalTotal, discountPercentage, discountAmount, finalTotal };
}

function createMessage(target, text){
  return {
    id: 'msg_'+Date.now(),
    senderId: state.currentUser.id,
    senderName: state.currentUser.username,
    target,
    text,
    readBy: [state.currentUser.id],
    createdAt: new Date().toISOString()
  };
}

function persistMessage(message){
  if(!state.data.messages) state.data.messages = [];
  state.data.messages.unshift(message);
  if(state.data.messages.length > 100) state.data.messages = state.data.messages.slice(0, 100);
  markCollectionUpdated('messages');
  save();
  syncToServer();
}

function markMessagesRead(messages){
  let changed = false;
  messages.forEach(m => {
    if(!m.readBy) m.readBy = [];
    if(!m.readBy.includes(state.currentUser.id)) {
      m.readBy.push(state.currentUser.id);
      changed = true;
    }
  });
  if(changed) {
    markCollectionUpdated('messages');
    save();
    syncToServer();
  }
}

function repClients(){
  const sector = byId('rep-sector')?.value || state.currentUser.sector || '';
  return state.data.clients.filter(c => isClientAssignedToRep(c, state.currentUser) && (!sector || c.sector === sector));
}

function setupRepScreen(){
  if(!Array.isArray(state.workingInvoice)) state.workingInvoice = [];
  const repClientList = state.data.clients.filter(c => isClientAssignedToRep(c, state.currentUser));
  const sectors = [...new Set(repClientList.map(c => c.sector).filter(Boolean))];
  byId('rep-sector').innerHTML = ['<option value="">كل القطاعات</option>']
    .concat(sectors.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)).join('');
  renderRepClients();
  toggleStatusMode();
  filterProducts();
  renderInventoryProductOptions();
  onInventoryProductChange();
  setInvoiceDiscount(state.workingInvoiceDiscount);
  renderInvoiceLines();
  renderInventoryLines();
  hideWhatsAppBtn();
  saveSession();
}

function renderRepClients(){
  const list = repClients();
  const markup = list.length
    ? list.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
    : '<option value="">لا يوجد عملاء لهذا المندوب</option>';
  const key = `${state.currentUser?.id || ''}|${byId('rep-sector')?.value || ''}|${list.length}|${list.map(c => c.id).join(',')}`;
  if(state.repClientOptionsCacheKey !== key) {
    byId('rep-client').innerHTML = markup;
    state.repClientOptionsCacheKey = key;
  }
  onClientChange();
}

function onClientChange(){
  const client = getSelectedClient();
  byId('rep-client-code').value = client ? client.code || '' : '';
  if(state.workingInvoice.length){
    state.lastSavedInvoice = null;
    hideWhatsAppBtn();
  }
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
  const repMessagesBtn = byId('rep-messages-open-btn');
  if(repMessagesBtn) repMessagesBtn.classList.toggle('hidden', mode !== 'invoice');
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
  markCollectionUpdated('followups');
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
  const optionsMarkup = products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}${isLowStock(p.stock)?' - غير متاح':''}</option>`).join('');
  const key = `${q}|${products.length}|${products.map(p => `${p.id}:${p.stock}`).join(',')}`;
  if(state.productOptionsCacheKey !== key) {
    byId('product-select').innerHTML = optionsMarkup;
    state.productOptionsCacheKey = key;
  }
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
  if(isLowStock(p.stock)) return alert(`هذا الصنف رصيده ${LOW_STOCK_THRESHOLD} أو أقل وغير متاح للطلب`);
  if(qty > Number(p.stock || 0)) return alert('الكمية المطلوبة أكبر من المخزون');
  state.lastSavedInvoice = null;
  hideWhatsAppBtn();
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
  const totals = getInvoiceTotals();
  byId('invoice-total').textContent = money(totals.finalTotal);
  const discountSummary = byId('invoice-discount-summary');
  if(discountSummary) discountSummary.textContent = 'خصم: ' + totals.discountPercentage + '%';
  const originalTotalEl = byId('invoice-original-total');
  if(originalTotalEl){
    originalTotalEl.textContent = totals.discountPercentage > 0 ? ('الإجمالي قبل الخصم: ' + money(totals.originalTotal)) : '';
    originalTotalEl.classList.toggle('hidden', totals.discountPercentage <= 0);
  }
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
  // Generate invoice number locally
  state.data.invoiceCounter = (state.data.invoiceCounter || 0) + 1;
  const invNumber = state.data.invoiceCounter;

  // Deduct stock locally
  state.workingInvoice.forEach(line => {
    const prod = state.data.products.find(p => p.id === line.productId);
    if(prod) prod.stock = Number(prod.stock||0) - Number(line.qty||0);
  });

  const totals = getInvoiceTotals();
  const inv = {
    id:'i_'+Date.now(),
    invoiceNumber: invNumber,
    clientId: client.id,
    customer: client.name,
    customerCode: client.code || '',
    sector: client.sector || '',
    repId: state.currentUser.id,
    repName: state.currentUser.username,
    total: totals.finalTotal,
    originalTotal: totals.originalTotal,
    discountPercentage: totals.discountPercentage,
    discountAmount: totals.discountAmount,
    lines: JSON.parse(JSON.stringify(state.workingInvoice)),
    createdAt: new Date().toISOString()
  };
  state.data.invoices.unshift(inv);
  markCollectionUpdated('invoices');
  markCollectionUpdated('products');
  state.lastSavedInvoice = inv;
  state.workingInvoice = [];
  state.workingInvoiceDiscount = 0;
  state.productOptionsCacheKey = '';
  save();
  localStorage.removeItem(DRAFT_KEY);
  saveSession();
  setInvoiceDiscount(0);
  renderInvoiceLines();

  await syncInvoice(inv);
  await pullFromServer();
  filterProducts();

  showWhatsAppBtn();
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
  const inv = getSavedInvoiceForExport();
  if(!inv) return;
  sendWhatsAppForInvoice(inv);
}
function sendWhatsAppForInvoice(inv){
  if(typeof XLSX === 'undefined') return alert('مكتبة Excel لم تُحمّل');
  // Build Excel file
  const wb = XLSX.utils.book_new();
  const data = [];
  data.push(['NILCO INT. — فاتورة مبيعات']);
  data.push(['رقم الفاتورة:', '#' + (inv.invoiceNumber || '—'), '', 'التاريخ:', String(inv.createdAt).slice(0,10)]);
  data.push(['العميل:', inv.customer, '', 'كود العميل:', inv.customerCode || '']);
  data.push(['المندوب:', inv.repName, '', 'القطاع:', inv.sector || '']);
  if(normalizeDiscountValue(inv.discountPercentage) > 0) data.push(['الخصم:', `${normalizeDiscountValue(inv.discountPercentage)}%`, '', 'الإجمالي قبل الخصم:', inv.originalTotal ?? inv.total]);
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
  // Try Web Share API (works on mobile with WhatsApp)
  if(navigator.canShare && navigator.canShare({files:[file]})){
    navigator.share({title:'فاتورة NILCO', text:`فاتورة #${inv.invoiceNumber||'—'} — ${inv.customer}${normalizeDiscountValue(inv.discountPercentage) > 0 ? ` — خصم ${normalizeDiscountValue(inv.discountPercentage)}%` : ''} — الإجمالي: ${Number(inv.total).toLocaleString('ar-EG')} ج`, files:[file]}).catch(()=>{});
  } else {
    // Fallback: download the file and open WhatsApp with a short message
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    const text = `فاتورة NILCO رقم #${inv.invoiceNumber||'—'}\nالعميل: ${inv.customer}\n${normalizeDiscountValue(inv.discountPercentage) > 0 ? `الخصم: ${normalizeDiscountValue(inv.discountPercentage)}%\n` : ''}الإجمالي: ${Number(inv.total).toLocaleString('ar-EG')} ج\n\n(الفاتورة مرفقة كملف Excel)`;
    setTimeout(()=>{ window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); }, 500);
  }
}

/* ===== MY INVOICES ===== */
function openMyInvoices(){
  if(!state.currentUser) return;
  const now = new Date();
  byId('my-inv-from').value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  byId('my-inv-to').value = now.toISOString().slice(0,10);
  renderMyInvoices();
  byId('my-invoices-modal').classList.add('active');
}
function closeMyInvoices(){ byId('my-invoices-modal').classList.remove('active'); }

function renderMyInvoices(){
  const from = byId('my-inv-from').value;
  const to = byId('my-inv-to').value;
  const repId = state.currentUser.id;
  const isAdmin = state.currentUser.role === 'admin' || state.currentUser.role === 'supervisor';
  const invoices = state.data.invoices.filter(inv => {
    if(!isAdmin && inv.repId !== repId) return false;
    const d = String(inv.createdAt).slice(0,10);
    if(from && d < from) return false;
    if(to && d > to) return false;
    return true;
  });
  const inventories = (state.data.inventories || []).filter(inv => {
    if(!isAdmin && inv.repId !== repId) return false;
    const d = String(inv.createdAt).slice(0,10);
    if(from && d < from) return false;
    if(to && d > to) return false;
    return true;
  });
  const total = invoices.reduce((s,x) => s + Number(x.total||0), 0);
  const records = [
    ...invoices.map(inv => ({type:'invoice', createdAt: inv.createdAt, data: inv})),
    ...inventories.map(inv => ({type:'inventory', createdAt: inv.createdAt, data: inv}))
  ].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  let html = `<div style="margin-bottom:10px;font-weight:700">عدد الفواتير: ${invoices.length} — عدد الجرد: ${inventories.length} — إجمالي الفواتير: ${money(total)}</div>`;
  if(!records.length){
    html += '<div class="muted">لا توجد فواتير أو سجلات جرد في هذه الفترة</div>';
  } else {
    html += '<div class="list">';
    records.forEach(record => {
      if(record.type === 'inventory') {
        const inventory = record.data;
        html += `<div class="item" onclick="viewInventoryDetail('${inventory.id}')">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="title">${escapeHtml(inventory.clientName)}</div>
            <span class="tag warn">جرد</span>
          </div>
          <div class="sub">${escapeHtml(inventory.repName)} — ${String(inventory.createdAt).slice(0,10)} — ${inventory.lines ? inventory.lines.length : 0} صنف</div>
        </div>`;
        return;
      }
      const inv = record.data;
      html += `<div class="item" onclick="viewInvoiceDetail('${inv.id}')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="title">${escapeHtml(inv.customer)}</div>
          <span class="inv-number">#${inv.invoiceNumber || '—'}</span>
        </div>
        <div class="sub">${escapeHtml(inv.repName)} — ${String(inv.createdAt).slice(0,10)} — ${inv.lines ? inv.lines.length : 0} صنف — ${money(inv.total)}${normalizeDiscountValue(inv.discountPercentage) > 0 ? ' — خصم ' + normalizeDiscountValue(inv.discountPercentage) + '%' : ''}</div>
      </div>`;
    });
    html += '</div>';
  }
  byId('my-invoices-list').innerHTML = html;
}

/* ===== INVOICE DETAIL ===== */
function viewInvoiceDetail(invId){
  const inv = state.data.invoices.find(i => i.id === invId);
  if(!inv) return;
  state.viewingInvoice = inv;
  state.viewingInventory = null;
  if(byId('detail-print-btn')) byId('detail-print-btn').style.display = '';
  if(byId('detail-export-btn')) byId('detail-export-btn').textContent = 'Excel';
  if(byId('detail-whatsapp-btn')) byId('detail-whatsapp-btn').textContent = 'واتساب';
  byId('inv-detail-title').textContent = 'فاتورة #' + (inv.invoiceNumber || '—');
  let html = `
    <div style="margin-bottom:8px">
      <div><strong>العميل:</strong> ${escapeHtml(inv.customer)} (${escapeHtml(inv.customerCode||'')})</div>
      <div><strong>المندوب:</strong> ${escapeHtml(inv.repName)}</div>
      <div><strong>التاريخ:</strong> ${String(inv.createdAt).slice(0,10)}</div>
      <div><strong>القطاع:</strong> ${escapeHtml(inv.sector||'—')}</div>
      <div><strong>الخصم:</strong> ${normalizeDiscountValue(inv.discountPercentage)}%</div>
    </div>
    <div class="inv-detail">
      <table>
        <thead><tr><th>الصنف</th><th>الباركود</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>
          ${(inv.lines||[]).map(l => `<tr><td>${escapeHtml(l.name)}</td><td style="font-size:10px">${escapeHtml(l.barcode||'—')}</td><td>${l.qty}</td><td>${money(l.price)}</td><td>${money(l.total)}</td></tr>`).join('')}
          ${normalizeDiscountValue(inv.discountPercentage) > 0 ? `<tr><td colspan="4">الإجمالي قبل الخصم</td><td>${money(inv.originalTotal ?? inv.total)}</td></tr>` : ''}
          <tr style="font-weight:800;background:#e3f2fd"><td colspan="4">الإجمالي</td><td>${money(inv.total)}</td></tr>
        </tbody>
      </table>
    </div>`;
  byId('invoice-detail-body').innerHTML = html;
  byId('invoice-detail-modal').classList.add('active');
}
function viewInventoryDetail(invId){
  const inv = (state.data.inventories || []).find(i => i.id === invId);
  if(!inv) return;
  state.viewingInventory = inv;
  state.viewingInvoice = null;
  if(byId('detail-print-btn')) byId('detail-print-btn').style.display = 'none';
  if(byId('detail-export-btn')) byId('detail-export-btn').textContent = 'Excel الجرد';
  if(byId('detail-whatsapp-btn')) byId('detail-whatsapp-btn').textContent = 'مشاركة الجرد';
  byId('inv-detail-title').textContent = 'جرد العميل';
  byId('invoice-detail-body').innerHTML = `
    <div style="margin-bottom:8px">
      <div><strong>العميل:</strong> ${escapeHtml(inv.clientName)}</div>
      <div><strong>المندوب:</strong> ${escapeHtml(inv.repName)}</div>
      <div><strong>التاريخ:</strong> ${String(inv.createdAt).slice(0,10)}</div>
    </div>
    <div class="inv-detail">
      <table>
        <thead><tr><th>الصنف</th><th>الباركود</th><th>جرد العميل</th><th>ستوك المخزن</th><th>الطلبية المقترحة</th></tr></thead>
        <tbody>
          ${(inv.lines || []).map(line => `<tr><td>${escapeHtml(line.name)}</td><td style="font-size:10px">${escapeHtml(line.barcode || line.code || '—')}</td><td>${line.clientQty}</td><td>${line.stockQty > 0 ? line.stockQty : '0 — غير متاح'}</td><td>${line.suggestedOrder}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  byId('invoice-detail-modal').classList.add('active');
}
function closeInvoiceDetail(){
  byId('invoice-detail-modal').classList.remove('active');
  state.viewingInvoice = null;
  state.viewingInventory = null;
}

function exportDetailInvoiceExcel(){
  if(state.viewingInventory) return exportInventoryExcel(state.viewingInventory);
  if(!state.viewingInvoice) return;
  exportInvoiceExcelForInv(state.viewingInvoice);
}
function printDetailInvoice(){
  if(!state.viewingInvoice) return;
  printInvoiceData(state.viewingInvoice);
}
function sendDetailWhatsApp(){
  if(state.viewingInventory) return sendInventoryWhatsApp(state.viewingInventory);
  if(!state.viewingInvoice) return;
  sendWhatsAppForInvoice(state.viewingInvoice);
}

/* ===== EXPORT INVOICE EXCEL (Professional) ===== */
function exportInvoiceExcel(){
  const inv = getSavedInvoiceForExport();
  if(!inv) return;
  exportInvoiceExcelForInv(inv);
}

function exportInvoiceExcelForInv(inv){
  if(typeof XLSX === 'undefined') return alert('مكتبة Excel لم تُحمّل');
  const wb = XLSX.utils.book_new();
  const data = [];
  // Header rows
  data.push(['NILCO INT. — فاتورة مبيعات']);
  data.push(['رقم الفاتورة:', '#' + (inv.invoiceNumber || '—'), '', 'التاريخ:', String(inv.createdAt).slice(0,10)]);
  data.push(['العميل:', inv.customer, '', 'كود العميل:', inv.customerCode || '']);
  data.push(['المندوب:', inv.repName, '', 'القطاع:', inv.sector || '']);
  if(normalizeDiscountValue(inv.discountPercentage) > 0) data.push(['الخصم:', `${normalizeDiscountValue(inv.discountPercentage)}%`, '', 'الإجمالي قبل الخصم:', inv.originalTotal ?? inv.total]);
  data.push([]);
  // Table header
  data.push(['الصنف', 'الباركود', 'الكود', 'الكمية', 'السعر', 'الإجمالي']);
  // Lines
  (inv.lines || []).forEach(l => {
    data.push([l.name, l.barcode || '', l.code || '', l.qty, l.price, l.total]);
  });
  // Total row
  data.push([]);
  data.push(['', '', '', '', 'الإجمالي:', inv.total]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  // Column widths
  ws['!cols'] = [{wch:30},{wch:18},{wch:12},{wch:8},{wch:12},{wch:14}];
  // Merge header
  ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:5}}];

  XLSX.utils.book_append_sheet(wb, ws, 'فاتورة');
  XLSX.writeFile(wb, `فاتورة_${inv.customer}_${(inv.invoiceNumber||'')}.xlsx`);
}

/* ===== PRINT INVOICE ===== */
function printCurrentInvoice(){
  if(state.lastSavedInvoice){
    printInvoiceData(state.lastSavedInvoice);
  } else if(state.workingInvoice.length){
    const client = getSelectedClient();
    if(!client) return alert('اختر العميل');
    const totals = getInvoiceTotals();
    printInvoiceData({
      customer: client.name, customerCode: client.code||'', repName: state.currentUser.username,
      createdAt: new Date().toISOString(), invoiceNumber: '—', lines: state.workingInvoice,
      total: totals.finalTotal,
      originalTotal: totals.originalTotal,
      discountPercentage: totals.discountPercentage,
      discountAmount: totals.discountAmount
    });
  } else { alert('لا توجد فاتورة للطباعة'); }
}

function printInvoiceData(inv){
  const w = window.open('','_blank','width=400,height=600');
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
    <title>فاتورة #${inv.invoiceNumber||''}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Cairo,Segoe UI,Tahoma,sans-serif;padding:20px;font-size:13px;color:#1a2332}
      .header{text-align:center;border-bottom:2px solid #0d47a1;padding-bottom:12px;margin-bottom:12px}
      .header h2{color:#0d47a1;font-size:20px}
      .header .inv-num{background:#e3f2fd;color:#0d47a1;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:700;display:inline-block;margin-top:6px}
      .info{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;font-size:12px}
      .info div{background:#f8fafc;padding:6px 8px;border-radius:6px}
      table{width:100%;border-collapse:collapse;margin:12px 0}
      th,td{padding:6px 8px;border:1px solid #e0e6ed;text-align:right;font-size:12px}
      th{background:#0d47a1;color:#fff;font-size:11px}
      .total-row{font-weight:800;background:#e3f2fd}
      .footer{text-align:center;margin-top:16px;font-size:10px;color:#6b7c93}
    </style></head><body>
    <div class="header">
      <h2>NILCO INT.</h2>
      <div>فاتورة مبيعات</div>
      <div class="inv-num">#${inv.invoiceNumber||'—'}</div>
    </div>
    <div class="info">
      <div><strong>العميل:</strong> ${escapeHtml(inv.customer)}</div>
      <div><strong>كود العميل:</strong> ${escapeHtml(inv.customerCode||'')}</div>
      <div><strong>المندوب:</strong> ${escapeHtml(inv.repName)}</div>
      <div><strong>التاريخ:</strong> ${String(inv.createdAt).slice(0,10)}</div>
      <div><strong>الخصم:</strong> ${normalizeDiscountValue(inv.discountPercentage)}%</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>الصنف</th><th>الباركود</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>
        ${(inv.lines||[]).map((l,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(l.name)}</td><td>${escapeHtml(l.barcode||'')}</td><td>${l.qty}</td><td>${Number(l.price).toLocaleString('ar-EG')} ج</td><td>${Number(l.total).toLocaleString('ar-EG')} ج</td></tr>`).join('')}
        ${normalizeDiscountValue(inv.discountPercentage) > 0 ? `<tr><td colspan="5">الإجمالي قبل الخصم</td><td>${Number(inv.originalTotal ?? inv.total).toLocaleString('ar-EG')} ج</td></tr>` : ''}
        <tr class="total-row"><td colspan="5">الإجمالي</td><td>${Number(inv.total).toLocaleString('ar-EG')} ج</td></tr>
      </tbody>
    </table>
    <div class="footer">NILCO INT. — نظام إدارة المبيعات والفواتير V2.0</div>
    <script>setTimeout(()=>window.print(),300)<\/script>
  </body></html>`);
  w.document.close();
}

/* ===== DESK TABS ===== */
function setDeskTab(tab){
  state.deskTab = tab;
  saveSession();
  renderDesk();
  // Update active tab styling
  document.querySelectorAll('#desk-tabs button').forEach(b => {
    b.classList.toggle('active-tab', b.dataset.tab === tab);
  });
}

function renderDesk(){
  const body = byId('desk-body');
  if(state.deskTab === 'dashboard') body.innerHTML = renderDashboard();
  if(state.deskTab === 'reports') body.innerHTML = renderReports();
  if(state.deskTab === 'stock') body.innerHTML = renderStock();
  if(state.deskTab === 'clients') body.innerHTML = renderClientsAdmin();
  if(state.deskTab === 'users') body.innerHTML = renderUsersAdmin();
  if(state.deskTab === 'messages') body.innerHTML = renderMessagesAdmin();
  // Update active tab
  document.querySelectorAll('#desk-tabs button').forEach(b => {
    b.classList.toggle('active-tab', b.dataset.tab === state.deskTab);
  });
}

function renderDashboard(){
  const todayStr = today();
  const todayInvoices = state.data.invoices.filter(x => String(x.createdAt).slice(0,10) === todayStr);
  const low100 = state.data.products.filter(p => Number(p.stock||0) < 100);
  const low20 = state.data.products.filter(p => Number(p.stock||0) <= 20);
  const totalSales = todayInvoices.reduce((s,x)=>s+Number(x.total||0),0);
  const recent = [
    ...todayInvoices.slice(0,10).map(x => `<div class="item" onclick="viewInvoiceDetail('${x.id}')"><div class="title">${escapeHtml(x.customer)} — <span class="inv-number">#${x.invoiceNumber||''}</span></div><div class="sub">${escapeHtml(x.repName)} — ${money(x.total)}</div></div>`),
    ...state.data.followups.filter(x => String(x.createdAt).slice(0,10) === todayStr).slice(0,10).map(x => `<div class="item" style="cursor:default"><div class="title">${escapeHtml(x.clientName)} — متابعة</div><div class="sub">${escapeHtml(x.repName)} — ${escapeHtml(x.note)}</div></div>`)
  ].join('') || '<div class="muted">لا توجد حركات اليوم</div>';
  return `
    <div class="kpis">
      <div class="kpi"><div class="v">${money(totalSales)}</div><div class="l">مبيعات اليوم</div></div>
      <div class="kpi"><div class="v">${todayInvoices.length}</div><div class="l">فواتير اليوم</div></div>
      <div class="kpi"><div class="v">${low100.length}</div><div class="l">أصناف أقل من 100</div></div>
      <div class="kpi"><div class="v">${low20.length}</div><div class="l">غير متاحة (20 أو أقل)</div></div>
      <div class="kpi"><div class="v">${getOnlineUsersCount()}</div><div class="l">متصل الآن</div></div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="title">المستخدمون المتصلون</div>
      <div class="list" style="margin-top:8px">${renderOnlineUsersList()}</div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="title">تنبيه المخزون</div>
      <div class="sub" style="margin:6px 0 10px">${low100.length ? 'يوجد أصناف تحتاج متابعة' : 'لا يوجد تنبيه اليوم'}</div>
      <div class="list">
        ${low100.slice(0,20).map(p => `<div class="item" style="cursor:default"><div class="title">${escapeHtml(p.name)}</div><div class="sub">الرصيد: ${p.stock}${isLowStock(p.stock)?' — غير متاح للطلب':''}</div></div>`).join('') || '<div class="muted">لا يوجد</div>'}
      </div>
    </div>
    <div class="card">
      <div class="title">حركة اليوم</div>
      <div class="list" style="margin-top:8px">${recent}</div>
    </div>`;
}

function renderReports(){
  const reps = state.data.users.filter(u => u.role === 'rep' && u.active !== false);
  const from = state.reportFrom, to = state.reportTo, month = state.reportMonth;
  const filteredInv = state.data.invoices.filter(x => inRange(x.createdAt, from, to) && (state.reportRep === 'all' || x.repId === state.reportRep));
  const filteredFollow = state.data.followups.filter(x => inRange(x.createdAt, from, to) && (state.reportRep === 'all' || x.repId === state.reportRep));
  const invoicedClientIds = new Set(filteredInv.map(x => x.clientId));
  const repClientsAll = state.reportRep === 'all'
    ? state.data.clients
    : state.data.clients.filter(c => c.repName === (state.data.users.find(u=>u.id===state.reportRep)?.username));
  const noInvoice = repClientsAll.filter(c => !invoicedClientIds.has(c.id));
  const monthInv = state.data.invoices.filter(x => monthOf(x.createdAt) === month);
  const monthFollow = state.data.followups.filter(x => monthOf(x.createdAt) === month);
  const clientStatusRows = state.data.clients.map(c => {
    const invCount = monthInv.filter(x => x.clientId === c.id).length;
    const folCount = monthFollow.filter(x => x.clientId === c.id).length;
    return {name:c.name, invoices:invCount, followups:folCount};
  }).filter(r => r.invoices || r.followups);

  return `
    <div class="card">
      <div class="grid2">
        <div class="field"><label>من</label><input class="input" type="date" value="${from}" onchange="state.reportFrom=this.value;renderDesk()" /></div>
        <div class="field"><label>إلى</label><input class="input" type="date" value="${to}" onchange="state.reportTo=this.value;renderDesk()" /></div>
        <div class="field"><label>المندوب</label><select onchange="state.reportRep=this.value;renderDesk()">
          <option value="all" ${state.reportRep==='all'?'selected':''}>الكل</option>
          ${reps.map(r => `<option value="${r.id}" ${state.reportRep===r.id?'selected':''}>${escapeHtml(r.username)}</option>`).join('')}
        </select></div>
        <div class="field"><label>الشهر</label><input class="input" type="month" value="${month}" onchange="state.reportMonth=this.value;renderDesk()" /></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-soft" onclick="exportSalesReport()">مبيعات Excel</button>
        <button class="btn btn-soft" onclick="exportNoInvoiceReport()">بدون فاتورة</button>
        <button class="btn btn-soft" onclick="exportClientStatusReport()">حالة العميل</button>
      </div>
    </div>
    <div class="card">
      <div class="title">تقرير المبيعات</div>
      <div class="sub">عدد الفواتير: ${filteredInv.length} — الإجمالي: ${money(filteredInv.reduce((s,x)=>s+Number(x.total||0),0))}</div>
      <div class="list" style="margin-top:8px">
        ${filteredInv.slice(0,50).map(x => `<div class="item" onclick="viewInvoiceDetail('${x.id}')"><div style="display:flex;justify-content:space-between"><div class="title">${escapeHtml(x.customer)} — ${money(x.total)}</div><span class="inv-number">#${x.invoiceNumber||''}</span></div><div class="sub">${escapeHtml(x.repName)} — ${String(x.createdAt).slice(0,10)}</div></div>`).join('') || '<div class="muted">لا يوجد</div>'}
      </div>
    </div>
    <div class="card">
      <div class="title">العملاء لم يتم عمل فاتورة لهم</div>
      <div class="list" style="margin-top:8px">
        ${noInvoice.slice(0,100).map(c => `<div class="item" style="cursor:default"><div class="title">${escapeHtml(c.name)}</div><div class="sub">${escapeHtml(c.sector||'')}${c.repName ? ' — ' + escapeHtml(c.repName) : ''}</div></div>`).join('') || '<div class="muted">لا يوجد</div>'}
      </div>
    </div>
    <div class="card">
      <div class="title">حالة العميل الشهرية</div>
      <div class="list" style="margin-top:8px">
        ${clientStatusRows.slice(0,100).map(r => `<div class="item" style="cursor:default"><div class="title">${escapeHtml(r.name)}</div><div class="sub">${r.invoices} فاتورة — ${r.followups} متابعة</div></div>`).join('') || '<div class="muted">لا يوجد</div>'}
      </div>
    </div>`;
}

function inRange(dateStr, from, to){
  const d = String(dateStr).slice(0,10);
  return (!from || d >= from) && (!to || d <= to);
}

/* ===== SALES REPORT EXCEL (with barcode) ===== */
function exportSalesReport(){
  if(typeof XLSX === 'undefined') return alert('مكتبة Excel لم تُحمّل');
  const filtered = state.data.invoices.filter(x => inRange(x.createdAt, state.reportFrom, state.reportTo) && (state.reportRep === 'all' || x.repId === state.reportRep));
  const wb = XLSX.utils.book_new();
  const data = [];
  data.push(['NILCO INT. — تقرير المبيعات']);
  data.push(['من:', state.reportFrom, '', 'إلى:', state.reportTo]);
  data.push(['المندوب:', state.reportRep === 'all' ? 'الكل' : (state.data.users.find(u=>u.id===state.reportRep)?.username || '')]);
  data.push([]);
  data.push(['رقم الفاتورة', 'التاريخ', 'المندوب', 'العميل', 'الصنف', 'الباركود', 'الكمية', 'السعر', 'إجمالي السطر', 'إجمالي الفاتورة']);
  let grandTotal = 0;
  filtered.forEach(inv => {
    grandTotal += Number(inv.total||0);
    if(inv.lines && inv.lines.length){
      inv.lines.forEach((l,idx) => {
        data.push([
          idx===0 ? ('#'+(inv.invoiceNumber||'')) : '',
          idx===0 ? String(inv.createdAt).slice(0,10) : '',
          idx===0 ? inv.repName : '',
          idx===0 ? inv.customer : '',
          l.name, l.barcode||'', l.qty, l.price, l.total,
          idx===0 ? inv.total : ''
        ]);
      });
    } else {
      data.push(['#'+(inv.invoiceNumber||''), String(inv.createdAt).slice(0,10), inv.repName, inv.customer, '', '', '', '', '', inv.total]);
    }
  });
  data.push([]);
  data.push(['', '', '', '', '', '', '', '', 'الإجمالي الكلي:', grandTotal]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:14},{wch:12},{wch:16},{wch:20},{wch:28},{wch:16},{wch:8},{wch:10},{wch:12},{wch:14}];
  ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:9}}];
  XLSX.utils.book_append_sheet(wb, ws, 'المبيعات');
  XLSX.writeFile(wb, 'تقرير_المبيعات.xlsx');
}

function exportNoInvoiceReport(){
  if(typeof XLSX === 'undefined') return alert('مكتبة Excel لم تُحمّل');
  const invoicedClientIds = new Set(state.data.invoices.filter(x => inRange(x.createdAt, state.reportFrom, state.reportTo) && (state.reportRep === 'all' || x.repId === state.reportRep)).map(x => x.clientId));
  const rows = state.data.clients.filter(c => !invoicedClientIds.has(c.id)).map(c => ({'كود العميل':c.code,'اسم العميل':c.name,'القطاع':c.sector,'المندوب':c.repName || ''}));
  const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(rows); XLSX.utils.book_append_sheet(wb, ws, 'بدون_فاتورة'); XLSX.writeFile(wb, 'عملاء_بدون_فاتورة.xlsx');
}

function exportClientStatusReport(){
  if(typeof XLSX === 'undefined') return alert('مكتبة Excel لم تُحمّل');
  const month = state.reportMonth;
  const monthInv = state.data.invoices.filter(x => monthOf(x.createdAt) === month);
  const monthFollow = state.data.followups.filter(x => monthOf(x.createdAt) === month);
  const rows = state.data.clients.map(c => ({
    'اسم العميل': c.name,
    'عدد الفواتير': monthInv.filter(x => x.clientId === c.id).length,
    'عدد المتابعات': monthFollow.filter(x => x.clientId === c.id).length
  }));
  const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(rows); XLSX.utils.book_append_sheet(wb, ws, 'حالة_العميل'); XLSX.writeFile(wb, 'حالة_العميل_الشهرية.xlsx');
}

/* ===== STOCK ===== */
function renderStock(){
  const canImport = state.currentUser.role === 'admin' || state.currentUser.role === 'supervisor';
  return `
    <div class="card">
      <div class="title">الاستوك</div>
      <div class="sub">عدد الأصناف: ${state.data.products.length} — أصناف أقل من 100 تظهر في الرئيسية</div>
      ${canImport ? `
        <div class="field" style="margin-top:10px">
          <label>رفع استوك من Excel / CSV</label>
          <input type="file" accept=".xlsx,.xls,.csv" onchange="importStockExcel(event)" />
        </div>
        <div class="hr"></div>
        <div class="title" style="margin-bottom:8px">إضافة صنف يدويًا</div>
        <div class="grid2" style="margin-top:10px">
          <div class="field"><label>اسم الصنف</label><input id="new-product-name" class="input" /></div>
          <div class="field"><label>كود الصنف</label><input id="new-product-code" class="input" /></div>
          <div class="field"><label>الباركود</label><input id="new-product-barcode" class="input" /></div>
          <div class="field"><label>السعر</label><input id="new-product-price" class="input" type="number" step="0.01" /></div>
          <div class="field"><label>الرصيد</label><input id="new-product-stock" class="input" type="number" step="1" /></div>
        </div>
        <div class="btn-row"><button class="btn btn-primary" onclick="addProduct()">إضافة صنف</button></div>
      ` : ''}
    </div>
    <div class="card">
      <table>
        <thead><tr><th>الكود</th><th>الصنف</th><th>الباركود</th><th>السعر</th><th>الرصيد</th></tr></thead>
        <tbody>
          ${state.data.products.map(p => `<tr><td>${escapeHtml(p.code||'')}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.barcode||'')}</td><td>${money(p.price)}</td><td style="font-weight:700;color:${isLowStock(p.stock)?'var(--danger)':Number(p.stock)<100?'var(--warn)':'var(--ok)'}">${p.stock}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">لا توجد أصناف</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function importStockExcel(ev){
  const file = ev.target.files && ev.target.files[0];
  if(!file) return;
  if(typeof XLSX === 'undefined') return alert('مكتبة Excel لم تُحمّل');
  const normalizeKey = k => String(k || '').trim().toLowerCase().replace(/\s+/g,' ').replace(/[\/_-]+/g,' ');
  const pick = (row, keys) => {
    const rowKeys = Object.keys(row || {});
    for(const wanted of keys){
      const found = rowKeys.find(k => normalizeKey(k) === normalizeKey(wanted));
      if(found && row[found] !== '' && row[found] != null) return row[found];
    }
    return '';
  };
  const cleanText = v => String(v == null ? '' : v).replace(/\.0$/,'').trim();
  const cleanNumber = v => { if(v == null || v === '') return 0; const n = Number(String(v).replace(/,/g,'').trim()); return Number.isFinite(n) ? n : 0; };

  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
    const products = rows.map((r, idx) => ({
      id: 'p' + (idx+1),
      code: cleanText(pick(r, ['Item code','Item Code','item code','code','Code','كود الصنف','كود'])),
      name: cleanText(pick(r, ['Arabic Description','arabic description','Description','description','name','Name','اسم الصنف','الصنف'])),
      price: cleanNumber(pick(r, ['Egp retail include vat','egp retail include vat','Price','price','سعر البيع','السعر'])),
      stock: cleanNumber(pick(r, ['stock New','Stock New','stock new','stock','Stock','الرصيد','الكمية'])),
      barcode: cleanText(pick(r, ['Barcode','barcode','الباركود','باركود']))
    })).filter(x => x.name || x.code || x.barcode);

    if(!products.length){
      alert('لم يتم العثور على أصناف. تأكد من أسماء الأعمدة');
      return;
    }

    if(state.data.products.length > 0){
      let updatedCount = 0;
      products.forEach(newP => {
        const existing = state.data.products.find(ep =>
          (newP.code && ep.code && String(ep.code).trim() === String(newP.code).trim()) ||
          (newP.barcode && ep.barcode && String(ep.barcode).trim() === String(newP.barcode).trim()) ||
          (newP.name && ep.name && String(ep.name).trim() === String(newP.name).trim())
        );
        if(existing){
          existing.stock = Number(newP.stock || 0);
          if(newP.price) existing.price = Number(newP.price || 0);
          updatedCount++;
        }
      });
      markCollectionUpdated('products');
      save();
      syncToServer();
      renderDesk();
      if(ev.target) ev.target.value = '';
      showToast('تم تحديث ' + updatedCount + ' صنف');
    } else {
      state.data.products = products.map((p, i) => ({
        id: p.id || ('p' + (i+1)),
        code: p.code || '',
        name: p.name || p.code || ('صنف ' + (i+1)),
        price: Number(p.price || 0),
        stock: Number(p.stock || 0),
        barcode: p.barcode || ''
      }));
      markCollectionUpdated('products');
      save();
      syncToServer();
      renderDesk();
      if(ev.target) ev.target.value = '';
      showToast('تم تحميل ' + state.data.products.length + ' صنف');
    }
  };
  reader.readAsArrayBuffer(file);
}

function addProduct(){
  const name = byId('new-product-name')?.value.trim();
  const code = byId('new-product-code')?.value.trim();
  const barcode = byId('new-product-barcode')?.value.trim();
  const price = Number(byId('new-product-price')?.value || 0);
  const stock = Number(byId('new-product-stock')?.value || 0);
  if(!name) return alert('اكتب اسم الصنف');
  state.data.products.unshift({ id:'p_'+Date.now(), code, name, barcode, price: Number.isFinite(price)?price:0, stock: Number.isFinite(stock)?stock:0 });
  markCollectionUpdated('products');
  save();
  syncToServer();
  renderDesk();
  showToast('تمت إضافة الصنف');
}

/* ===== CLIENTS ===== */
function renderClientsAdmin(){
  const canManage = state.currentUser.role === 'admin' || state.currentUser.role === 'supervisor';
  const reps = getRepUsers();
  const currentRep = byId('new-client-rep')?.value || '';
  const editingId = byId('editing-client-id')?.value || '';
  return `
    <div class="card">
      <div class="title">العملاء</div>
      <div class="sub">مربوطون بالمندوب والقطاع من ملف العملاء.</div>
      ${canManage ? `
        <div class="field" style="margin-top:10px">
          <label>رفع ملف العملاء Excel</label>
          <input type="file" accept=".xlsx,.xls" onchange="importClientsExcel(event)" />
        </div>
        <div class="grid2" style="margin-top:10px">
          <input id="editing-client-id" type="hidden" value="${escapeHtml(editingId)}" />
          <div class="field"><label>اسم العميل</label><input id="new-client-name" class="input" /></div>
          <div class="field"><label>كود العميل</label><input id="new-client-code" class="input" /></div>
          <div class="field"><label>القطاع</label><input id="new-client-sector" class="input" /></div>
          <div class="field"><label>اسم المندوب</label><select id="new-client-rep" class="input"><option value="">اختر المندوب</option>${reps.map(r => `<option value="${r.id}" ${currentRep===r.id?'selected':''}>${escapeHtml(r.username)}</option>`).join('')}</select></div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" onclick="saveClient()">${editingId ? 'حفظ التعديل' : 'إضافة عميل'}</button>
          ${editingId ? '<button class="btn btn-soft" onclick="cancelClientEdit()">إلغاء</button>' : ''}
        </div>
      ` : ''}
    </div>
    <div class="card">
      <table>
        <thead><tr><th>الكود</th><th>العميل</th><th>القطاع</th><th>المندوب</th>${canManage?'<th>إجراءات</th>':''}</tr></thead>
        <tbody>${state.data.clients.slice(0,500).map(c => `<tr><td>${escapeHtml(c.code||'')}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.sector||'')}</td><td>${escapeHtml(getClientRepDisplayName(c))}</td>${canManage?`<td style="white-space:nowrap"><button class="btn btn-soft" style="font-size:11px;padding:2px 8px" onclick="editClient('${c.id}')">تعديل</button> <button class="btn btn-soft" style="font-size:11px;padding:2px 8px;color:var(--danger)" onclick="deleteClient('${c.id}')">حذف</button></td>`:''}</tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function validateClientForm(clientId=''){
  const name = byId('new-client-name')?.value.trim() || '';
  const code = byId('new-client-code')?.value.trim() || '';
  const sector = byId('new-client-sector')?.value.trim() || '';
  const repId = byId('new-client-rep')?.value || '';
  if(!name) return {ok:false, message:'اكتب اسم العميل'};
  if(!code) return {ok:false, message:'اكتب كود العميل'};
  if(!sector) return {ok:false, message:'اكتب القطاع'};
  if(!repId) return {ok:false, message:'اختر المندوب'};
  const duplicateCode = state.data.clients.find(c => c.id !== clientId && String(c.code||'').trim() === code);
  if(duplicateCode) return {ok:false, message:'كود العميل مستخدم بالفعل'};
  const duplicateName = state.data.clients.find(c => c.id !== clientId && String(c.name||'').trim().toLowerCase() === name.toLowerCase());
  if(duplicateName) return {ok:false, message:'اسم العميل موجود بالفعل'};
  return {ok:true, payload:buildClientPayload({name, code, sector, repId})};
}

function fillClientForm(client){
  byId('editing-client-id').value = client?.id || '';
  byId('new-client-name').value = client?.name || '';
  byId('new-client-code').value = client?.code || '';
  byId('new-client-sector').value = client?.sector || '';
  byId('new-client-rep').value = client?.repId || getRepUserByClient(client)?.id || '';
}

function clearClientForm(){
  fillClientForm(null);
}

function saveClient(){
  const clientId = byId('editing-client-id')?.value || '';
  const validation = validateClientForm(clientId);
  if(!validation.ok) return alert(validation.message);
  if(clientId){
    const client = state.data.clients.find(c => c.id === clientId);
    if(!client) return alert('العميل غير موجود');
    Object.assign(client, validation.payload);
  } else {
    state.data.clients.unshift({
      id: 'c_'+Date.now(),
      ...validation.payload
    });
  }
  markCollectionUpdated('clients');
  save();
  syncToServer();
  renderDesk();
  showToast(clientId ? 'تم تعديل العميل' : 'تمت إضافة العميل');
}

function addClient(){
  saveClient();
}

function editClient(clientId){
  const client = state.data.clients.find(c => c.id === clientId);
  if(!client) return;
  renderDesk();
  fillClientForm(client);
}

function cancelClientEdit(){
  clearClientForm();
  renderDesk();
}

function deleteClient(clientId){
  const client = state.data.clients.find(c => c.id === clientId);
  if(!client) return;
  if(!confirm('هل تريد حذف العميل: ' + client.name + '؟')) return;
  state.data.clients = state.data.clients.filter(c => c.id !== clientId);
  markCollectionUpdated('clients');
  save();
  syncToServer();
  renderDesk();
  showToast('تم حذف العميل');
}

async function importClientsExcel(ev){
  const file = ev.target.files && ev.target.files[0];
  if(!file) return;
  if(typeof XLSX === 'undefined') return alert('مكتبة Excel لم تُحمّل');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, {type:'array'});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
  const stats = { repId: 0, exactUsername: 0, normalizedUsername: 0, unmatched: 0 };
  const clients = rows.map((r, idx) => {
    const baseClient = {
      id: 'c_' + (Date.now() + idx),
      code: String(r['Branch/Code'] || r['Branch Code'] || r.code || r['كود العميل'] || '').replace('.0','').trim(),
      name: String(r['Branch/Name'] || r['Branch Name'] || r.name || r['اسم العميل'] || '').trim(),
      sector: String(r['القطاع'] || r.sector || '').trim(),
      repName: String(r['المندوب'] || r.repName || r['اسم المندوب'] || '').trim(),
      repId: String(r.repId || '').trim()
    };
    const normalizedClient = normalizeClientRepLink(baseClient);
    stats[normalizedClient.repMatchType] = (stats[normalizedClient.repMatchType] || 0) + 1;
    return {
      ...normalizedClient,
      repMatchType: undefined
    };
  }).filter(x => x.name);
  state.data.clients = clients;
  markCollectionUpdated('clients');
  save();
  await syncToServer();
  renderDesk();
  console.log('Client import rep matching stats:', {
    matchedByRepId: stats.repId,
    matchedByExactUsername: stats.exactUsername,
    matchedByNormalizedUsername: stats.normalizedUsername,
    unmatched: stats.unmatched
  });
  showToast(`تم تحميل ${clients.length} عميل | ID:${stats.repId} | اسم:${stats.exactUsername} | مطابق:${stats.normalizedUsername} | غير مطابق:${stats.unmatched}`, 4500);
}

/* ===== USERS ===== */
function renderUsersAdmin(){
  const r = state.currentUser.role;
  if(r !== 'admin' && r !== 'supervisor') return '<div class="card"><div class="muted">غير متاح</div></div>';
  return `
    <div class="card">
      <div class="title">إضافة مستخدم</div>
      <div class="grid2" style="margin-top:10px">
        <div class="field"><label>الاسم</label><input id="new-user-name" class="input" /></div>
        <div class="field"><label>الرقم السري</label><input id="new-user-pin" class="input" /></div>
        <div class="field"><label>الدور</label><select id="new-user-role"><option value="rep">مستخدم</option><option value="supervisor">مشرف</option>${r==='admin'?'<option value="admin">ادمين</option>':''}</select></div>
        <div class="field"><label>القطاع</label><input id="new-user-sector" class="input" /></div>
      </div>
      <button class="btn btn-primary" onclick="addUser()">إضافة مستخدم</button>
    </div>
    <div id="edit-user-form" class="card" style="display:none">
      <div class="title">تعديل مستخدم</div>
      <input type="hidden" id="edit-user-id" />
      <div class="grid2" style="margin-top:10px">
        <div class="field"><label>الاسم</label><input id="edit-user-name" class="input" /></div>
        <div class="field"><label>الرقم السري</label><input id="edit-user-pin" class="input" /></div>
        <div class="field"><label>الدور</label><select id="edit-user-role"><option value="rep">مستخدم</option><option value="supervisor">مشرف</option>${r==='admin'?'<option value="admin">ادمين</option>':''}</select></div>
        <div class="field"><label>القطاع</label><input id="edit-user-sector" class="input" /></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary" onclick="saveEditUser()">حفظ التعديل</button>
        <button class="btn btn-soft" onclick="cancelEditUser()">إلغاء</button>
      </div>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>الاسم</th><th>الكود</th><th>الدور</th><th>القطاع</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${state.data.users.map(u => `<tr>
            <td>${escapeHtml(u.username)}</td>
            <td style="color:var(--muted);font-size:12px">${escapeHtml(u.pin)}</td>
            <td><span class="tag ${u.role==='admin'?'danger':u.role==='supervisor'?'warn':'ok'}">${u.role === 'rep' ? 'مستخدم' : u.role === 'supervisor' ? 'مشرف' : 'ادمين'}</span></td>
            <td style="font-size:12px">${escapeHtml(u.sector||'')}</td>
            <td>${u.active!==false ? '<span class="tag ok">نشط</span>' : '<span class="tag danger">موقوف</span>'}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-soft" style="font-size:11px;padding:2px 8px" onclick="editUser('${u.id}')">تعديل</button>
              <button class="btn ${u.active!==false?'btn-soft':'btn-primary'}" style="font-size:11px;padding:2px 8px" onclick="toggleUser('${u.id}')">${u.active!==false?'إيقاف':'تفعيل'}</button>
              <button class="btn btn-soft" style="font-size:11px;padding:2px 8px;color:var(--danger)" onclick="deleteUser('${u.id}')">حذف</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function addUser(){
  const username = byId('new-user-name').value.trim();
  const pin = byId('new-user-pin').value.trim();
  const role = byId('new-user-role').value;
  const sector = byId('new-user-sector').value.trim();
  if(!username || !pin) return alert('اكمل البيانات');
  state.data.users.push({id:'u_'+Date.now(), username, pin, role, sector, active:true});
  markCollectionUpdated('users'); save(); syncToServer(); renderDesk(); renderLoginUsers();
  showToast('تمت إضافة المستخدم');
}
function editUser(uid){
  const u = state.data.users.find(x=>x.id===uid);
  if(!u) return;
  byId('edit-user-id').value = uid;
  byId('edit-user-name').value = u.username;
  byId('edit-user-pin').value = u.pin;
  byId('edit-user-role').value = u.role;
  byId('edit-user-sector').value = u.sector||'';
  byId('edit-user-form').style.display = 'block';
  byId('edit-user-form').scrollIntoView({behavior:'smooth'});
}
function cancelEditUser(){ byId('edit-user-form').style.display = 'none'; }
function saveEditUser(){
  const uid = byId('edit-user-id').value;
  const u = state.data.users.find(x=>x.id===uid);
  if(!u) return;
  const oldUsername = u.username;
  const newUsername = byId('edit-user-name').value.trim();
  u.username = newUsername;
  u.pin = byId('edit-user-pin').value.trim();
  u.role = byId('edit-user-role').value;
  u.sector = byId('edit-user-sector').value.trim();
  if(!u.username || !u.pin) return alert('اكمل البيانات');
  if(oldUsername !== newUsername){
    state.data.clients.forEach(c => {
      if(c.repId === uid || (!c.repId && c.repName === oldUsername)) {
        c.repId = uid;
        c.repName = newUsername;
      }
    });
    state.data.invoices.forEach(inv => { if(inv.repId === uid && inv.repName === oldUsername) inv.repName = newUsername; });
    state.data.followups.forEach(f => { if(f.repId === uid && f.repName === oldUsername) f.repName = newUsername; });
    (state.data.messages || []).forEach(m => {
      if(m.senderId === uid && m.senderName === oldUsername) m.senderName = newUsername;
    });
    if(state.data.onlineUsers && state.data.onlineUsers[uid]) state.data.onlineUsers[uid].username = newUsername;
    if(state.currentUser && state.currentUser.id === uid) state.currentUser.username = newUsername;
    markCollectionUpdated('clients');
    markCollectionUpdated('invoices');
    markCollectionUpdated('followups');
    markCollectionUpdated('messages');
  }
  markCollectionUpdated('users'); save(); syncToServer(); renderDesk(); renderLoginUsers();
  showToast('تم تعديل المستخدم');
}
function toggleUser(uid){
  const u = state.data.users.find(x=>x.id===uid);
  if(!u) return;
  if(u.id === state.currentUser.id) return alert('لا يمكنك إيقاف حسابك');
  u.active = u.active === false ? true : false;
  markCollectionUpdated('users'); save(); syncToServer(); renderDesk(); renderLoginUsers();
  showToast(u.active ? 'تم تفعيل المستخدم' : 'تم إيقاف المستخدم');
}
function deleteUser(uid){
  const u = state.data.users.find(x=>x.id===uid);
  if(!u) return;
  if(u.id === state.currentUser.id) return alert('لا يمكنك حذف حسابك');
  if(!confirm('هل تريد حذف المستخدم: ' + u.username + '؟')) return;
  state.data.users = state.data.users.filter(x=>x.id!==uid);
  markCollectionUpdated('users'); save(); syncToServer(); renderDesk(); renderLoginUsers();
  showToast('تم حذف المستخدم');
}

/* ===== ONLINE USERS TRACKING ===== */
function updateOnlineStatus(){
  if(!state.data || !state.currentUser) return;
  if(!state.data.onlineUsers) state.data.onlineUsers = {};
  state.data.onlineUsers[state.currentUser.id] = {
    username: state.currentUser.username,
    role: state.currentUser.role,
    lastSeen: Date.now()
  };
  save();
}
function getOnlineUsers(){
  if(!state.data || !state.data.onlineUsers) return [];
  const now = Date.now();
  const threshold = 90000; // 90 seconds
  return Object.entries(state.data.onlineUsers)
    .filter(([id, u]) => (now - u.lastSeen) < threshold)
    .map(([id, u]) => ({id, ...u}));
}
function getOnlineUsersCount(){ return getOnlineUsers().length; }
function renderOnlineUsersList(){
  const users = getOnlineUsers();
  if(!users.length) return '<div class="muted">لا يوجد متصلون</div>';
  return users.map(u => {
    const roleLabel = u.role === 'admin' ? 'أدمن' : u.role === 'supervisor' ? 'مشرف' : 'مندوب';
    return `<div class="item" style="cursor:default"><div class="title"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#4caf50;margin-left:6px"></span>${escapeHtml(u.username)}</div><div class="sub">${roleLabel}</div></div>`;
  }).join('');
}
// Update online status every 20 seconds
setInterval(updateOnlineStatus, 20000);

/* ===== MESSAGES SYSTEM ===== */
function renderMessagesAdmin(){
  const r = state.currentUser.role;
  const canSend = r === 'admin' || r === 'supervisor' || r === 'rep';
  const availableTargets = r === 'rep' ? getSupervisors() : getRepUsers();
  const msgs = (state.data.messages || []).filter(m => isMessageVisibleToUser(m, state.currentUser)).slice(0, 50);
  const unread = msgs.filter(m => !m.readBy || !m.readBy.includes(state.currentUser.id));
  markMessagesRead(msgs);
  return `
    ${canSend ? `
    <div class="card">
      <div class="title">إرسال رسالة</div>
      <div class="field" style="margin-top:8px">
        <label>إلى</label>
        <select id="msg-target">
          <option value="">اختر المستخدم</option>
          ${availableTargets.map(u => `<option value="${u.id}">${escapeHtml(u.username)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>الرسالة</label>
        <textarea id="msg-text" rows="3" class="input" placeholder="اكتب رسالتك..."></textarea>
      </div>
      <button class="btn btn-primary" onclick="sendMessage()">إرسال</button>
    </div>` : ''}
    <div class="card">
      <div class="title">الرسائل ${unread.length ? '(<span style="color:var(--danger)">' + unread.length + ' جديدة</span>)' : ''}</div>
      <div class="list" style="margin-top:8px">
        ${msgs.length ? msgs.map(m => {
          const time = new Date(m.createdAt).toLocaleString('ar-EG', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
          const targetLabel = state.data.users.find(u=>u.id===m.target)?.username || m.target;
          const replyButton = m.senderId !== state.currentUser.id ? `<button class="btn btn-soft" style="font-size:11px;padding:2px 8px" onclick="replyToMessage('${m.senderId}')">رد</button>` : '';
          return `<div class="item" style="cursor:default"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div class="title">من: ${escapeHtml(m.senderName)} → ${escapeHtml(targetLabel)}</div>${replyButton}</div><div style="margin:4px 0;font-size:13px">${escapeHtml(m.text)}</div><div class="sub">${time}</div></div>`;
        }).join('') : '<div class="muted">لا توجد رسائل</div>'}
      </div>
    </div>`;
}
function sendMessage(){
  const target = byId('msg-target')?.value;
  const text = byId('msg-text')?.value.trim();
  const allowedTargets = (state.currentUser.role === 'rep' ? getSupervisors() : getRepUsers()).map(u => u.id);
  if(!target) return alert('اختر المستخدم');
  if(!text) return alert('اكتب الرسالة');
  if(!allowedTargets.includes(target)) return alert('المرسل إليه غير متاح');
  persistMessage(createMessage(target, text));
  renderDesk();
  showToast('تم إرسال الرسالة');
}
function replyToMessage(userId){
  const user = state.data.users.find(u => u.id === userId && u.active !== false);
  if(!user) return;
  byId('msg-target').value = user.id;
  byId('msg-text')?.focus();
}

function renderRepMessages(){
  const box = byId('rep-messages-modal-body');
  if(!box || !state.currentUser || state.currentUser.role !== 'rep') return;
  const supervisors = getSupervisors();
  const msgs = (state.data.messages || []).filter(m => isMessageVisibleToUser(m, state.currentUser)).slice(0, 20);
  const unread = msgs.filter(m => !m.readBy || !m.readBy.includes(state.currentUser.id));
  markMessagesRead(msgs);
  box.innerHTML = `
    <div class="title">الرسائل ${unread.length ? '(<span style="color:var(--danger)">' + unread.length + ' جديدة</span>)' : ''}</div>
    <div class="field" style="margin-top:10px">
      <label>إلى</label>
      <select id="rep-msg-target" class="input">
        <option value="">اختر المشرف</option>
        ${supervisors.map(u => `<option value="${u.id}">${escapeHtml(u.username)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>الرسالة</label>
      <textarea id="rep-msg-text" rows="3" class="input" placeholder="اكتب رسالتك..."></textarea>
    </div>
    <button class="btn btn-primary" style="width:100%" onclick="sendRepMessage()">إرسال الرد</button>
    <div class="list" style="margin-top:10px">
      ${msgs.length ? msgs.map(m => {
        const otherUserId = m.senderId === state.currentUser.id ? m.target : m.senderId;
        const otherUserName = state.data.users.find(u => u.id === otherUserId)?.username || '';
        const replyButton = m.senderId !== state.currentUser.id ? `<button class="btn btn-soft" style="font-size:11px;padding:2px 8px" onclick="prefillRepReply('${m.senderId}')">رد</button>` : '';
        return `<div class="item" style="cursor:default">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div class="title">${m.senderId === state.currentUser.id ? 'إلى: ' + escapeHtml(otherUserName) : 'من: ' + escapeHtml(m.senderName)}</div>
            ${replyButton}
          </div>
          <div style="margin:4px 0;font-size:13px">${escapeHtml(m.text || '')}</div>
          <div class="sub">${new Date(m.createdAt).toLocaleString('ar-EG', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
        </div>`;
      }).join('') : '<div class="muted">لا توجد رسائل</div>'}
    </div>`;
}

function openRepMessagesModal(){
  renderRepMessages();
  byId('rep-messages-modal')?.classList.add('active');
}

function closeRepMessagesModal(){
  byId('rep-messages-modal')?.classList.remove('active');
}

function prefillRepReply(userId){
  const target = byId('rep-msg-target');
  const text = byId('rep-msg-text');
  if(target) target.value = userId;
  if(text) text.focus();
}

function sendRepMessage(){
  const target = byId('rep-msg-target')?.value;
  const text = byId('rep-msg-text')?.value.trim();
  const allowedTargets = getSupervisors().map(u => u.id);
  if(!target) return alert('اختر المشرف');
  if(!text) return alert('اكتب الرسالة');
  if(!allowedTargets.includes(target)) return alert('المرسل إليه غير متاح');
  persistMessage(createMessage(target, text));
  if(byId('rep-msg-text')) byId('rep-msg-text').value = '';
  renderRepMessages();
  showToast('تم إرسال الرسالة');
}

function checkNewMessages(){
  if(!state.data || !state.data.messages || !state.currentUser) return;
  const myMsgs = state.data.messages.filter(m => isMessageVisibleToUser(m, state.currentUser));
  const unread = myMsgs.filter(m => !m.readBy || !m.readBy.includes(state.currentUser.id));
  if(unread.length > 0){
    showToast('لديك ' + unread.length + ' رسالة جديدة');
  }
}

/* ===== BARCODE CAMERA SCANNER ===== */
let _html5QrScanner = null;
let _scannerTarget = null; // 'invoice' or 'inventory'

function openScanner(target){
  _scannerTarget = target;
  byId('scanner-result').textContent = '';
  byId('scanner-modal').style.display = 'flex';
  if(typeof Html5Qrcode === 'undefined') return alert('مكتبة السكانر لم تُحمّل');
  _html5QrScanner = new Html5Qrcode('scanner-reader');
  _html5QrScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 150 } },
    (decodedText) => {
      onScanSuccess(decodedText);
    },
    () => {}
  ).catch(err => {
    byId('scanner-result').textContent = 'تعذر فتح الكاميرا: ' + err;
  });
}
function onScanSuccess(barcode){
  byId('scanner-result').textContent = 'تم المسح: ' + barcode;
  closeScanner();
  if(_scannerTarget === 'invoice'){
    byId('product-search').value = barcode;
    filterProducts();
  } else if(_scannerTarget === 'inventory'){
    byId('inv-product-search').value = barcode;
    invSearchProduct();
    invAddLine();
  }
}
function closeScanner(){
  byId('scanner-modal').style.display = 'none';
  if(_html5QrScanner){
    _html5QrScanner.stop().catch(()=>{});
    _html5QrScanner.clear();
    _html5QrScanner = null;
  }
}

/* ===== INVENTORY / جرد ===== */
function getInventoryProducts(){
  return Array.isArray(state.data.products) ? state.data.products : [];
}

function calculateInventorySuggestedOrder(clientQty, stockQty){
  const targetQty = LOW_STOCK_THRESHOLD;
  const required = Math.max(0, targetQty - Math.max(0, Number(clientQty || 0)));
  return Math.max(0, Math.min(Math.max(0, Number(stockQty || 0)), required));
}

function renderInventoryProductOptions(){
  const select = byId('inv-product-select');
  if(!select) return;
  const products = getInventoryProducts();
  const currentValue = select.value;
  select.innerHTML = products.map(p => {
    const stock = Number(p.stock || 0);
    const stockLabel = stock > 0 ? ` — المخزن: ${stock}` : ' — غير متاح بالمخزن';
    return `<option value="${p.id}">${escapeHtml(p.name || p.code || 'صنف')} ${stockLabel}</option>`;
  }).join('') || '<option value="">لا توجد أصناف</option>';
  if(currentValue && products.some(p => p.id === currentValue)) select.value = currentValue;
}

function getInventorySelectedProduct(){
  const selectedId = byId('inv-product-select')?.value || state._invFoundProduct?.id || '';
  return getInventoryProducts().find(p => p.id === selectedId) || null;
}

function updateInventoryDraftFields(product){
  const stock = Number(product?.stock || 0);
  const clientQty = Math.max(0, Number(byId('inv-client-qty')?.value || 0));
  const suggested = calculateInventorySuggestedOrder(clientQty, stock);
  if(byId('inv-stock-view')) byId('inv-stock-view').value = product ? stock : '';
  if(byId('inv-suggested-order')) byId('inv-suggested-order').value = product ? suggested : '';
  if(byId('inv-stock-note')) {
    byId('inv-stock-note').textContent = !product ? '' : stock > 0 ? `الطلبية المقترحة محسوبة حتى حد ${LOW_STOCK_THRESHOLD} ومع مراعاة ستوك المخزن.` : 'ستوك المخزن = 0، يمكن تسجيل الجرد لكن لا توجد طلبية متاحة حالياً.';
    byId('inv-stock-note').style.color = stock > 0 ? 'var(--muted)' : 'var(--danger)';
  }
}

function onInventoryProductChange(){
  const product = getInventorySelectedProduct();
  state._invFoundProduct = product;
  updateInventoryDraftFields(product);
}

function onInventorySuggestedInput(){
  const product = getInventorySelectedProduct();
  if(!product) return;
  const stock = Number(product.stock || 0);
  const suggestedInput = byId('inv-suggested-order');
  const value = Math.max(0, Number(suggestedInput?.value || 0));
  if(suggestedInput) suggestedInput.value = String(Math.min(stock, value));
}

function buildInventoryLine(product, clientQty, suggestedOrder){
  const stockQty = Math.max(0, Number(product?.stock || 0));
  const parsedClientQty = Math.max(0, Number(clientQty || 0));
  const autoSuggested = calculateInventorySuggestedOrder(parsedClientQty, stockQty);
  const finalSuggested = Math.max(0, Math.min(stockQty, suggestedOrder == null || suggestedOrder === '' ? autoSuggested : Number(suggestedOrder || 0)));
  return {
    productId: product.id,
    name: product.name || product.code || 'صنف',
    barcode: product.barcode || '',
    code: product.code || '',
    clientQty: parsedClientQty,
    stockQty,
    suggestedOrder: finalSuggested,
    warehouseStatus: stockQty > 0 ? 'متاح' : 'غير متاح'
  };
}

function invSearchProduct(){
  const q = (byId('inv-product-search')?.value || '').trim().toLowerCase();
  if(!q) return;
  const product = getInventoryProducts().find(x =>
    (x.barcode && String(x.barcode).toLowerCase() === q) ||
    (x.code && String(x.code).toLowerCase() === q) ||
    (x.name && String(x.name).toLowerCase().includes(q))
  );
  if(!product) return alert('لم يتم العثور على المنتج');
  const select = byId('inv-product-select');
  if(select) select.value = product.id;
  state._invFoundProduct = product;
  byId('inv-product-search').value = product.name + (product.barcode ? ' [' + product.barcode + ']' : '');
  onInventoryProductChange();
}

function invAddLine(){
  const product = getInventorySelectedProduct();
  if(!product) return alert('اختر الصنف أولاً');
  if(state.workingInventory.find(x => x.productId === product.id)) return alert('هذا المنتج مضاف بالفعل');
  const line = buildInventoryLine(
    product,
    byId('inv-client-qty')?.value || 0,
    byId('inv-suggested-order')?.value || ''
  );
  state.workingInventory.push(line);
  byId('inv-product-search').value = '';
  if(byId('inv-client-qty')) byId('inv-client-qty').value = '';
  state._invFoundProduct = null;
  renderInventoryProductOptions();
  onInventoryProductChange();
  renderInventoryLines();
}

function renderInventoryLines(){
  const tbody = byId('inventory-lines');
  if(!tbody) return;
  const rows = state.workingInventory.map((line, i) => {
    const stockCell = line.stockQty > 0
      ? `<span style="font-weight:600;color:var(--ok)">${line.stockQty}</span>`
      : `<span style="font-weight:700;color:var(--danger)">0 — غير متاح</span>`;
    return `<tr>
      <td style="font-size:12px">${escapeHtml(line.name)}</td>
      <td style="font-size:11px;color:var(--muted)">${escapeHtml(line.barcode || line.code || '—')}</td>
      <td><input type="number" class="input small" style="width:72px;text-align:center" value="${line.clientQty}" onchange="invUpdateLine(${i},'clientQty',this.value)" inputmode="numeric" /></td>
      <td style="text-align:center">${stockCell}</td>
      <td><input type="number" class="input small" style="width:84px;text-align:center" value="${line.suggestedOrder}" onchange="invUpdateLine(${i},'suggestedOrder',this.value)" inputmode="numeric" /></td>
      <td><button class="btn btn-danger" style="font-size:11px;padding:2px 6px" onclick="invRemoveLine(${i})">×</button></td>
    </tr>`;
  }).join('');
  tbody.innerHTML = rows || '<tr><td colspan="6" class="muted">لا توجد أصناف مضافة للجرد</td></tr>';
}

function invUpdateLine(i, field, val){
  if(!state.workingInventory[i]) return;
  const current = state.workingInventory[i];
  const num = Math.max(0, Number(val) || 0);
  if(field === 'clientQty') {
    current.clientQty = num;
    current.suggestedOrder = calculateInventorySuggestedOrder(num, current.stockQty);
  } else if(field === 'suggestedOrder') {
    current.suggestedOrder = Math.max(0, Math.min(current.stockQty, num));
    if(num > current.stockQty) alert('الطلبية المقترحة أكبر من ستوك المخزن');
  }
  current.warehouseStatus = current.stockQty > 0 ? 'متاح' : 'غير متاح';
  renderInventoryLines();
}

function invRemoveLine(i){
  state.workingInventory.splice(i,1);
  renderInventoryLines();
}

function clearInventory(){
  if(state.workingInventory.length && !confirm('هل تريد مسح الجرد؟')) return;
  state.workingInventory = [];
  if(byId('inv-product-search')) byId('inv-product-search').value = '';
  if(byId('inv-client-qty')) byId('inv-client-qty').value = '';
  renderInventoryProductOptions();
  onInventoryProductChange();
  renderInventoryLines();
}

function getInventoryRecordForAction(requireSaved=false){
  if(state.viewingInventory) return state.viewingInventory;
  if(state.lastSavedInventory) return state.lastSavedInventory;
  if(requireSaved) return null;
  const client = getSelectedClient();
  if(!client || !state.workingInventory.length) return null;
  return {
    id: 'draft_inventory',
    type: 'inventory',
    clientId: client.id,
    clientName: client.name,
    repId: state.currentUser.id,
    repName: state.currentUser.username,
    lines: JSON.parse(JSON.stringify(state.workingInventory)),
    createdAt: new Date().toISOString()
  };
}

function buildInventoryWorkbook(record){
  const wb = XLSX.utils.book_new();
  const lines = Array.isArray(record?.lines) ? record.lines : [];
  const data = [
    ['NILCO INT. — جرد العميل'],
    ['العميل', record?.clientName || '', '', 'التاريخ', String(record?.createdAt || '').slice(0,10)],
    ['المندوب', record?.repName || '', '', 'عدد الأصناف', lines.length],
    []
  ];
  data.push(['الصنف', 'الباركود', 'جرد العميل', 'ستوك المخزن', 'الطلبية المقترحة', 'الحالة']);
  lines.forEach(line => {
    const stockQty = Number(line.stockQty || 0);
    data.push([
      line.name || '',
      line.barcode || line.code || '',
      Number(line.clientQty || 0),
      stockQty,
      Number(line.suggestedOrder || 0),
      stockQty > 0 ? 'متاح' : 'غير متاح بالمخزن'
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:28},{wch:18},{wch:14},{wch:14},{wch:18},{wch:18}];
  ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:5}}];
  XLSX.utils.book_append_sheet(wb, ws, 'جرد');
  const safeClientName = String(record?.clientName || 'عميل').replace(/[\\/:*?"<>|]/g, '_');
  return {
    wb,
    fileName: `جرد_${safeClientName}_${String(record?.createdAt || new Date().toISOString()).slice(0,10)}.xlsx`
  };
}

function saveInventory(){
  const client = getSelectedClient();
  if(!client) return alert('اختر العميل');
  if(!state.workingInventory.length) return alert('أضف أصنافاً للجرد');
  const inv = {
    id: 'inv_'+Date.now(),
    type: 'inventory',
    clientId: client.id,
    clientName: client.name,
    repId: state.currentUser.id,
    repName: state.currentUser.username,
    lines: JSON.parse(JSON.stringify(state.workingInventory)),
    createdAt: new Date().toISOString()
  };
  if(!state.data.inventories) state.data.inventories = [];
  state.data.inventories.unshift(inv);
  markCollectionUpdated('inventories');
  state.lastSavedInventory = inv;
  save();
  syncToServer();
  renderMyInvoices();
  showToast('تم حفظ الجرد بنجاح');
}

function exportInventoryExcel(record = null){
  if(typeof XLSX === 'undefined') return alert('مكتبة Excel لم تُحمّل');
  const inventoryRecord = record || getInventoryRecordForAction(false);
  if(!inventoryRecord) return alert('احفظ الجرد أو أضف أصنافاً أولاً');
  const { wb, fileName } = buildInventoryWorkbook(inventoryRecord);
  XLSX.writeFile(wb, fileName);
}

function sendInventoryWhatsApp(record = null){
  if(typeof XLSX === 'undefined') return alert('مكتبة Excel لم تُحمّل');
  const inventoryRecord = record || getInventoryRecordForAction(true) || getInventoryRecordForAction(false);
  if(!inventoryRecord) return alert('احفظ الجرد أو أضف أصنافاً أولاً');
  const { wb, fileName } = buildInventoryWorkbook(inventoryRecord);
  const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
  const blob = new Blob([wbout], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const file = new File([blob], fileName, {type: blob.type});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    navigator.share({title:'جرد NILCO', text:`جرد العميل: ${inventoryRecord.clientName}`, files:[file]}).catch(()=>{});
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    const text = `جرد NILCO\nالعميل: ${inventoryRecord.clientName}\nالمندوب: ${inventoryRecord.repName}\nالتاريخ: ${String(inventoryRecord.createdAt).slice(0,10)}\n\n(تم تنزيل ملف Excel للجرد)`;
    setTimeout(()=>{ window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); }, 500);
  }
}

/* ===== SERVER SYNC (Render API) ===== */
let _syncBusy = false;
let _syncQueued = false;
let _syncPromise = Promise.resolve();
let _syncPollingStarted = false;

function updateSyncIndicator(online){
  state.serverOnline = online;
  const dots = [byId('sync-dot'), byId('sync-dot-desk')];
  dots.forEach(d => {
    if(d) d.classList.toggle('offline', !online);
  });
}

function cloneSyncValue(value){
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function normalizeSyncedArray(collectionName, items){
  const list = Array.isArray(items) ? items : [];
  if(collectionName === 'clients'){
    return list.map(client => {
      const normalizedClient = normalizeClientRepLink(client || {});
      return {
        ...normalizedClient,
        repMatchType: undefined
      };
    });
  }
  if(collectionName === 'messages'){
    return list.map(message => ({
      ...message,
      readBy: Array.isArray(message?.readBy) ? [...new Set(message.readBy)] : []
    }));
  }
  return list.map(item => ({...(item || {})}));
}

function normalizeServerState(serverData){
  const normalized = {
    ...cloneSyncValue(DEFAULT_DATA),
    ...(serverData && typeof serverData === 'object' ? serverData : {})
  };
  ['clients','products','invoices','followups','messages','users','inventories'].forEach(collectionName => {
    normalized[collectionName] = normalizeSyncedArray(collectionName, normalized[collectionName]);
    const field = COLLECTION_TIMESTAMP_FIELDS[collectionName];
    normalized[field] = Number(normalized[field] || 0);
  });
  normalized.onlineUsers = normalized.onlineUsers && typeof normalized.onlineUsers === 'object' ? normalized.onlineUsers : {};
  normalized.invoiceCounter = Number(normalized.invoiceCounter || 0);
  normalized.lastUpdated = Number(normalized.lastUpdated || 0);
  return normalized;
}

function isLocalCollectionProtected(collectionName){
  const localAt = getCollectionTimestamp(collectionName);
  const graceMs = collectionName === 'clients' ? CLIENTS_OVERWRITE_GRACE_MS : COLLECTION_OVERWRITE_GRACE_MS;
  return localAt > 0 && (Date.now() - localAt) <= graceMs;
}

function maxCreatedAt(items){
  return (Array.isArray(items) ? items : []).reduce((latest, item) => {
    const createdAt = Number(new Date(item?.createdAt || 0).getTime() || 0);
    return Math.max(latest, createdAt);
  }, 0);
}

function mergeById(remoteItems, localItems, mergeExisting){
  const map = new Map();
  (Array.isArray(remoteItems) ? remoteItems : []).forEach(item => {
    if(!item || !item.id) return;
    map.set(item.id, {...item});
  });
  (Array.isArray(localItems) ? localItems : []).forEach(item => {
    if(!item || !item.id) return;
    if(!map.has(item.id)) {
      map.set(item.id, {...item});
      return;
    }
    const remoteItem = map.get(item.id);
    map.set(item.id, mergeExisting ? mergeExisting(remoteItem, item) : {...remoteItem, ...item});
  });
  return [...map.values()];
}

function mergeMessages(remoteItems, localItems){
  return mergeById(remoteItems, localItems, (remoteItem, localItem) => ({
    ...remoteItem,
    ...localItem,
    readBy: [...new Set([...(remoteItem.readBy || []), ...(localItem.readBy || [])])]
  })).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);
}

function mergeOnlineUsers(remoteUsers, localUsers){
  const merged = {...(remoteUsers || {})};
  Object.entries(localUsers || {}).forEach(([id, user]) => {
    if(!merged[id] || Number(user?.lastSeen || 0) > Number(merged[id]?.lastSeen || 0)) {
      merged[id] = user;
    }
  });
  return merged;
}

function replaceLocalCollection(collectionName, items, timestamp){
  const field = COLLECTION_TIMESTAMP_FIELDS[collectionName];
  state.data[collectionName] = normalizeSyncedArray(collectionName, items);
  state.data[field] = Math.max(Number(timestamp || 0), Number(state.data[field] || 0));
  if(collectionName === 'clients') state.repClientOptionsCacheKey = '';
  if(collectionName === 'products') state.productOptionsCacheKey = '';
  if(collectionName === 'users') {
    renderLoginUsers();
    if(state.currentUser) {
      state.currentUser = state.data.users.find(u => u.id === state.currentUser.id) || state.currentUser;
    }
  }
}

function syncLog(action, details){
  console.log(`[sync] ${action}`, details);
}

/* Read remote data */
async function pullFromServer(){
  if(!JSON_BIN_URL) return;
  try {
    const resp = await fetch(JSON_BIN_URL, {
      cache:'no-store',
      headers:{ 'x-api-key': API_KEY }
    });
    if(!resp.ok) throw new Error('HTTP ' + resp.status);

    const serverData = normalizeServerState(await resp.json());
    if(serverData && typeof serverData === 'object') {
      mergeServerData(serverData);
      updateSyncIndicator(true);
      syncLog('pull', {
        lastUpdated: serverData.lastUpdated,
        clientsAt: serverData.clientsLastUpdatedAt,
        productsAt: serverData.productsLastUpdatedAt,
        invoicesAt: serverData.invoicesLastUpdatedAt
      });

      if(state.currentUser && state.currentUser.role !== 'rep' && ['dashboard','stock','reports','clients','users','messages'].includes(state.deskTab)) {
        renderDesk();
      }
      if(state.currentUser && state.currentUser.role === 'rep') {
        renderRepClients();
        renderInventoryProductOptions();
        onInventoryProductChange();
        filterProducts();
        renderRepMessages();
        checkNewMessages();
      }
    }
  } catch(e) {
    console.log('Pull failed:', e);
    updateSyncIndicator(false);
  }
}

async function pushToServerOnce(){
  try {
    const isAdmin = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'supervisor');

    const getResp = await fetch(JSON_BIN_URL, {
      cache:'no-store',
      headers:{ 'x-api-key': API_KEY }
    });

    let remote = normalizeServerState({});

    if(getResp.ok) {
      remote = normalizeServerState(await getResp.json());
    }

    const remoteInvoiceIds = new Set((remote.invoices || []).map(i => i.id));
    const newInvoices = [];
    (state.data.invoices || []).forEach(inv => {
      if(!remoteInvoiceIds.has(inv.id)) {
        newInvoices.push(inv);
      }
    });
    remote.invoices = mergeById(remote.invoices, state.data.invoices).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const mergedInvoicesAt = Math.max(getCollectionTimestamp('invoices'), getServerCollectionTimestamp(remote, 'invoices'), maxCreatedAt(remote.invoices));
    remote.invoicesLastUpdatedAt = mergedInvoicesAt;
    replaceLocalCollection('invoices', remote.invoices, mergedInvoicesAt);

    remote.followups = mergeById(remote.followups, state.data.followups).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const mergedFollowupsAt = Math.max(getCollectionTimestamp('followups'), getServerCollectionTimestamp(remote, 'followups'), maxCreatedAt(remote.followups));
    remote.followupsLastUpdatedAt = mergedFollowupsAt;
    replaceLocalCollection('followups', remote.followups, mergedFollowupsAt);

    remote.messages = mergeMessages(remote.messages, state.data.messages);
    const mergedMessagesAt = Math.max(getCollectionTimestamp('messages'), getServerCollectionTimestamp(remote, 'messages'), maxCreatedAt(remote.messages));
    remote.messagesLastUpdatedAt = mergedMessagesAt;
    replaceLocalCollection('messages', remote.messages, mergedMessagesAt);

    remote.inventories = mergeById(remote.inventories, state.data.inventories).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const mergedInventoriesAt = Math.max(getCollectionTimestamp('inventories'), getServerCollectionTimestamp(remote, 'inventories'), maxCreatedAt(remote.inventories));
    remote.inventoriesLastUpdatedAt = mergedInventoriesAt;
    replaceLocalCollection('inventories', remote.inventories, mergedInventoriesAt);

    const localClientsAt = getCollectionTimestamp('clients');
    const remoteClientsAt = getServerCollectionTimestamp(remote, 'clients');
    const preferLocalClients = localClientsAt > remoteClientsAt || (localClientsAt === remoteClientsAt && isLocalCollectionProtected('clients'));
    if(preferLocalClients || !remote.clients.length) {
      remote.clients = normalizeSyncedArray('clients', state.data.clients);
      remote.clientsLastUpdatedAt = Math.max(localClientsAt, remoteClientsAt);
      replaceLocalCollection('clients', remote.clients, remote.clientsLastUpdatedAt);
    } else {
      replaceLocalCollection('clients', remote.clients, remoteClientsAt);
    }

    const localUsersAt = getCollectionTimestamp('users');
    const remoteUsersAt = getServerCollectionTimestamp(remote, 'users');
    if(isAdmin && (localUsersAt > remoteUsersAt || (localUsersAt === remoteUsersAt && isLocalCollectionProtected('users')) || !remote.users.length)) {
      remote.users = normalizeSyncedArray('users', state.data.users);
      remote.usersLastUpdatedAt = Math.max(localUsersAt, remoteUsersAt);
      replaceLocalCollection('users', remote.users, remote.usersLastUpdatedAt);
    } else if(!remote.users.length && state.data.users.length) {
      remote.users = normalizeSyncedArray('users', state.data.users);
      remote.usersLastUpdatedAt = Math.max(localUsersAt, remoteUsersAt);
      replaceLocalCollection('users', remote.users, remote.usersLastUpdatedAt);
    } else if(remote.users.length) {
      replaceLocalCollection('users', remote.users, remoteUsersAt);
    }

    const localProductsAt = getCollectionTimestamp('products');
    const remoteProductsAt = getServerCollectionTimestamp(remote, 'products');
    let mergedProducts = normalizeSyncedArray('products', remote.products.length ? remote.products : state.data.products);
    let usingLocalProducts = false;
    if(isAdmin && (localProductsAt > remoteProductsAt || (localProductsAt === remoteProductsAt && isLocalCollectionProtected('products')) || !remote.products.length)) {
      mergedProducts = normalizeSyncedArray('products', state.data.products);
      usingLocalProducts = true;
    } else if(!remote.products.length && state.data.products.length) {
      mergedProducts = normalizeSyncedArray('products', state.data.products);
      usingLocalProducts = true;
    }
    if(!usingLocalProducts && newInvoices.length) {
      newInvoices.forEach(inv => {
        (inv.lines || []).forEach(line => {
          const product = mergedProducts.find(p => p.id === line.productId);
          if(product) product.stock = Math.max(0, Number(product.stock || 0) - Number(line.qty || 0));
        });
      });
    }
    remote.products = mergedProducts;
    remote.productsLastUpdatedAt = Math.max(remoteProductsAt, localProductsAt, newInvoices.length ? Date.now() : 0);
    replaceLocalCollection('products', remote.products, remote.productsLastUpdatedAt);

    remote.onlineUsers = mergeOnlineUsers(remote.onlineUsers, state.data.onlineUsers);
    remote.invoiceCounter = Math.max(remote.invoiceCounter || 0, state.data.invoiceCounter || 0);
    remote.lastUpdated = Date.now();

    const putResp = await fetch(JSON_BIN_URL, {
      method:'PUT',
      headers:{
        'Content-Type':'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify(remote)
    });

    if(!putResp.ok) throw new Error('HTTP ' + putResp.status);

    const savedRemote = normalizeServerState(await putResp.json());
    mergeServerData(savedRemote);
    updateSyncIndicator(true);
    syncLog('push', {
      lastUpdated: savedRemote.lastUpdated,
      clientsAt: savedRemote.clientsLastUpdatedAt,
      productsAt: savedRemote.productsLastUpdatedAt,
      invoicesAt: savedRemote.invoicesLastUpdatedAt
    });
  } catch(e) {
    console.log('Push failed:', e);
    updateSyncIndicator(false);
  }
}

/* Write full state to remote */
async function pushToServer(){
  if(!JSON_BIN_URL) return;
  if(_syncBusy) {
    _syncQueued = true;
    return _syncPromise;
  }
  _syncPromise = (async () => {
    _syncBusy = true;
    try {
      do {
        _syncQueued = false;
        await pushToServerOnce();
      } while(_syncQueued);
    } finally {
      _syncBusy = false;
    }
  })();
  return _syncPromise;
}

function syncToServer(){ return pushToServer(); }
async function syncInvoice(invoice){ await pushToServer(); }
async function syncFollowup(followup){ await pushToServer(); }

function mergeServerData(serverData){
  if(!serverData || typeof serverData !== 'object') return;
  const normalizedServer = normalizeServerState(serverData);

  ['clients','products','users'].forEach(collectionName => {
    const remoteAt = getServerCollectionTimestamp(normalizedServer, collectionName);
    const localAt = getCollectionTimestamp(collectionName);
    if(remoteAt > localAt && !isLocalCollectionProtected(collectionName)) {
      replaceLocalCollection(collectionName, normalizedServer[collectionName], remoteAt);
    }
  });

  const mergedInvoices = mergeById(normalizedServer.invoices, state.data.invoices).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  replaceLocalCollection('invoices', mergedInvoices, Math.max(getCollectionTimestamp('invoices'), getServerCollectionTimestamp(normalizedServer, 'invoices'), maxCreatedAt(mergedInvoices)));

  const mergedFollowups = mergeById(normalizedServer.followups, state.data.followups).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  replaceLocalCollection('followups', mergedFollowups, Math.max(getCollectionTimestamp('followups'), getServerCollectionTimestamp(normalizedServer, 'followups'), maxCreatedAt(mergedFollowups)));

  const mergedMessages = mergeMessages(normalizedServer.messages, state.data.messages);
  replaceLocalCollection('messages', mergedMessages, Math.max(getCollectionTimestamp('messages'), getServerCollectionTimestamp(normalizedServer, 'messages'), maxCreatedAt(mergedMessages)));

  const mergedInventories = mergeById(normalizedServer.inventories, state.data.inventories).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  replaceLocalCollection('inventories', mergedInventories, Math.max(getCollectionTimestamp('inventories'), getServerCollectionTimestamp(normalizedServer, 'inventories'), maxCreatedAt(mergedInventories)));

  if(normalizedServer.invoiceCounter > (state.data.invoiceCounter||0)) {
    state.data.invoiceCounter = normalizedServer.invoiceCounter;
  }

  state.data.onlineUsers = mergeOnlineUsers(normalizedServer.onlineUsers, state.data.onlineUsers);

  save();
  checkNewMessages();
}

function startSyncPolling(){
  if(_syncPollingStarted) return;
  _syncPollingStarted = true;
  setInterval(() => {
    if(document.visibilityState === 'visible') {
      pullFromServer();
    }
  }, SYNC_POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') {
      pullFromServer();
      if(state.currentUser) {
        updateOnlineStatus();
        syncToServer();
      }
    }
  });
  window.addEventListener('focus', () => {
    pullFromServer();
    if(state.currentUser) {
      updateOnlineStatus();
      syncToServer();
    }
  });
  window.addEventListener('online', () => {
    pullFromServer();
    if(state.currentUser) {
      updateOnlineStatus();
      syncToServer();
    }
  });
  pullFromServer();
}
/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', async () => {
  loadData();
  renderLoginUsers();
  const restored = restoreSession();
  const productSearch = byId('product-search');
  const qtyInput = byId('qty-input');
  const invoiceDiscountInput = byId('invoice-discount');
  const repNote = byId('rep-note');
  if(productSearch) productSearch.addEventListener('input', filterProducts);
  if(qtyInput) qtyInput.addEventListener('input', () => { onSelectProduct(); saveSession(); });
  if(invoiceDiscountInput) invoiceDiscountInput.addEventListener('input', () => {
    setInvoiceDiscount(invoiceDiscountInput.value, false);
    invoiceDiscountInput.value = state.workingInvoiceDiscount ? String(state.workingInvoiceDiscount) : '';
    saveDraft();
    renderInvoiceLines();
  });
  if(repNote) repNote.addEventListener('input', saveSession);
  if(!restored) show('login-screen');
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  startSyncPolling();
  // Update online status on load if user is logged in
  if(state.currentUser) updateOnlineStatus();
  loadExternalClients();
});

/* ===== GLOBAL EXPORTS ===== */
window.login = login;
window.logout = logout;
window.renderRepClients = renderRepClients;
window.onClientChange = onClientChange;
window.toggleStatusMode = toggleStatusMode;
window.saveFollowup = saveFollowup;
window.filterProducts = filterProducts;
window.onSelectProduct = onSelectProduct;
window.addLine = addLine;
window.removeLine = removeLine;
window.saveInvoice = saveInvoice;
window.exportInvoiceExcel = exportInvoiceExcel;
window.setDeskTab = setDeskTab;
window.importStockExcel = importStockExcel;
window.addProduct = addProduct;
window.importClientsExcel = importClientsExcel;
window.addClient = addClient;
window.saveClient = saveClient;
window.editClient = editClient;
window.cancelClientEdit = cancelClientEdit;
window.deleteClient = deleteClient;
window.addUser = addUser;
window.editUser = editUser;
window.saveEditUser = saveEditUser;
window.cancelEditUser = cancelEditUser;
window.toggleUser = toggleUser;
window.deleteUser = deleteUser;
window.sendMessage = sendMessage;
window.openScanner = openScanner;
window.closeScanner = closeScanner;
window.invSearchProduct = invSearchProduct;
window.onInventoryProductChange = onInventoryProductChange;
window.onInventorySuggestedInput = onInventorySuggestedInput;
window.invAddLine = invAddLine;
window.invUpdateLine = invUpdateLine;
window.invRemoveLine = invRemoveLine;
window.clearInventory = clearInventory;
window.saveInventory = saveInventory;
window.exportInventoryExcel = exportInventoryExcel;
window.sendInventoryWhatsApp = sendInventoryWhatsApp;
window.renderInventoryLines = renderInventoryLines;
window.openMyInvoices = openMyInvoices;
window.closeMyInvoices = closeMyInvoices;
window.renderMyInvoices = renderMyInvoices;
window.sendWhatsApp = sendWhatsApp;
window.replyToMessage = replyToMessage;
window.renderRepMessages = renderRepMessages;
window.openRepMessagesModal = openRepMessagesModal;
window.closeRepMessagesModal = closeRepMessagesModal;
window.prefillRepReply = prefillRepReply;
window.sendRepMessage = sendRepMessage;
window.exportSalesReport = exportSalesReport;
window.exportNoInvoiceReport = exportNoInvoiceReport;
window.exportClientStatusReport = exportClientStatusReport;
window.viewInvoiceDetail = viewInvoiceDetail;
window.viewInventoryDetail = viewInventoryDetail;
window.closeInvoiceDetail = closeInvoiceDetail;
window.exportDetailInvoiceExcel = exportDetailInvoiceExcel;
window.printDetailInvoice = printDetailInvoice;
window.sendDetailWhatsApp = sendDetailWhatsApp;
window.printCurrentInvoice = printCurrentInvoice;
window.confirmAction = confirmAction;
window.closeConfirm = closeConfirm;
window.askRemoveLine = askRemoveLine;
