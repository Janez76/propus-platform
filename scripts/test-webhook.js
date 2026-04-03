const crypto = require('crypto');
const http = require('http');

const secret = process.env.PAYREXX_WEBHOOK_SECRET || '';
const body = JSON.stringify({ transaction: { status: 'confirmed', referenceId: 'tour-999-internal-test' } });
const sig = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');

const req = http.request({
  hostname: 'localhost', port: 3100,
  path: '/tour-manager/webhook/payrexx',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'payrexx-signature': sig },
}, (res) => {
  let d = '';
  res.on('data', x => d += x);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', d);
    console.log(res.statusCode === 200 ? '✓ Webhook OK' : '✗ Webhook FEHLER');
  });
});
req.write(body);
req.end();
