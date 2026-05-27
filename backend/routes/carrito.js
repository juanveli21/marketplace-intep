
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ── Helper: verificar sesión de comprador ──────────────────
function verificarSesion(req, res) {
    if (!req.session || !req.session.usuarioId) {
        res.status(401).json({ error: 'Debes iniciar sesión para usar el carrito' });
        return false;
    }
    return true;
}


// GET /carrito

router.get('/', async (req, res) => {
    if (!verificarSesion(req, res)) return;

    try {
        const sql = `
            SELECT
                ci.id            AS carrito_item_id,
                ci.cantidad,
                p.id             AS producto_id,
                p.nombre         AS producto_nombre,
                p.descripcion    AS producto_descripcion,
                p.precio,
                p.imagen,
                p.stock,
                e.nombre         AS empresa_nombre,
                (ci.cantidad * p.precio) AS subtotal
            FROM carrito_items ci
            JOIN productos_servicios p ON ci.producto_id = p.id
            JOIN empresas            e ON p.empresa_id   = e.id
            WHERE ci.usuario_id = ?
              AND p.activo = 1
            ORDER BY ci.id DESC
        `;
        const [items] = await db.query(sql, [req.session.usuarioId]);

        // Calcular total general
        const total = items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);

        res.json({ items, total, cantidad_items: items.length });

    } catch (err) {
        console.error('Error al obtener carrito:', err);
        res.status(500).json({ error: 'Error al obtener el carrito' });
    }
});


// POST /carrito/agregar
// Body: { producto_id, cantidad }
// Si el producto ya está en el carrito, suma la cantidad

router.post('/agregar', async (req, res) => {
    if (!verificarSesion(req, res)) return;

    const { producto_id, cantidad = 1 } = req.body;

    if (!producto_id) {
        return res.status(400).json({ error: 'producto_id es obligatorio' });
    }

    if (cantidad < 1 || isNaN(cantidad)) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
    }

    try {
        // Verificar que el producto existe, está activo y tiene stock
        const [productos] = await db.query(
            'SELECT id, nombre, stock, precio FROM productos_servicios WHERE id = ? AND activo = 1',
            [producto_id]
        );

        if (productos.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado o no disponible' });
        }

        const producto = productos[0];

        if (producto.stock < cantidad) {
            return res.status(400).json({
                error: `Stock insuficiente. Disponible: ${producto.stock} unidades`
            });
        }

        // INSERT o UPDATE si ya existe en el carrito (ON DUPLICATE KEY)
        // La tabla tiene UNIQUE(usuario_id, producto_id), así que si ya existe
        // simplemente sumamos la cantidad nueva
        await db.query(`
            INSERT INTO carrito_items (usuario_id, producto_id, cantidad)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)
        `, [req.session.usuarioId, producto_id, parseInt(cantidad)]);

        // Verificar que la cantidad total no supere el stock
        const [itemActual] = await db.query(
            'SELECT cantidad FROM carrito_items WHERE usuario_id = ? AND producto_id = ?',
            [req.session.usuarioId, producto_id]
        );

        if (itemActual[0].cantidad > producto.stock) {
            // Ajustar al máximo disponible
            await db.query(
                'UPDATE carrito_items SET cantidad = ? WHERE usuario_id = ? AND producto_id = ?',
                [producto.stock, req.session.usuarioId, producto_id]
            );
            return res.json({
                message: `Cantidad ajustada al stock disponible (${producto.stock} unidades)`,
                ajustado: true
            });
        }

        res.json({ message: `"${producto.nombre}" agregado al carrito` });

    } catch (err) {
        console.error('Error al agregar al carrito:', err);
        res.status(500).json({ error: 'Error al agregar el producto al carrito' });
    }
});


// PUT /carrito/actualizar/:id
// Actualiza la cantidad de un ítem específico del carrito
// Body: { cantidad }
// :id es el carrito_item_id (no el producto_id)

router.put('/actualizar/:id', async (req, res) => {
    if (!verificarSesion(req, res)) return;

    const { id }       = req.params;
    const { cantidad } = req.body;

    if (!cantidad || cantidad < 1 || isNaN(cantidad)) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
    }

    try {
        // Verificar que el ítem pertenece al usuario
        const [items] = await db.query(`
            SELECT ci.id, p.stock, p.nombre
            FROM carrito_items ci
            JOIN productos_servicios p ON ci.producto_id = p.id
            WHERE ci.id = ? AND ci.usuario_id = ?
        `, [id, req.session.usuarioId]);

        if (items.length === 0) {
            return res.status(404).json({ error: 'Ítem no encontrado en tu carrito' });
        }

        const item = items[0];

        if (parseInt(cantidad) > item.stock) {
            return res.status(400).json({
                error: `Stock insuficiente. Máximo disponible: ${item.stock}`
            });
        }

        await db.query(
            'UPDATE carrito_items SET cantidad = ? WHERE id = ? AND usuario_id = ?',
            [parseInt(cantidad), id, req.session.usuarioId]
        );

        res.json({ message: 'Cantidad actualizada' });

    } catch (err) {
        console.error('Error al actualizar carrito:', err);
        res.status(500).json({ error: 'Error al actualizar la cantidad' });
    }
});

// DELETE /carrito/vaciar
// Elimina TODOS los ítems del carrito del usuario

router.delete('/vaciar', async (req, res) => {
    if (!verificarSesion(req, res)) return;

    try {
        await db.query(
            'DELETE FROM carrito_items WHERE usuario_id = ?',
            [req.session.usuarioId]
        );
        res.json({ message: 'Carrito vaciado' });
    } catch (err) {
        console.error('Error al vaciar carrito:', err);
        res.status(500).json({ error: 'Error al vaciar el carrito' });
    }
});


// DELETE /carrito/eliminar/:id
// Elimina un ítem específico del carrito

router.delete('/eliminar/:id', async (req, res) => {
    if (!verificarSesion(req, res)) return;

    const { id } = req.params;

    try {
        const [result] = await db.query(
            'DELETE FROM carrito_items WHERE id = ? AND usuario_id = ?',
            [id, req.session.usuarioId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ítem no encontrado en tu carrito' });
        }

        res.json({ message: 'Producto eliminado del carrito' });

    } catch (err) {
        console.error('Error al eliminar del carrito:', err);
        res.status(500).json({ error: 'Error al eliminar el producto del carrito' });
    }
});

module.exports = router;
