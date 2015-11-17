var path = require('path');
var URL = require('url');

function parseResource (tagLine, resourceLine, manifestUri) {
  var resource = {
    type: 'unknown',
    line: resourceLine,
  };

  if(tagLine.match(/^#EXTINF/i)) {
    resource.type = 'segment';
  } else if (tagLine.match(/^#EXT-X-STREAM-INF/i)) {
    resource.type = 'playlist';
  }

  // make our uri absolute if we need to
  if (!resourceLine.match(/^https?:\/\//i)) {
    resource.line = manifestUri + '/' + resource.line;
  }

  return resource;
}

function parseManifest (manifestUri, manifestData) {
  var manifestLines = [];
  var rootUri = path.dirname(manifestUri);

  // Split into lines
  var lines = manifestData.split('\n');

  // determine resources, and store all lines
  for(var i = 0; i < lines.length; i++) {
    var currentLine = lines[i];
    manifestLines.push({type: 'tag', line: currentLine});
    if(currentLine.match(/^#EXTINF/) || currentLine.match(/^#EXT-X-STREAM-INF/)) {
      i++;
      if (i < lines.length) {
        manifestLines.push(parseResource(currentLine, lines[i], rootUri));
      }
    }
  }

  return manifestLines;
}

module.exports = parseManifest;
