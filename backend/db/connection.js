const mysql = require('mysql2');

const pool = mysql.createPool({
    host     : 'localhost',
    user     : 'root',
    password : 'root123',
    database : 'marketplace_db',
    waitForConnections: true,
    connectionLimit   : 10,
    queueLimit        : 0
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Error conectando a MySQL:', err.message);

        if (err.code === 'ECONNREFUSED')
            console.error('→ MySQL no está corriendo');
        if (err.code === 'ER_ACCESS_DENIED_ERROR')
            console.error('→ Usuario o contraseña incorrectos');
        if (err.code === 'ER_BAD_DB_ERROR')
            console.error('→ La base de datos no existe');

        return;
    }

    console.log('✅ MySQL conectado');
    connection.release();
});

module.exports = pool.promise();