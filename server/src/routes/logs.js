const { Router } = require('express');
const { getDb } = require('../core/database');

const router = Router();

router.get('/', (req, res) => {
  const { level, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT * FROM logs';
  const params = [];

  if (level) {
    sql += ' WHERE level = ?';
    params.push(level);
  }

  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const rows = getDb().prepare(sql).all(...params);
  res.json(rows);
});

module.exports = router;
