#!/usr/bin/env node
var path = require('path');
var start = require('./index');
var pessimist = require('pessimist')
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
var output = path.resolve(pessimist.o);
var startTime = Date.now();
var options = {
  input: pessimist.i,
  output: output,
  concurrency: pessimist.c,
  decrypt: pessimist.d
};

start(options, function(err) {
  if(err) {
    console.error('ERROR', err);
    process.exit(1);
  } else {
    var timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('Operation completed successfully in', timeTaken, 'seconds.');
    process.exit(0);
  }
});
