const url = require('url');
const path = require('path');
const fs = require('fs');

const Utils = {
  joinUri(absolute, relative) {
    const parse = url.parse(absolute);

    parse.pathname = path.join(parse.pathname, relative);
    return url.format(parse);
  },
  getUriPath(uri, base) {
    base = base || '';
    const parse = url.parse(uri);

    return path.relative('.', path.join(base, parse.pathname));
  },
  isAbsolute(uri) {
    const parsed = url.parse(uri);

    if (parsed.protocol) {
      return true;
    }
    return false;
  },
  fileExists(file) {
    try {
      return fs.statSync(file).isFile();
    } catch (e) {
      return false;
    }
  },
  localize(parentUri, childUri) {
    return path.join(path.basename(parentUri, path.extname(parentUri)), path.basename(childUri));
  }

};

module.exports = Utils;
