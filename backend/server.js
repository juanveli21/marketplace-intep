const express = require('express');
const session = require('express-session');
const path    = require('path');
const app     = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret           : 'clave_secreta_marketplace_2024',
    resave           : false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 3600000 }
}));

// Sirve el frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Sirve las imágenes subidas
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas
app.use('/auth',       require('./routes/auth'));
app.use('/productos',  require('./routes/productos'));
app.use('/categorias', require('./routes/categorias'));
app.use('/carrito',    require('./routes/carrito'));
app.use('/pedidos',    require('./routes/pedidos'));
app.use('/empresas',   require('./routes/empresas'));
app.use('/reseñas',    require('./routes/reseñas'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('-----------------------------------------');
    console.log(` Servidor en http://localhost:${PORT}`);
    console.log('-----------------------------------------');
});