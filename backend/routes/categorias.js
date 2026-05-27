const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// Listar categorías (Para el buscador y formularios)
router.get('/', (req, res) => {
    db.query('SELECT * FROM categorias', (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Crear categoría (Solo Admin)
router.post('/crear', (req, res) => {
    const { nombre } = req.body;
    db.query('INSERT INTO categorias (nombre) VALUES (?)', [nombre], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Categoría creada con éxito" });
    });
});

module.exports = router;