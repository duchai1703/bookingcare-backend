const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { User } = require('../src/models');
User.findOne({ where: { roleId: 'R1' } }).then(u => {
  console.log('Admin:', u ? { id: u.id, email: u.email, roleId: u.roleId } : 'none');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
