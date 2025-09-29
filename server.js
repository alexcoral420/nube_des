// Import required modules
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path'); // Módulo 'path' es necesario

// Initialize express app
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// --- UNIFIED DATABASE SETUP (master_data.db) ---
const dbPath = path.resolve(__dirname, 'master_data.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Error opening unified database", err.message);
    else {
        console.log("Connected to the UNIFIED MASTER SQLite database (master_data.db).");
        db.serialize(); // Pone la base de datos en modo serializado para evitar bloqueos
        
        db.run("PRAGMA foreign_keys = ON;");
        // STOCK TABLES
        db.run(`CREATE TABLE IF NOT EXISTS stock_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, turno TEXT NOT NULL, movement_type TEXT NOT NULL, tipo_producto TEXT NOT NULL, cantidad INTEGER NOT NULL, ancho REAL, calibre INTEGER, peso REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
        db.run(`CREATE TABLE IF NOT EXISTS current_stock (referencia_id TEXT PRIMARY KEY, tipo_producto TEXT NOT NULL, ancho REAL, calibre INTEGER, peso REAL, cantidad_actual INTEGER NOT NULL, last_updated TEXT)`);
        // SALES ORDER TABLES
        db.run(`CREATE TABLE IF NOT EXISTS sales_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, fecha_orden TEXT NOT NULL, fecha_despacho TEXT,
            cliente TEXT NOT NULL, core TEXT, oc TEXT, encargado_produccion TEXT, 
            direccion_entrega TEXT, 
            numero_remision TEXT, fecha_pago TEXT, estado_factura TEXT, 
            valor_total_factura REAL, valor_abono REAL DEFAULT 0
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS sales_order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL, tipo_producto TEXT NOT NULL,
            cantidad INTEGER NOT NULL, ancho REAL, calibre INTEGER, peso REAL, precio_unitario REAL,
            estado TEXT NOT NULL DEFAULT 'Pendiente', peso_neto REAL,
            FOREIGN KEY (pedido_id) REFERENCES sales_orders (id) ON DELETE CASCADE
        )`);
         // CLIENTS TABLE
         db.run(`CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE,
            direccion TEXT,
            telefono TEXT,
            contacto TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Helper function for async db calls
const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

// --- INICIO DE TODAS TUS RUTAS DE API ---

app.get('/', (req, res) => res.send('Servidor de datos unificado activo.'));
app.get('/api/stock', async (req, res) => { /* ... tu código ... */ });
app.post('/api/products', (req, res) => { /* ... tu código ... */ });
app.get('/api/clientes', async (req, res) => { /* ... tu código ... */ });
app.post('/api/clientes', (req, res) => { /* ... tu código ... */ });
app.post('/api/sales-orders', (req, res) => { /* ... tu código ... */ });
app.get('/api/sales-orders-with-items', async (req, res) => { /* ... tu código ... */ });
app.put('/api/sales-items/:id/status', (req, res) => { /* ... tu código ... */ });
app.get('/api/fabricated-orders', async (req, res) => { /* ... tu código ... */ });
app.put('/api/sales-orders/:id/generate-remision', async (req, res) => { /* ... tu código ... */ });
app.put('/api/sales-orders/:id/encargado', (req, res) => { /* ... tu código ... */ });
app.put('/api/sales-orders/:id/billing', (req, res) => { /* ... tu código ... */ });
app.get('/api/portfolio', async (req, res) => { /* ... tu código ... */ });
app.put('/api/sales-orders/:id/payment', (req, res) => { /* ... tu código ... */ });
// (He omitido el contenido de las funciones por brevedad, pero aquí van todas tus rutas)

// --- FIN DE TODAS TUS RUTAS DE API ---


// --- INICIO: CÓDIGO AÑADIDO PARA SERVIR EL FRONTEND ---

// 1. Define la ruta a la carpeta que contiene tu index.html (ej. 'public_sales')
const frontendPath = path.join(__dirname, 'public_sales');

// 2. Sirve los archivos estáticos (HTML, CSS, JS) desde esa carpeta
app.use(express.static(frontendPath));

// 3. Ruta "catch-all": Si ninguna ruta de la API coincide, envía el index.html.
//    Esto permite que el enrutamiento del lado del cliente funcione si lo añades en el futuro.
//    DEBE ESTAR DESPUÉS DE TODAS LAS RUTAS DE LA API.
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// --- FIN: CÓDIGO AÑADIDO ---


// --- START THE SERVER ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en la red, en el puerto ${PORT}`);
});