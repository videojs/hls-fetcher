var url = require('url');
var path = require('path');
var fs = require('fs');

var Utils = {
  joinUri: function(absolute, relative) {
    var parse = url.parse(absolute);
    parse.pathname = path.join(parse.pathname, relative);
    return url.format(parse);
  },
  getUriPath: function(uri, base) {
    base = base || '';
    var parse = url.parse(uri);
    return path.relative('.', path.join(base, parse.pathname));
  },
  isAbsolute: function(uri) {
    var parsed = url.parse(uri);
    if (parsed.protocol) {
      return true;
    }
    return false;
  },
  fileExists: function(file) {
    try {
      return fs.statSync(file).isFile();
    } catch(e) {
      return false;
    }
  },
  localize: function(parentUri, childUri) {
    return path.join(path.basename(parentUri, path.extname(parentUri)), path.basename(childUri));
  }

};

module.exports = Utils;
