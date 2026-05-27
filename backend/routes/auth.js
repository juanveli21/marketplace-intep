// ============================================================
//  routes/auth.js
//  Rutas: POST /auth/login
//         POST /auth/registro-comprador
//         POST /auth/registro-empresa
//         POST /auth/logout
//         GET  /auth/sesion  (para que el frontend sepa quién está logueado)
// ============================================================

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db/connection');
const { isLoggedIn } = require('../middlewares/auth');

// ------------------------------------------------------------
// POST /auth/login
// Body: { correo, clave }
// ------------------------------------------------------------
router.post('/login', async (req, res) => {
    const { correo, clave } = req.body;

    if (!correo || !clave) {
        return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
    }

    try {
        // Buscar usuario por correo
        const [rows] = await db.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
        }

        const usuario = rows[0];

        // Verificar contraseña
        const coincide = await bcrypt.compare(clave, usuario.password);
        if (!coincide) {
            return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
        }

        // Guardar datos básicos en sesión
        req.session.usuarioId = usuario.id;
        req.session.rol       = usuario.rol_id;
        req.session.nombre    = usuario.nombre;

        // Si es empresa, también guardamos el empresaId
        if (usuario.rol_id === 2) {
            const [emp] = await db.query(
                'SELECT id FROM empresas WHERE usuario_id = ?', [usuario.id]
            );
            if (emp.length > 0) {
                req.session.empresaId = emp[0].id;
            }
        }

        // Respuesta con rol para que el frontend redirija
        const roles = { 1: 'admin', 2: 'empresa', 3: 'comprador' };
        return res.json({
            message: 'Login exitoso',
            rol: roles[usuario.rol_id],
            nombre: usuario.nombre
        });

    } catch (err) {
        console.error('Error en login:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ------------------------------------------------------------
// POST /auth/registro-comprador
// Body: { nombre, correo, clave }
// ------------------------------------------------------------
router.post('/registro-comprador', async (req, res) => {
    const { nombre, correo, clave } = req.body;

    if (!nombre || !correo || !clave) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    if (clave.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });
    }

    try {
        // Verificar si el correo ya existe
        const [existe] = await db.query('SELECT id FROM usuarios WHERE correo = ?', [correo]);
        if (existe.length > 0) {
            return res.status(409).json({ error: 'Este correo ya está registrado' });
        }

        // Hashear contraseña
        const hash = await bcrypt.hash(clave, 10);

        // Insertar usuario con rol comprador (rol_id = 3)
        await db.query(
            'INSERT INTO usuarios (nombre, correo, password, rol_id) VALUES (?, ?, ?, 3)',
            [nombre, correo, hash]
        );

        return res.status(201).json({ message: 'Registro exitoso. Ya puedes iniciar sesión.' });

    } catch (err) {
        console.error('Error en registro-comprador:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ------------------------------------------------------------
// POST /auth/registro-empresa
// Body: { nombre_usuario, correo, clave, nombre_empresa, nit, descripcion }
// ------------------------------------------------------------
router.post('/registro-empresa', async (req, res) => {
    const { nombre_usuario, correo, clave, nombre_empresa, nit, descripcion } = req.body;

    if (!nombre_usuario || !correo || !clave || !nombre_empresa) {
        return res.status(400).json({ error: 'Nombre, correo, contraseña y nombre de empresa son obligatorios' });
    }

    if (clave.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });
    }

    try {
        // Verificar si el correo ya existe
        const [existe] = await db.query('SELECT id FROM usuarios WHERE correo = ?', [correo]);
        if (existe.length > 0) {
            return res.status(409).json({ error: 'Este correo ya está registrado' });
        }

        // Hashear contraseña
        const hash = await bcrypt.hash(clave, 10);

        // Insertar usuario con rol empresa (rol_id = 2)
        const [result] = await db.query(
            'INSERT INTO usuarios (nombre, correo, password, rol_id) VALUES (?, ?, ?, 2)',
            [nombre_usuario, correo, hash]
        );

        const nuevoUsuarioId = result.insertId;

        // Insertar perfil de empresa vinculado al usuario
        await db.query(
            'INSERT INTO empresas (nombre, descripcion, nit, usuario_id) VALUES (?, ?, ?, ?)',
            [nombre_empresa, descripcion || '', nit || null, nuevoUsuarioId]
        );

        return res.status(201).json({ message: 'Empresa registrada exitosamente. Ya puedes iniciar sesión.' });

    } catch (err) {
        console.error('Error en registro-empresa:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ------------------------------------------------------------
// POST /auth/logout
// ------------------------------------------------------------
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Error al cerrar sesión' });
        }
        res.clearCookie('connect.sid');
        return res.json({ message: 'Sesión cerrada correctamente' });
    });
});

// ------------------------------------------------------------
// GET /auth/sesion
// El frontend llama esta ruta para saber si hay sesión activa
// y a qué página redirigir
// ------------------------------------------------------------
router.get('/sesion', (req, res) => {
    if (!req.session.usuarioId) {
        return res.json({ logueado: false });
    }

    const roles = { 1: 'admin', 2: 'empresa', 3: 'comprador' };
    return res.json({
        logueado  : true,
        usuarioId : req.session.usuarioId,
        nombre    : req.session.nombre,
        rol       : roles[req.session.rol],
        empresaId : req.session.empresaId || null
    });
});

module.exports = router;

// PUT /auth/actualizar-perfil
router.put('/actualizar-perfil', async (req, res) => {
    if (!req.session.usuarioId) {
        return res.status(401).json({ error: 'No autenticado' });
    }
    const { nombre, clave } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

    try {
        if (clave && clave.length >= 6) {
            const hash = await bcrypt.hash(clave, 10);
            await db.query('UPDATE usuarios SET nombre=?, password=? WHERE id=?',
                [nombre, hash, req.session.usuarioId]);
        } else {
            await db.query('UPDATE usuarios SET nombre=? WHERE id=?',
                [nombre, req.session.usuarioId]);
        }
        req.session.nombre = nombre;
        res.json({ message: 'Perfil actualizado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
});