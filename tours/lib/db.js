const { Pool } = require('pg');

const DB_SEARCH_PATH = process.env.DB_SEARCH_PATH || 'tour_manager,core,public';

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USER || 'propus',
  password: process.env.POSTGRES_PASSWORD || 'change_me',
  database: process.env.POSTGRES_DB || 'propus',
  options: `-c search_path=${DB_SEARCH_PATH}`,
});

module.exports = { pool };
