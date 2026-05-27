const mysql = require('mysql2');

const pool = mysql.createPool({
    host    : process.env.MYSQLHOST     || 'localhost',
    user    : process.env.MYSQLUSER     || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'marketplace_db',
    port    : process.env.MYSQLPORT     || 3306,
    waitForConnections: true,
    connectionLimit   : 10,
    queueLimit        : 0
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Error conectando a MySQL:', err.message);
        return;
    }
    console.log('✅ Conexión exitosa a MySQL (pool activo)');
    connection.release();
});

module.exports = pool.promise();