const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'store.json');

// Ensure data directory exists
if(!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

function loadStore(){
  try {
    if(fs.existsSync(DATA_FILE)){
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch(e){}
  return { products: [], invoices: [], timestamp: 0 };
}

function saveStore(data){
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
}

function cors(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, obj, status=200){
  cors(res);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  cors(res);
  if(req.method === 'OPTIONS'){
    res.writeHead(204);
    return res.end();
  }

  if(req.method === 'GET' && req.url === '/api/products'){
    const store = loadStore();
    return json(res, { success: true, products: store.products });
  }

  if(req.method === 'POST' && req.url === '/api/sync'){
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const incoming = JSON.parse(body);
        const store = loadStore();

        // Update products if incoming has newer data
        if(incoming.products && Array.isArray(incoming.products)){
          // Merge: update stock for existing, add new
          incoming.products.forEach(p => {
            const existing = store.products.find(sp =>
              (p.code && sp.code && String(sp.code).trim() === String(p.code).trim()) ||
              (p.id && sp.id && sp.id === p.id) ||
              (p.name && sp.name && String(sp.name).trim() === String(p.name).trim())
            );
            if(existing){
              existing.stock = p.stock;
              if(p.price) existing.price = p.price;
            } else {
              store.products.push(p);
            }
          });
        }

        // Merge invoices
        if(incoming.invoices && Array.isArray(incoming.invoices)){
          incoming.invoices.forEach(inv => {
            if(!store.invoices.find(si => si.id === inv.id)){
              store.invoices.push(inv);
            }
          });
        }

        store.timestamp = Date.now();
        saveStore(store);
        return json(res, { success: true, products: store.products });
      } catch(e){
        return json(res, { success: false, error: e.message }, 400);
      }
    });
    return;
  }

  // Health check
  if(req.method === 'GET' && (req.url === '/' || req.url === '/health')){
    return json(res, { status: 'ok', timestamp: Date.now() });
  }

  json(res, { error: 'Not found' }, 404);
});

server.listen(PORT, () => {
  console.log(`NILCO Sync Server running on port ${PORT}`);
});
