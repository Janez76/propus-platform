const test = require('node:test');
const assert = require('node:assert/strict');
const { getAiConfig } = require('../lib/ai');

test('getAiConfig nutzt gpt-5.4 und gpt-5-mini als Defaults', () => {
  const previousModel = process.env.OPENAI_MODEL;
  const previousPrefilter = process.env.OPENAI_PREFILTER_MODEL;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_PREFILTER_MODEL;

  const config = getAiConfig();
  assert.equal(config.model, 'gpt-5.4');
  assert.equal(config.prefilterModel, 'gpt-5-mini');

  if (previousModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = previousModel;
  if (previousPrefilter === undefined) delete process.env.OPENAI_PREFILTER_MODEL;
  else process.env.OPENAI_PREFILTER_MODEL = previousPrefilter;
});

test('getAiConfig hält Legacy gpt-4.1-mini nur als Hauptmodell-Compat abwärtskompatibel', () => {
  const previousModel = process.env.OPENAI_MODEL;
  const previousPrefilter = process.env.OPENAI_PREFILTER_MODEL;
  process.env.OPENAI_MODEL = 'gpt-4.1-mini';
  delete process.env.OPENAI_PREFILTER_MODEL;

  const config = getAiConfig();
  assert.equal(config.model, 'gpt-5.4');
  assert.equal(config.prefilterModel, 'gpt-5-mini');

  if (previousModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = previousModel;
  if (previousPrefilter === undefined) delete process.env.OPENAI_PREFILTER_MODEL;
  else process.env.OPENAI_PREFILTER_MODEL = previousPrefilter;
});
