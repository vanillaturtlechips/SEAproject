const express = require('express');
const { Pool } = require('pg'); // PostgreSQL 사용

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL 연결 설정 (환경 변수에서 가져옴)
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'mydatabase',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

app.get('/', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    res.send(`Hello World! DB Time: ${result.rows[0].now}`);
    client.release();
  } catch (err) {
    console.error('Database connection error', err.stack);
    res.status(500).send('Error connecting to database');
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});