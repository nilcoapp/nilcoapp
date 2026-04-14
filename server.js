const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
    return sendJson(res, loadStore());
  }

  if (req.method === 'PUT' && (pathname === '/api/state' || pathname === '/api/store')) {
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
    const store = loadStore();
    return sendJson(res, { success: true, products: store.products });
  }

  if (req.method === 'POST' && pathname === '/api/sync') {
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
