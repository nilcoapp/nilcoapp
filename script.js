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
  invoiceCounter: 0
};

const state = {
  data: null,
  currentUser: null,
  workingInvoice: [],
  filteredProducts: []
};

const byId = id => document.getElementById(id);
const money = n => Number(n || 0).toLocaleString('ar-EG') + ' ج';

function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  state.data = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

/* ===== LOGIN ===== */
function renderLoginUsers(){
  const users = state.data.users;
  byId('login-user').innerHTML = users.map(u => `<option value="${u.id}">${u.username}</option>`).join('');
}

function login(){
  const userId = byId('login-user').value;
  const pin = byId('login-pin').value;

  const user = state.data.users.find(u => u.id === userId && u.pin === pin);
  if(!user) return alert('خطأ');

  state.currentUser = user;

  if(user.role === 'rep'){
    setupRepScreen();
  }
}

/* ===== REP SCREEN ===== */
function setupRepScreen(){
  state.workingInvoice = [];

  const repName = state.currentUser.username;
  const clients = state.data.clients.filter(c => c.repName === repName);

  byId('rep-client').innerHTML = clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  filterProducts();
  renderInvoiceLines();
}

/* ===== PRODUCTS ===== */
function filterProducts(){
  const products = state.data.products;
  state.filteredProducts = products;

  byId('product-select').innerHTML =
    products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function getSelectedProduct(){
  return state.data.products.find(p => p.id === byId('product-select').value);
}

/* ===== INVOICE ===== */
function addLine(){
  const p = getSelectedProduct();
  const qty = Number(byId('qty-input').value);

  if(!p || !qty) return;

  state.workingInvoice.push({
    productId: p.id,
    name: p.name,
    price: p.price,
    qty,
    total: qty * p.price
  });

  renderInvoiceLines();
}

function renderInvoiceLines(){
  const tbody = byId('invoice-lines');

  tbody.innerHTML = state.workingInvoice.map(l => `
    <tr>
      <td>${l.name}</td>
      <td>${l.qty}</td>
      <td>${money(l.price)}</td>
      <td>${money(l.total)}</td>
    </tr>
  `).join('');
}

async function saveInvoice(){
  if(!state.workingInvoice.length) return alert('فاضي');

  // خصم الاستوك
  state.workingInvoice.forEach(line => {
    const p = state.data.products.find(x => x.id === line.productId);
    if(p) p.stock -= line.qty;
  });

  const inv = {
    id: Date.now(),
    lines: state.workingInvoice
  };

  state.data.invoices.push(inv);
  state.workingInvoice = [];

  save();

  // 🔥 أهم جزء
  await fetch(JSON_BIN_URL, {
    method: 'PUT',
    headers: {
      'Content-Type':'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify(state.data)
  });

  await pullFromServer();

  filterProducts();
  renderInvoiceLines();

  alert('تم الحفظ');
}

/* ===== SERVER ===== */
async function pullFromServer(){
  try{
    const r = await fetch(JSON_BIN_URL, {
      headers: {'x-api-key': API_KEY}
    });
    const data = await r.json();
    state.data = data;
    save();
  }catch(e){
    console.log(e);
  }
}

/* ===== INIT ===== */
window.onload = async () => {
  loadData();
  renderLoginUsers();
  await pullFromServer();
};
