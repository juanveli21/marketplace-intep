const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { isLoggedIn } = require('../middlewares/auth');

// GET /reseñas/:productoId  — obtener reseñas de un producto
router.get('/:productoId', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT r.*, u.nombre AS usuario_nombre
            FROM reseñas r
            JOIN usuarios u ON r.usuario_id = u.id
            WHERE r.producto_id = ?
            ORDER BY r.fecha DESC
        `, [req.params.productoId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener reseñas' });
    }
});

// POST /reseñas  — crear reseña (solo compradores que han comprado el producto)
router.post('/', isLoggedIn, async (req, res) => {
    const { producto_id, calificacion, comentario } = req.body;
    if (!producto_id || !calificacion) {
        return res.status(400).json({ error: 'Producto y calificación son obligatorios' });
    }
    if (calificacion < 1 || calificacion > 5) {
        return res.status(400).json({ error: 'Calificación debe ser entre 1 y 5' });
    }
    try {
        // Verificar que el usuario haya comprado el producto
        const [compra] = await db.query(`
            SELECT dp.id FROM detalle_pedidos dp
            JOIN pedidos p ON dp.pedido_id = p.id
            WHERE p.cliente_id = ? AND dp.producto_id = ?
            LIMIT 1
        `, [req.session.usuarioId, producto_id]);

        if (compra.length === 0) {
            return res.status(403).json({ error: 'Solo puedes reseñar productos que hayas comprado' });
        }

        await db.query(
            'INSERT INTO reseñas (producto_id, usuario_id, calificacion, comentario) VALUES (?,?,?,?)',
            [producto_id, req.session.usuarioId, calificacion, comentario || '']
        );
        res.status(201).json({ message: 'Reseña publicada' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya dejaste una reseña para este producto' });
        }
        res.status(500).json({ error: 'Error al guardar reseña' });
    }
});

// DELETE /reseñas/:id — eliminar propia reseña
router.delete('/:id', isLoggedIn, async (req, res) => {
    try {
        const [result] = await db.query(
            'DELETE FROM reseñas WHERE id = ? AND usuario_id = ?',
            [req.params.id, req.session.usuarioId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Reseña no encontrada' });
        }
        res.json({ message: 'Reseña eliminada' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar reseña' });
    }
});

// GET /reseñas/empresa/:empresaId — todas las reseñas de productos de una empresa
router.get('/empresa/:empresaId', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT r.*, u.nombre AS usuario_nombre,
                   p.nombre AS producto_nombre
            FROM reseñas r
            JOIN usuarios u ON r.usuario_id = u.id
            JOIN productos_servicios p ON r.producto_id = p.id
            WHERE p.empresa_id = ?
            ORDER BY r.fecha DESC
        `, [req.params.empresaId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener reseñas' });
    }
});

module.exports = router;
