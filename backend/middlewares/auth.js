// ============================================================
//  middlewares/auth.js
//  Protege rutas según si el usuario está logueado y su rol
//  Uso en rutas:
//    router.get('/ruta', isLoggedIn, isEmpresa, handler)
//    router.get('/ruta', isLoggedIn, isComprador, handler)
// ============================================================

// Verifica que haya una sesión activa (cualquier rol)
function isLoggedIn(req, res, next) {
    if (req.session && req.session.usuarioId) {
        return next();
    }
    // Si la petición es fetch/AJAX devuelve JSON, si es navegación redirige
    if (req.headers['content-type'] === 'application/json' ||
        req.headers['accept']?.includes('application/json')) {
        return res.status(401).json({ error: 'Debes iniciar sesión' });
    }
    return res.redirect('/login.html');
}

// Solo empresas (rol_id = 2)
function isEmpresa(req, res, next) {
    if (req.session && req.session.rol === 2) {
        return next();
    }
    return res.status(403).json({ error: 'Acceso solo para empresas' });
}

// Solo compradores (rol_id = 3)
function isComprador(req, res, next) {
    if (req.session && req.session.rol === 3) {
        return next();
    }
    return res.status(403).json({ error: 'Acceso solo para compradores' });
}

// Solo admin (rol_id = 1)
function isAdmin(req, res, next) {
    if (req.session && req.session.rol === 1) {
        return next();
    }
    return res.status(403).json({ error: 'Acceso solo para administradores' });
}

module.exports = { isLoggedIn, isEmpresa, isComprador, isAdmin };
