const fs = require('fs');
const path = require('path');
const { buildTrainingDataset } = require('../lib/suggestions');
const { pool } = require('../lib/db');

async function main() {
  const outputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '..', 'tmp', 'training-dataset.json');
  const limit = Math.max(1, Math.min(parseInt(process.argv[3] || '500', 10) || 500, 5000));
  const examples = await buildTrainingDataset(limit);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    exportedAt: new Date().toISOString(),
    count: examples.length,
    examples,
  }, null, 2));
  console.log(`Trainingsdaten exportiert: ${examples.length} Beispiele -> ${outputPath}`);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
