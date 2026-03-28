#!/usr/bin/env node
/** Test: Matterport API – listModels + getModel */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../docker/.env') });
require('dotenv').config();

const matterport = require('../lib/matterport');

async function main() {
  console.log('=== Matterport API Test ===\n');
  console.log('Env: MATTERPORT_TOKEN_ID =', process.env.MATTERPORT_TOKEN_ID ? '***' : '(nicht gesetzt)');
  console.log('Env: MATTERPORT_TOKEN_SECRET =', process.env.MATTERPORT_TOKEN_SECRET ? '***' : '(nicht gesetzt)');
  console.log('');

  // 1. listModels
  console.log('1. listModels()...');
  const list = await matterport.listModels();
  if (list.error) {
    console.log('   FEHLER:', list.error);
    process.exit(1);
  }
  console.log('   OK –', list.results?.length ?? 0, 'Models gefunden');

  // 2. getModel (wenn mindestens ein Model existiert)
  const firstId = list.results?.[0]?.id;
  if (firstId) {
    console.log('\n2. getModel("' + firstId + '")...');
    const { model, error } = await matterport.getModel(firstId);
    if (error) {
      console.log('   FEHLER:', error);
    } else {
      console.log('   OK – Name:', model?.name || '-', '| created:', model?.created || '-');
    }
  } else {
    console.log('\n2. getModel – übersprungen (keine Models vorhanden)');
  }

  console.log('\n=== Matterport API funktioniert ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
