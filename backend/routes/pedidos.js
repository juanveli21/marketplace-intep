
//  routes/pedidos.js
//  POST /pedidos/crear        → crear pedido desde el carrito
//  GET  /pedidos/mis-pedidos  → historial del comprador
//  GET  /pedidos/:id          → detalle de un pedido


const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ── Helper: verificar sesión ───────────────────────────────
function verificarSesion(req, res) {
    if (!req.session || !req.session.usuarioId) {
        res.status(401).json({ error: 'Debes iniciar sesión' });
        return false;
    }
    return true;
}


// POST /pedidos/crear
// Toma todos los ítems del carrito del usuario,
// crea el pedido + detalle y vacía el carrito

router.post('/crear', async (req, res) => {
    if (!verificarSesion(req, res)) return;

    const usuarioId = req.session.usuarioId;

    try {
        // 1. Obtener ítems del carrito con precio actual
        const [items] = await db.query(`
            SELECT
                ci.id          AS carrito_item_id,
                ci.cantidad,
                p.id           AS producto_id,
                p.nombre,
                p.precio,
                p.stock,
                p.activo
            FROM carrito_items ci
            JOIN productos_servicios p ON ci.producto_id = p.id
            WHERE ci.usuario_id = ?
        `, [usuarioId]);

        if (items.length === 0) {
            return res.status(400).json({ error: 'Tu carrito está vacío' });
        }

        // 2. Verificar stock de cada producto
        for (const item of items) {
            if (!item.activo) {
                return res.status(400).json({
                    error: `El producto "${item.nombre}" ya no está disponible`
                });
            }
            if (item.cantidad > item.stock) {
                return res.status(400).json({
                    error: `Stock insuficiente para "${item.nombre}". Disponible: ${item.stock}`
                });
            }
        }

        // 3. Calcular total
        const total = items.reduce((sum, item) => {
            return sum + (parseFloat(item.precio) * item.cantidad);
        }, 0);

        // 4. Crear el pedido
        const [pedidoResult] = await db.query(`
            INSERT INTO pedidos (cliente_id, total, estado)
            VALUES (?, ?, 'pendiente')
        `, [usuarioId, total]);

        const pedidoId = pedidoResult.insertId;

        // 5. Insertar detalle del pedido y descontar stock
        for (const item of items) {
            // Insertar línea de detalle
            await db.query(`
                INSERT INTO detalle_pedidos (pedido_id, producto_id, cantidad, precio_unitario)
                VALUES (?, ?, ?, ?)
            `, [pedidoId, item.producto_id, item.cantidad, item.precio]);

            // Descontar stock
            await db.query(`
                UPDATE productos_servicios
                SET stock = stock - ?
                WHERE id = ?
            `, [item.cantidad, item.producto_id]);
        }

        // 6. Vaciar el carrito
        await db.query(
            'DELETE FROM carrito_items WHERE usuario_id = ?',
            [usuarioId]
        );

        res.status(201).json({
            message  : '¡Pedido realizado exitosamente!',
            pedido_id: pedidoId,
            total    : total
        });

    } catch (err) {
        console.error('Error al crear pedido:', err);
        res.status(500).json({ error: 'Error al procesar el pedido' });
    }
});


// GET /pedidos/mis-pedidos
// Historial de pedidos del usuario logueado

router.get('/mis-pedidos', async (req, res) => {
    if (!verificarSesion(req, res)) return;

    try {
        const [pedidos] = await db.query(`
            SELECT
                p.id,
                p.fecha,
                p.total,
                p.estado,
                COUNT(dp.id) AS cantidad_productos
            FROM pedidos p
            JOIN detalle_pedidos dp ON dp.pedido_id = p.id
            WHERE p.cliente_id = ?
            GROUP BY p.id
            ORDER BY p.fecha DESC
        `, [req.session.usuarioId]);

        res.json(pedidos);

    } catch (err) {
        console.error('Error al obtener pedidos:', err);
        res.status(500).json({ error: 'Error al obtener tus pedidos' });
    }
});


// GET /pedidos/:id
// Detalle completo de un pedido (productos, precios, empresa)

router.get('/:id', async (req, res) => {
    if (!verificarSesion(req, res)) return;

    const { id } = req.params;

    try {
        // Verificar que el pedido pertenece al usuario
        const [pedidos] = await db.query(
            'SELECT * FROM pedidos WHERE id = ? AND cliente_id = ?',
            [id, req.session.usuarioId]
        );

        if (pedidos.length === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        // Obtener el detalle con productos y empresas
        const [detalle] = await db.query(`
            SELECT
                dp.cantidad,
                dp.precio_unitario,
                (dp.cantidad * dp.precio_unitario) AS subtotal,
                ps.nombre   AS producto_nombre,
                ps.imagen,
                e.nombre    AS empresa_nombre
            FROM detalle_pedidos dp
            JOIN productos_servicios ps ON dp.producto_id = ps.id
            JOIN empresas            e  ON ps.empresa_id  = e.id
            WHERE dp.pedido_id = ?
        `, [id]);

        res.json({
            pedido : pedidos[0],
            detalle: detalle
        });

    } catch (err) {
        console.error('Error al obtener detalle:', err);
        res.status(500).json({ error: 'Error al obtener el detalle del pedido' });
    }
});

module.exports = router;
