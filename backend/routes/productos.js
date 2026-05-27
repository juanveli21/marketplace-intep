// ============================================================
//  routes/productos.js
// ============================================================

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { upload } = require('../db/cloudinary');

// ============================================================
// GET /productos/todos
// ============================================================
router.get('/todos', async (req, res) => {
    try {
        const sql = `
            SELECT 
                p.id, p.nombre, p.descripcion, p.precio, p.stock,
                p.imagen, p.es_destacado,
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
        console.error('Error al obtener productos:', err.message, err.stack);
        res.status(500).json({ error: 'Error al obtener productos' });
    }
});

// ============================================================
// GET /productos/mis-productos
// ============================================================
router.get('/mis-productos', async (req, res) => {
    if (!req.session.empresaId) {
        return res.status(401).json({ error: 'Debes iniciar sesión como empresa' });
    }
    try {
        const sql = `
            SELECT 
                p.id, p.nombre, p.descripcion, p.precio, p.stock,
                p.imagen, p.es_destacado, p.activo, p.fecha_creacion,
                c.nombre AS categoria_nombre
            FROM productos_servicios p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.empresa_id = ?
            ORDER BY p.fecha_creacion DESC
        `;
        const [productos] = await db.query(sql, [req.session.empresaId]);
        res.json(productos);
    } catch (err) {
        console.error('Error al obtener mis productos:', err.message, err.stack);
        res.status(500).json({ error: 'Error al obtener tus productos' });
    }
});

// ============================================================
// GET /productos/:id
// ============================================================
router.get('/:id', async (req, res) => {
    try {
        const sql = `
            SELECT p.*, e.nombre AS empresa_nombre,
                e.descripcion AS empresa_descripcion,
                c.nombre AS categoria_nombre
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
        console.error('Error al obtener producto:', err.message, err.stack);
        res.status(500).json({ error: 'Error al obtener el producto' });
    }
});

// ============================================================
// POST /productos/agregar
// ============================================================
router.post('/agregar', (req, res, next) => {
    upload.single('imagen')(req, res, (err) => {
        if (err) {
            console.error('Error en upload Cloudinary:', err.message, err.stack);
            return res.status(500).json({ error: 'Error al subir imagen: ' + err.message });
        }
        console.log('req.file:', JSON.stringify(req.file));
        next();
    });
}, async (req, res) => {
    if (!req.session.empresaId) {
        return res.status(401).json({ error: 'Debes iniciar sesión como empresa' });
    }

    const { nombre, descripcion, precio, stock, categoria_id } = req.body;

    if (!nombre || !precio || !stock) {
        return res.status(400).json({ error: 'Nombre, precio y stock son obligatorios' });
    }

    const imagen = req.file ? req.file.path : 'default.jpg';
    console.log('imagen a guardar:', imagen);

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
        console.error('Error al agregar producto:', err.message, err.stack);
        res.status(500).json({ error: 'Error al guardar el producto: ' + err.message });
    }
});

// ============================================================
// PUT /productos/editar/:id
// ============================================================
router.put('/editar/:id', (req, res, next) => {
    upload.single('imagen')(req, res, (err) => {
        if (err) {
            console.error('Error en upload Cloudinary:', err.message, err.stack);
            return res.status(500).json({ error: 'Error al subir imagen: ' + err.message });
        }
        console.log('req.file editar:', JSON.stringify(req.file));
        next();
    });
}, async (req, res) => {
    if (!req.session.empresaId) {
        return res.status(401).json({ error: 'Debes iniciar sesión como empresa' });
    }

    const { id } = req.params;
    const { nombre, descripcion, precio, stock, categoria_id } = req.body;

    if (!nombre || !precio || !stock) {
        return res.status(400).json({ error: 'Nombre, precio y stock son obligatorios' });
    }

    try {
        const [rows] = await db.query(
            'SELECT * FROM productos_servicios WHERE id = ? AND empresa_id = ?',
            [id, req.session.empresaId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado o sin permiso' });
        }

        const productoActual = rows[0];
        const imagen = req.file ? req.file.path : productoActual.imagen;

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
        console.error('Error al editar producto:', err.message, err.stack);
        res.status(500).json({ error: 'Error al actualizar el producto: ' + err.message });
    }
});

// ============================================================
// DELETE /productos/eliminar/:id
// ============================================================
router.delete('/eliminar/:id', async (req, res) => {
    if (!req.session.empresaId) {
        return res.status(401).json({ error: 'Debes iniciar sesión como empresa' });
    }

    const { id } = req.params;

    try {
        const [rows] = await db.query(
            'SELECT id FROM productos_servicios WHERE id = ? AND empresa_id = ?',
            [id, req.session.empresaId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado o sin permiso' });
        }

        await db.query(
            'UPDATE productos_servicios SET activo = 0 WHERE id = ?',
            [id]
        );

        res.json({ message: 'Producto eliminado exitosamente' });
    } catch (err) {
        console.error('Error al eliminar producto:', err.message, err.stack);
        res.status(500).json({ error: 'Error al eliminar el producto' });
    }
});

module.exports = router;