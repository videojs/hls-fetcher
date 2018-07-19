#!/usr/bin/env node
/* eslint-disable no-console */

const path = require('path');
const start = require('./index');
const pessimist = require('pessimist')
  .usage('Fetch and save the contents of an HLS playlist locally.\nUsage: $0 ')
  .alias('i', 'input')
  .demand('i')
  .describe('i', 'uri to m3u8 (required)')
  .alias('o', 'output')
  .default('o', './hls-fetcher')
  .describe('o', "output path (default:'./hls-fetcher')")
  .alias('c', 'concurrency')
  .default('c', Infinity)
  .describe('c', 'number of simultaneous fetches (default: Infinity)')
  .alias('d', 'decrypt')
  .default('d', false)
  .describe('d', 'decrypt and remove enryption from manifest (default: false)')
  .argv;

// Make output path
const output = path.resolve(pessimist.o);
const startTime = Date.now();
const options = {
  input: pessimist.i,
  output,
  concurrency: pessimist.c,
  decrypt: pessimist.d
};

start(options).then(function() {
  const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('Operation completed successfully in', timeTaken, 'seconds.');
  process.exit(0);
}).catch(function(error) {
  console.error('ERROR', error);
  process.exit(1);
});
