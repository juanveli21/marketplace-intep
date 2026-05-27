// ============================================================
//  routes/productos.js
//  GET    /productos/todos          → todos los productos activos (para el catálogo)
//  GET    /productos/mis-productos  → productos de la empresa logueada
//  GET    /productos/:id            → detalle de un producto
//  POST   /productos/agregar        → crear producto (solo empresa)
//  PUT    /productos/editar/:id     → editar producto (solo su empresa)
//  DELETE /productos/eliminar/:id   → eliminar producto (solo su empresa)
// ============================================================

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

// ── Configuración de Multer (subida de imágenes) ───────────
// Crear la carpeta si no existe
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Nombre único: timestamp + extensión original
        const ext = path.extname(file.originalname);
        cb(null, `producto_${Date.now()}${ext}`);
    }
});

// Solo aceptar imágenes
const fileFilter = (req, file, cb) => {
    const tiposPermitidos = /jpeg|jpg|png|gif|webp/;
    const esValido = tiposPermitidos.test(path.extname(file.originalname).toLowerCase());
    if (esValido) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten imágenes (jpg, png, gif, webp)'));
    }
};

const upload = multer({
    storage   : storage,
    fileFilter: fileFilter,
    limits    : { fileSize: 5 * 1024 * 1024 } // máximo 5MB
});

// ============================================================
// GET /productos/todos
// Devuelve todos los productos activos con nombre de empresa y categoría
// Este endpoint lo usa el index.html (catálogo para compradores)
// ============================================================
router.get('/todos', async (req, res) => {
    try {
        const sql = `
            SELECT 
                p.id,
                p.nombre,
                p.descripcion,
                p.precio,
                p.stock,
                p.imagen,
                p.es_destacado,
                e.nombre  AS empresa_nombre,
                c.nombre  AS categoria_nombre
            FROM productos_servicios p
            JOIN empresas   e ON p.empresa_id   = e.id
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.activo = 1
            ORDER BY p.fecha_creacion DESC
        `;
        const [productos] = await db.query(sql);
        res.json(productos);
    } catch (err) {
        console.error('Error al obtener productos:', err);
        res.status(500).json({ error: 'Error al obtener productos' });
    }
});

// ============================================================
// GET /productos/mis-productos
// Solo devuelve los productos de la empresa logueada
// Lo usa el dashboard-empresa.html
// ============================================================
router.get('/mis-productos', async (req, res) => {
    // Verificar sesión de empresa
    if (!req.session.empresaId) {
        return res.status(401).json({ error: 'Debes iniciar sesión como empresa' });
    }

    try {
        const sql = `
            SELECT 
                p.id,
                p.nombre,
                p.descripcion,
                p.precio,
                p.stock,
                p.imagen,
                p.es_destacado,
                p.activo,
                p.fecha_creacion,
                c.nombre AS categoria_nombre
            FROM productos_servicios p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.empresa_id = ?
            ORDER BY p.fecha_creacion DESC
        `;
        const [productos] = await db.query(sql, [req.session.empresaId]);
        res.json(productos);
    } catch (err) {
        console.error('Error al obtener mis productos:', err);
        res.status(500).json({ error: 'Error al obtener tus productos' });
    }
});

