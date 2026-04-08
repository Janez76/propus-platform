const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LOCAL_KEY_B64 = 'khGOMQ8C264yxLl4PMuL9l1f7aE2BC7YoP6JPAL5YwU=';
const localKey = Buffer.from(LOCAL_KEY_B64, 'base64');

// Termius nutzt verschiedene Formate je nach Version
// Version 1: BA + Base64(1byte_version + 16byte_salt + 12byte_iv + 16byte_tag + ciphertext)
// Direkt: localKey als AES-Key ohne PBKDF2

function tryDecrypt(encStr) {
  const variants = [
    // Mit BA prefix entfernen
    encStr.startsWith('BA') ? encStr.slice(2) : null,
    encStr.startsWith('B') ? encStr.slice(1) : null,
    encStr,
  ].filter(Boolean);

  for (const b64 of variants) {
    try {
      const data = Buffer.from(b64, 'base64');
      if (data.length < 29) continue;

      // Variante 1: version(1) + salt(16) + iv(12) + tag(16) + cipher
      for (const [saltLen, ivLen] of [[16,12],[0,12],[0,16]]) {
        try {
          let offset = 1; // version byte überspringen
          const salt = saltLen ? data.slice(offset, offset + saltLen) : null;
          offset += saltLen;
          const iv = data.slice(offset, offset + ivLen);
          offset += ivLen;
          const tag = data.slice(offset, offset + 16);
          offset += 16;
          const cipher = data.slice(offset);
          if (cipher.length === 0) continue;

          // Key: direkt localKey oder PBKDF2
          const keys = [localKey];
          if (salt) keys.push(crypto.pbkdf2Sync(localKey, salt, 1000, 32, 'sha256'));
          if (salt) keys.push(crypto.pbkdf2Sync(localKey, salt, 10000, 32, 'sha256'));

          for (const key of keys) {
            try {
              const dc = crypto.createDecipheriv('aes-256-gcm', key, iv);
              dc.setAuthTag(tag);
              const out = Buffer.concat([dc.update(cipher), dc.final()]).toString('utf8');
              if (out && /[\x20-\x7E]{4,}/.test(out)) return out;
            } catch {}
          }
        } catch {}
      }
    } catch {}
  }
  return null;
}

const dbPath = path.join(process.env.APPDATA, 'Termius', 'IndexedDB', 'file__0.indexeddb.leveldb');
const files = fs.readdirSync(dbPath);

const allDecrypted = [];

for (const file of files) {
  const buf = fs.readFileSync(path.join(dbPath, file));
  const text = buf.toString('latin1');
  const regex = /(?:BA|B)([A-Za-z0-9+/]{20,}={0,2})/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const full = m[0];
    const dec = tryDecrypt(full);
    if (dec) {
      const ctxStart = Math.max(0, m.index - 80);
      const ctx = buf.slice(ctxStart, m.index + full.length + 40).toString('latin1').replace(/[^\x20-\x7E]/g, '.');
      allDecrypted.push({ file, dec, ctx });
    }
  }
}

console.log(`Entschlüsselte Werte: ${allDecrypted.length}`);

// Alle ausgeben
allDecrypted.forEach(r => {
  console.log(`\n[${r.file}]`);
  console.log(`  Kontext: ${r.ctx.slice(0, 120)}`);
  console.log(`  Wert:    ${r.dec.slice(0, 150)}`);
});
