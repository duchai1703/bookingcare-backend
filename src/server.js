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

// ✅ [FIX-IMAGE] DS-01 FIX v2: Tăng limit global lên 8mb
// TRƯỚC ĐÂY: 100kb global → jsonLarge (6mb) ở route KHÔNG có tác dụng
//   vì Express parse body ở middleware ĐẦU TIÊN (jsonSmall 100kb)
//   → body bị reject trước khi đến route-level jsonLarge
// SAU KHI FIX: 8mb global — đủ cho ảnh base64 (5MB ảnh ≈ 6.67MB base64)
app.use(bodyParser.json({ limit: '8mb' }));
app.use(bodyParser.urlencoded({ limit: '8mb', extended: true }));


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
