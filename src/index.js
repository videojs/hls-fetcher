var WalkManifest = require('./walk-manifest');
var WriteData = require('./write-data');

var main = function(options) {
  console.log("Gathering Manifest data...");
  var resources = WalkManifest(options.decrypt, options.output, options.input);

  return WriteData(options.decrypt, options.concurrency, resources);
};

module.exports = main;
