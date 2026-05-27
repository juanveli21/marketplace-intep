const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const multer  = require('multer');
const path    = require('path');
const { isLoggedIn } = require('../middlewares/auth');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// GET /empresas/destacadas — para el catálogo
router.get('/destacadas', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT e.*, u.correo,
                   COUNT(DISTINCT p.id) AS total_productos,
                   ROUND(AVG(r.calificacion), 1) AS calificacion_promedio
            FROM empresas e
            JOIN usuarios u ON e.usuario_id = u.id
            LEFT JOIN productos_servicios p ON p.empresa_id = e.id AND p.activo = 1
            LEFT JOIN reseñas r ON r.producto_id = p.id
            WHERE e.es_destacada = TRUE
            GROUP BY e.id
            ORDER BY e.nombre ASC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener empresas' });
    }
});

// GET /empresas/mi-perfil — perfil de la empresa logueada
router.get('/mi-perfil', isLoggedIn, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT e.*, u.nombre AS nombre_usuario, u.correo
            FROM empresas e
            JOIN usuarios u ON e.usuario_id = u.id
            WHERE e.id = ?
        `, [req.session.empresaId]);
        if (!rows.length) return res.status(404).json({ error: 'Empresa no encontrada' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

// PUT /empresas/mi-perfil — actualizar perfil empresa
router.put('/mi-perfil', isLoggedIn, upload.single('logo'), async (req, res) => {
    const { nombre, descripcion, nit } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    try {
        if (req.file) {
            await db.query(
                'UPDATE empresas SET nombre=?, descripcion=?, nit=?, logo=? WHERE id=?',
                [nombre, descripcion || '', nit || null, req.file.filename, req.session.empresaId]
            );
        } else {
            await db.query(
                'UPDATE empresas SET nombre=?, descripcion=?, nit=? WHERE id=?',
                [nombre, descripcion || '', nit || null, req.session.empresaId]
            );
        }
        res.json({ message: 'Perfil actualizado' });
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
});

// GET /empresas/ventas — ventas de la empresa logueada
router.get('/ventas', isLoggedIn, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                dp.id, p.id AS pedido_id, p.fecha, p.estado,
                ps.nombre AS producto_nombre, ps.imagen,
                dp.cantidad, dp.precio_unitario,
                (dp.cantidad * dp.precio_unitario) AS subtotal,
                u.nombre AS comprador_nombre
            FROM detalle_pedidos dp
            JOIN pedidos p ON dp.pedido_id = p.id
            JOIN productos_servicios ps ON dp.producto_id = ps.id
            JOIN usuarios u ON p.cliente_id = u.id
            WHERE ps.empresa_id = ?
            ORDER BY p.fecha DESC
        `, [req.session.empresaId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener ventas' });
    }
});

module.exports = router;
