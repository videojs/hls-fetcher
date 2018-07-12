var WalkManifest = require('./walk-manifest');
var WriteData = require('./write-data');

var main = function(options) {
  console.log("Gathering Manifest data...");
  var options = {decrypt: options.decrypt, basedir: options.output, uri: options.input};
  return WalkManifest(options)
    .then(function(resources) {
      console.log("Downloading additional data...");
      return WriteData(options.decrypt, options.concurrency, resources);
    })
};

module.exports = main;
module.exports.WalkManifest = WalkManifest;
