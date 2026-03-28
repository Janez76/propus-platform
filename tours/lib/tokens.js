const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const TOKEN_BYTES = 32;
const SALT_ROUNDS = 10;

function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

async function hashToken(token) {
  return bcrypt.hash(token, SALT_ROUNDS);
}

async function verifyToken(plainToken, hashedToken) {
  return bcrypt.compare(plainToken, hashedToken);
}

module.exports = {
  generateToken,
  hashToken,
  verifyToken,
};