// ============================================================
// GET /productos/:id
// Detalle de un producto específico
// ============================================================
router.get('/:id', async (req, res) => {
    try {
        const sql = `
            SELECT 
                p.*,
                e.nombre  AS empresa_nombre,
                e.descripcion AS empresa_descripcion,
                c.nombre  AS categoria_nombre
            FROM productos_servicios p
            JOIN empresas   e ON p.empresa_id   = e.id
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.id = ? AND p.activo = 1
        `;
        const [rows] = await db.query(sql, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('Error al obtener producto:', err);
        res.status(500).json({ error: 'Error al obtener el producto' });
    }
});

// ============================================================
// POST /productos/agregar
// Crea un nuevo producto — solo para empresas logueadas
// Body (form-data): nombre, descripcion, precio, stock, categoria_id, imagen (archivo)
// ============================================================
router.post('/agregar', upload.single('imagen'), async (req, res) => {
    // Verificar sesión de empresa
    if (!req.session.empresaId) {
        return res.status(401).json({ error: 'Debes iniciar sesión como empresa' });
    }

    const { nombre, descripcion, precio, stock, categoria_id } = req.body;

    // Validaciones básicas
    if (!nombre || !precio || !stock) {
        return res.status(400).json({ error: 'Nombre, precio y stock son obligatorios' });
    }

    if (isNaN(precio) || precio <= 0) {
        return res.status(400).json({ error: 'El precio debe ser un número mayor a 0' });
    }

    if (isNaN(stock) || stock < 0) {
        return res.status(400).json({ error: 'El stock debe ser un número positivo' });
    }

    // Nombre de la imagen subida (o imagen por defecto)
    const imagen = req.file ? req.file.filename : 'default.jpg';

    try {
        const sql = `
            INSERT INTO productos_servicios 
                (nombre, descripcion, precio, stock, imagen, empresa_id, categoria_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(sql, [
            nombre,
            descripcion || '',
            parseFloat(precio),
            parseInt(stock),
            imagen,
            req.session.empresaId,
            categoria_id || null
        ]);

        res.status(201).json({
            message   : 'Producto creado exitosamente',
            productoId: result.insertId
        });
    } catch (err) {
        console.error('Error al agregar producto:', err);
        res.status(500).json({ error: 'Error al guardar el producto' });
    }
});

// ============================================================
// PUT /productos/editar/:id
// Edita un producto — solo la empresa dueña puede editarlo
// Body (form-data): nombre, descripcion, precio, stock, categoria_id, imagen (opcional)
// ============================================================
router.put('/editar/:id', upload.single('imagen'), async (req, res) => {
    if (!req.session.empresaId) {
        return res.status(401).json({ error: 'Debes iniciar sesión como empresa' });
    }

    const { id } = req.params;
    const { nombre, descripcion, precio, stock, categoria_id } = req.body;

    if (!nombre || !precio || !stock) {
        return res.status(400).json({ error: 'Nombre, precio y stock son obligatorios' });
    }

    try {
        // Verificar que el producto pertenece a esta empresa
        const [rows] = await db.query(
            'SELECT * FROM productos_servicios WHERE id = ? AND empresa_id = ?',
            [id, req.session.empresaId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado o no tienes permiso para editarlo' });
        }

        const productoActual = rows[0];

        // Si subió nueva imagen, usar la nueva; si no, mantener la actual
        let imagen = productoActual.imagen;
        if (req.file) {
            imagen = req.file.filename;
            // Borrar imagen anterior si no es la default
            if (productoActual.imagen && productoActual.imagen !== 'default.jpg') {
                const rutaAnterior = path.join(uploadDir, productoActual.imagen);
                if (fs.existsSync(rutaAnterior)) {
                    fs.unlinkSync(rutaAnterior);
                }
            }
        }

        const sql = `
            UPDATE productos_servicios
            SET nombre = ?, descripcion = ?, precio = ?, stock = ?, imagen = ?, categoria_id = ?
            WHERE id = ? AND empresa_id = ?
        `;
        await db.query(sql, [
            nombre,
            descripcion || '',
            parseFloat(precio),
            parseInt(stock),
            imagen,
            categoria_id || null,
            id,
            req.session.empresaId
        ]);

        res.json({ message: 'Producto actualizado exitosamente' });

    } catch (err) {
        console.error('Error al editar producto:', err);
        res.status(500).json({ error: 'Error al actualizar el producto' });
    }
});

// ============================================================
// DELETE /productos/eliminar/:id
// Elimina (desactiva) un producto — solo la empresa dueña
// Usamos activo=0 en lugar de borrar físicamente para no
// romper el historial de pedidos que lo referencian
// ============================================================
router.delete('/eliminar/:id', async (req, res) => {
    if (!req.session.empresaId) {
        return res.status(401).json({ error: 'Debes iniciar sesión como empresa' });
    }

    const { id } = req.params;

    try {
        // Verificar que el producto pertenece a esta empresa
        const [rows] = await db.query(
            'SELECT id FROM productos_servicios WHERE id = ? AND empresa_id = ?',
            [id, req.session.empresaId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado o no tienes permiso' });
        }

        // Desactivar en lugar de borrar físicamente
        await db.query(
            'UPDATE productos_servicios SET activo = 0 WHERE id = ?',
            [id]
        );

        res.json({ message: 'Producto eliminado exitosamente' });

    } catch (err) {
        console.error('Error al eliminar producto:', err);
        res.status(500).json({ error: 'Error al eliminar el producto' });
    }
});

module.exports = router;