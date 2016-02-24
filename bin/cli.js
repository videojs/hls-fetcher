#!/usr/bin/env node

var path = require('path');
var mkdirp = require('mkdirp');
var pessimist = require('pessimist')
    .usage('Fetch and save the contents of an HLS playlist locally.\nUsage: $0 ')
    .alias('i', 'input')
    .demand('i')
    .describe('i', 'uri to m3u8 (required)')
    .alias('o', 'output')
    .default('o', './')
    .describe('o', 'output path (default:\'./\')')
    .alias('c', 'concurrency')
    .default('c', 5)
    .describe('c', 'number of simultaneous fetches (default: 5)')
    .argv;
var getIt = require('../').getIt;

// Make output path
var output = path.resolve(pessimist.o);
var startTime = Date.now();

mkdirp(output, function (err) {
  if (err) {
    console.error('Error while creating output path:', output);
    console.error(err);
    // Return a non-success exit code
    process.exit(1);
  }

  getIt({
      cwd: output,
      uri: pessimist.i,
      concurrency: pessimist.c
    },
    function allDone (err) {
      if (err) {
        console.error(err);
        // Return a non-success exit code
        process.exit(2);
      }

      var timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log('Operation completed successfully in', timeTaken, 'seconds.');
      process.exit(0);
    });
});
