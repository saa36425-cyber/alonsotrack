const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'alonsotrack-secreto-2026';
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      admin: {
        username: 'santiago',
        password: bcrypt.hashSync('alonso2026', 8)
      },
      clients: [],
      vehicles: [],
      maintenances: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();

function authAdmin(req, res, next) {
  const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== db.admin.username || !bcrypt.compareSync(password, db.admin.password)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username });
});

app.get('/api/clients', authAdmin, (req, res) => {
  res.json(db.clients);
});

app.post('/api/clients', authAdmin, (req, res) => {
  const client = {
    id: uuidv4(),
    name: req.body.name,
    phone: req.body.phone || '',
    email: req.body.email || '',
    notes: req.body.notes || '',
    created_at: new Date().toISOString()
  };
  db.clients.push(client);
  saveDB(db);
  res.json(client);
});

app.put('/api/clients/:id', authAdmin, (req, res) => {
  const idx = db.clients.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
  db.clients[idx] = { ...db.clients[idx], ...req.body };
  saveDB(db);
  res.json({ ok: true });
});

app.delete('/api/clients/:id', authAdmin, (req, res) => {
  db.clients = db.clients.filter(c => c.id !== req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

app.get('/api/vehicles', authAdmin, (req, res) => {
  const list = db.vehicles.map(v => {
    const client = db.clients.find(c => c.id === v.client_id);
    return { ...v, client_name: client ? client.name : '' };
  });
  res.json(list);
});

app.post('/api/vehicles', authAdmin, (req, res) => {
  const plate = (req.body.plate || '').toUpperCase();
  if (db.vehicles.some(v => v.plate === plate)) {
    return res.status(400).json({ error: 'La placa ya existe' });
  }
  const vehicle = {
    id: uuidv4(),
    client_id: req.body.client_id,
    plate,
    brand: req.body.brand || '',
    model: req.body.model || '',
    year: req.body.year || null,
    current_km: req.body.current_km || 0,
    color: req.body.color || '',
    access_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
    created_at: new Date().toISOString()
  };
  db.vehicles.push(vehicle);
  saveDB(db);
  res.json({ id: vehicle.id, access_code: vehicle.access_code });
});

app.put('/api/vehicles/:id', authAdmin, (req, res) => {
  const idx = db.vehicles.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
  db.vehicles[idx] = { ...db.vehicles[idx], ...req.body, plate: (req.body.plate || db.vehicles[idx].plate).toUpperCase() };
  saveDB(db);
  res.json({ ok: true });
});

app.delete('/api/vehicles/:id', authAdmin, (req, res) => {
  db.maintenances = db.maintenances.filter(m => m.vehicle_id !== req.params.id);
  db.vehicles = db.vehicles.filter(v => v.id !== req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

app.get('/api/vehicles/:id/maintenances', authAdmin, (req, res) => {
  const list = db.maintenances
    .filter(m => m.vehicle_id === req.params.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json(list);
});

app.post('/api/maintenances', authAdmin, (req, res) => {
  const m = {
    id: uuidv4(),
    vehicle_id: req.body.vehicle_id,
    date: req.body.date,
    km: req.body.km || null,
    type: req.body.type || '',
    description: req.body.description || '',
    cost: req.body.cost || 0,
    next_date: req.body.next_date || null,
    next_km: req.body.next_km || null,
    notes: req.body.notes || '',
    created_at: new Date().toISOString()
  };
  db.maintenances.push(m);
  if (m.km) {
    const v = db.vehicles.find(v => v.id === m.vehicle_id);
    if (v) v.current_km = m.km;
  }
  saveDB(db);
  res.json({ id: m.id });
});

app.delete('/api/maintenances/:id', authAdmin, (req, res) => {
  db.maintenances = db.maintenances.filter(m => m.id !== req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

app.get('/api/dashboard', authAdmin, (req, res) => {
  const recent = db.maintenances
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)
    .map(m => {
      const v = db.vehicles.find(v => v.id === m.vehicle_id);
      return { ...m, plate: v ? v.plate : '', brand: v ? v.brand : '', model: v ? v.model : '' };
    });

  const upcoming = db.maintenances
    .filter(m => m.next_date)
    .sort((a, b) => a.next_date.localeCompare(b.next_date))
    .slice(0, 10)
    .map(m => {
      const v = db.vehicles.find(v => v.id === m.vehicle_id);
      const c = v ? db.clients.find(c => c.id === v.client_id) : null;
      return {
        ...m,
        plate: v ? v.plate : '',
        brand: v ? v.brand : '',
        model: v ? v.model : '',
        client_name: c ? c.name : ''
      };
    });

  res.json({
    totalVehicles: db.vehicles.length,
    totalClients: db.clients.length,
    recent,
    upcoming
  });
});

app.post('/api/client-access', (req, res) => {
  const plate = (req.body.plate || '').toUpperCase();
  const code = (req.body.code || '').toUpperCase();
  const vehicle = db.vehicles.find(v => v.plate === plate && v.access_code === code);
  if (!vehicle) return res.status(401).json({ error: 'Placa o código incorrectos' });
  const client = db.clients.find(c => c.id === vehicle.client_id);
  const maintenances = db.maintenances
    .filter(m => m.vehicle_id === vehicle.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json({
    vehicle: { ...vehicle, client_name: client ? client.name : '', phone: client ? client.phone : '', email: client ? client.email : '' },
    maintenances
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================');
  console.log('  AlonsoTrack corriendo!');
  console.log('  Puerto:', PORT);
  console.log('  Usuario: santiago');
  console.log('  Contraseña: alonso2026');
  console.log('========================================\n');
});
