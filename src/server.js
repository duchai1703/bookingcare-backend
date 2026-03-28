require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./models');
const routes = require('./routes/web');

const app = express();

// SRS Section 5.4: CORS Policy
app.use(cors({
  origin: process.env.URL_REACT,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));

// DS-01 FIX: limit 100kb mặc định, riêng routes nhận ảnh dùng 6mb
const jsonSmall = bodyParser.json({ limit: '100kb' });
const jsonLarge = bodyParser.json({ limit: '6mb' }); // 5MB ảnh + buffer
const urlencodedSmall = bodyParser.urlencoded({ limit: '100kb', extended: true });

// Áp dụng limit nhỏ cho toàn bộ app — routes nhận ảnh sẽ override bằng jsonLarge
app.use(jsonSmall);
app.use(urlencodedSmall);

// Export jsonLarge để web.js dùng cho image-upload routes
app.locals.jsonLarge = jsonLarge;

// Routes
routes(app);

// Connect DB, sync tables, start server
const PORT = process.env.PORT || 8080;

db.sequelize.authenticate()
  .then(() => {
    console.log('>>> Database connected');
    return db.sequelize.sync();
  })
  .then(() => {
    console.log('>>> All tables synced');
    app.listen(PORT, () => {
      console.log(`>>> Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => console.error('>>> DB Error:', err));
