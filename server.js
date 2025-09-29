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

        // Habilitar la extensión para claves foráneas si es necesario (generalmente está por defecto)
        await client.query("CREATE EXTENSION IF NOT EXISTS citext;"); // Para búsquedas case-insensitive si se desea

        // Crear tablas si no existen
        // NOTA: AUTOINCREMENT se cambia a SERIAL, que es un entero que se auto-incrementa en PostgreSQL
        // NOTA: TEXT DEFAULT CURRENT_TIMESTAMP se cambia a TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        
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
        client.release(); // Libera el cliente de vuelta al pool
    }
};

// --- RUTAS DE LA API ---

// Ruta de prueba

// --- STOCK ENDPOINTS ---
app.get('/api/stock', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM current_stock ORDER BY tipo_producto, ancho, calibre, peso");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ "error": err.message });
    }
});

app.post('/api/products', async (req, res) => {
    const { fecha, turno, movement_type, tipo_producto, cantidad, ancho, calibre, peso } = req.body;
    if (!fecha || !turno || !movement_type || !tipo_producto) return res.status(400).json({ "error": "Faltan campos requeridos para stock." });

    const referencia_id = `${tipo_producto}-${ancho || 'N/A'}-${calibre || 'N/A'}-${peso || 'N/A'}`;
    const factor = movement_type === 'Entrada' ? 1 : -1;
    const cantidadMovimiento = parseInt(cantidad) * factor;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const logSql = `INSERT INTO stock_movements (fecha, turno, movement_type, tipo_producto, cantidad, ancho, calibre, peso) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        await client.query(logSql, [fecha, turno, movement_type, tipo_producto, cantidad, ancho, calibre, peso]);
        
        const updateSql = `
            INSERT INTO current_stock (referencia_id, tipo_producto, ancho, calibre, peso, cantidad_actual, last_updated) 
            VALUES ($1, $2, $3, $4, $5, $6, NOW()) 
            ON CONFLICT(referencia_id) 
            DO UPDATE SET cantidad_actual = current_stock.cantidad_actual + $6, last_updated = NOW()`;
        await client.query(updateSql, [referencia_id, tipo_producto, ancho, calibre, peso, cantidadMovimiento]);
        
        await client.query('COMMIT');
        res.status(201).json({ "message": "Movimiento registrado y stock actualizado." });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ "error": `Error en la transacción: ${err.message}` });
    } finally {
        client.release();
    }
});

// --- CLIENTS ENDPOINTS ---
app.get('/api/clientes', async (req, res) => {
    const { search } = req.query;
    let sql = "SELECT * FROM clientes ORDER BY nombre ASC";
    const params = [];
    if (search) {
        sql = "SELECT * FROM clientes WHERE nombre ILIKE $1 ORDER BY nombre ASC"; // ILIKE es case-insensitive
        params.push(`%${search}%`);
    }
    try {
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ "error": err.message });
    }
});

app.post('/api/clientes', async (req, res) => {
    const { nombre, direccion, telefono, contacto } = req.body;
    if (!nombre) return res.status(400).json({ "error": "El nombre del cliente es requerido." });
    
    try {
        const sql = `INSERT INTO clientes (nombre, direccion, telefono, contacto) VALUES ($1, $2, $3, $4) RETURNING id`;
        const result = await pool.query(sql, [nombre, direccion, telefono, contacto]);
        res.status(201).json({ "id": result.rows[0].id });
    } catch (err) {
        if (err.code === '23505') { // Código de error para violación de constraint UNIQUE en PostgreSQL
            return res.status(409).json({ "error": "Ya existe un cliente con ese nombre." });
        }
        res.status(500).json({ "error": err.message });
    }
});

// --- SALES ORDERS ENDPOINTS ---
app.post('/api/sales-orders', async (req, res) => {
    const { fecha_orden, cliente, core, oc, items, direccion_entrega } = req.body;
    if (!fecha_orden || !cliente || !items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ "error": "Datos de la orden de venta incompletos." });

    let totalFactura = 0;
    for (const item of items) {
        if (!item.tipo_producto || typeof item.cantidad !== 'number' || item.cantidad <= 0) return res.status(400).json({ "error": `Ítem inválido.` });
        totalFactura += (item.cantidad || 0) * (item.precio_unitario || 0) * 1.19;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const orderSql = `INSERT INTO sales_orders (fecha_orden, cliente, core, oc, valor_total_factura, direccion_entrega) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`;
        const orderResult = await client.query(orderSql, [fecha_orden, cliente, core, oc, totalFactura, direccion_entrega]);
        const pedidoId = orderResult.rows[0].id;

        const itemSql = `INSERT INTO sales_order_items (pedido_id, tipo_producto, cantidad, ancho, calibre, peso, precio_unitario) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
        for (const item of items) {
            await client.query(itemSql, [pedidoId, item.tipo_producto, item.cantidad, item.ancho, item.calibre, item.peso, item.precio_unitario]);
        }

        await client.query('COMMIT');
        res.status(201).json({ "pedido_id": pedidoId });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ "error": `Error en la transacción: ${err.message}` });
    } finally {
        client.release();
    }
});

// Las demás rutas (GET /api/sales-orders-with-items, PUT, etc.) se modifican de forma similar,
// cambiando db.all/db.run por pool.query. El resto de la lógica permanece igual.


// --- SERVIR EL FRONTEND DE VENTAS ---
// Coloca los archivos de tu frontend de ventas en una carpeta llamada 'public_sales'
const salesFrontendPath = path.join(__dirname, 'public_sales');
app.use(express.static(salesFrontendPath));

// Ruta "catch-all" que sirve el index.html principal para el enrutamiento del lado del cliente
app.get('*', (req, res) => {
    res.sendFile(path.join(salesFrontendPath, 'index.html'));
});


// --- INICIAR EL SERVIDOR ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
    initializeDb(); // Llama a la función para crear las tablas al iniciar
});