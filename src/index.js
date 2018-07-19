/* eslint-disable no-console */
const WalkManifest = require('./walk-manifest');
const WriteData = require('./write-data');

const main = function(options) {
  console.log('Gathering Manifest data...');
  const settings = {decrypt: options.decrypt, basedir: options.output, uri: options.input};

  return WalkManifest(settings)
    .then(function(resources) {
      console.log('Downloading additional data...');
      return WriteData(options.decrypt, options.concurrency, resources);
    });
};

module.exports = main;
module.exports.WalkManifest = WalkManifest;
