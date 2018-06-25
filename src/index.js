var WalkManifest = require('./walk-manifest');
var WriteData = require('./write-data');

var main = function(options, callback) {
  console.log("Gathering Manifest data...");
  WalkManifest(options.decrypt, options.output, options.input, function(err, resources) {
    console.log("Downloading additional data...");
    WriteData(options.decrypt, options.concurrency, resources, callback);
  });
};

module.exports = main;
module.exports.WalkManifest = WalkManifest;
