const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// Listar categorías
router.get('/', async (req, res) => {
    try {
        const [results] = await db.query('SELECT * FROM categorias');
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear categoría (Solo Admin)
router.post('/crear', async (req, res) => {
    try {
        const { nombre } = req.body;
        await db.query('INSERT INTO categorias (nombre) VALUES (?)', [nombre]);
        res.json({ message: 'Categoría creada con éxito' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;