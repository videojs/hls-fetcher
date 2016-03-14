#!/usr/bin/env node

var path = require('path');
var mkdirp = require('mkdirp');
var fs = require('fs');
var pessimist = require('pessimist')
    .usage('Fetch and save the contents of an HLS playlist locally.\nUsage: $0 ')
    .alias('i', 'input')
    .demand('i')
    .describe('i', 'uri to m3u8 (required)')
    .alias('o', 'output')
    .describe('o', 'output path (default:\'./\')')
    .alias('c', 'concurrency')
    .default('c', 5)
    .describe('c', 'number of simultaneous fetches (default: 5)')
    .argv;
var getIt = require('../').getIt;

// Make output path
var output = path.join('./', path.basename(path.dirname(pessimist.i)));
if (pessimist.o) {
  path.resolve(pessimist.o);
}
try {
  fs.statSync(output);
  console.error('Error output dir already exists at:', output);
  process.exit(1);
} catch(e) {
  // does not exist there is no issue
}
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
