const fs = require('fs');

function helper() {
  return fs.existsSync('.') ? 1 : 0;
}

module.exports = { helper };
