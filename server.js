// --- IMPORTS Y CONFIGURACIÓN INICIAL ---
require('dotenv').config(); // Carga las variables de entorno del archivo .env
const express = require('express');
const { Pool } = require('pg'); // Driver de PostgreSQL
const cors = require('cors');
const path = require('path');

// Inicializar la app de Express
const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(cors()); // Habilita CORS para permitir peticiones de tus frontends
app.use(express.json()); // Permite al servidor entender JSON

// --- CONEXIÓN A LA BASE DE DATOS POSTGRESQL ---
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Función para inicializar la base de datos
const initializeDb = async () => {
    const client = await pool.connect();
    try {
        console.log("Conectado a la base de datos PostgreSQL.");

        await client.query("CREATE EXTENSION IF NOT EXISTS citext;"); 
        
        // STOCK TABLES
        await client.query(`CREATE TABLE IF NOT EXISTS stock_movements (id SERIAL PRIMARY KEY, fecha DATE NOT NULL, turno TEXT NOT NULL, movement_type TEXT NOT NULL, tipo_producto TEXT NOT NULL, cantidad INTEGER NOT NULL, ancho REAL, calibre INTEGER, peso REAL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`);
        await client.query(`CREATE TABLE IF NOT EXISTS current_stock (referencia_id TEXT PRIMARY KEY, tipo_producto TEXT NOT NULL, ancho REAL, calibre INTEGER, peso REAL, cantidad_actual INTEGER NOT NULL, last_updated TIMESTAMPTZ)`);
        
        // SALES ORDER TABLES
        await client.query(`CREATE TABLE IF NOT EXISTS sales_orders (
            id SERIAL PRIMARY KEY, fecha_orden DATE NOT NULL, fecha_despacho DATE,
            cliente TEXT NOT NULL, core TEXT, oc TEXT, encargado_produccion TEXT, 
            direccion_entrega TEXT, 
            numero_remision TEXT, fecha_pago DATE, estado_factura TEXT, 
            valor_total_factura REAL, valor_abono REAL DEFAULT 0
        )`);
        await client.query(`CREATE TABLE IF NOT EXISTS sales_order_items (
            id SERIAL PRIMARY KEY, pedido_id INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE, 
            tipo_producto TEXT NOT NULL, cantidad INTEGER NOT NULL, ancho REAL, calibre INTEGER, peso REAL, 
            precio_unitario REAL, estado TEXT NOT NULL DEFAULT 'Pendiente', peso_neto REAL
        )`);
        
        // CLIENTS TABLE
        await client.query(`CREATE TABLE IF NOT EXISTS clientes (
            id SERIAL PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, direccion TEXT, telefono TEXT, contacto TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )`);

        console.log("Tablas verificadas/creadas exitosamente.");

    } catch (err) {
        console.error("Error inicializando la base de datos", err.stack);
    } finally {
        client.release();
    }
};

// --- RUTAS DE LA API ---

app.get('/api', (req, res) => res.send('API del servidor de datos unificado activa.'));

// (Aquí van todas tus rutas de API: /api/stock, /api/products, etc...)
app.get('/api/stock', async (req, res) => { /* ... tu código ... */ });
app.post('/api/products', async (req, res) => { /* ... tu código ... */ });
app.get('/api/clientes', async (req, res) => { /* ... tu código ... */ });
app.post('/api/clientes', async (req, res) => { /* ... tu código ... */ });
app.post('/api/sales-orders', async (req, res) => { /* ... tu código ... */ });


// --- SERVIR EL FRONTEND DE VENTAS ---
const salesFrontendPath = path.join(__dirname, 'public_sales');
app.use(express.static(salesFrontendPath));

// Ruta "catch-all" que sirve el index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(salesFrontendPath, 'index.html'));
});


// --- INICIAR EL SERVIDOR ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
    initializeDb();
});