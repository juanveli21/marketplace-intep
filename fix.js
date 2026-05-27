const bcrypt = require('bcryptjs');
bcrypt.hash('admin2026', 10).then(hash => {
    console.log("Copia este hash exacto:");
    console.log(hash);
})