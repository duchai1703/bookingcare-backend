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

// Body parser (SRS Section 5.2: JSON format, Constraint #7: 5MB image)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

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
