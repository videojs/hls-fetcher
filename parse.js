var path = require('path');
var URL = require('url');
var IV;
var keyURI;
var begunEncryption = false;

function parseEncryption(tagLine, manifestUri) {

  if (tagLine.match(/^#EXT-X-KEY/i) && tagLine.match(/AES/)) {
    begunEncryption = true;
    keyURI = tagLine.split(',')[1];
    keyURI = keyURI.substring(5, keyURI.length - 1);
    IV = tagLine.split(',')[2]
    IV = IV.substring(3, IV.length - 1);
  }
}

function parseResource (tagLine, resourceLine, manifestUri) {
  var resource = {
    type: 'unknown',
    line: resourceLine,
    encrypted: false,
    keyURI: 'unknown',
    IV: 0
  };

  if(tagLine.match(/^#EXTINF/i)) {
    resource.type = 'segment';
  } else if (tagLine.match(/^#EXT-X-STREAM-INF/i)) {
    resource.type = 'playlist';
  }

  if (begunEncryption) {
    resource.encrypted = true;
    resource.keyURI = keyURI;
    resource.IV = IV;
    // make our uri absolute if we need to
    if (!resource.keyURI.match(/^https?:\/\//i)) {
      resource.keyURI = manifestUri + '/' + resource.keyURI;
    }
  }
  if (resource.IV) {
    if (resource.IV.substring(0,2) === '0x') {
      resource.IV = resource.IV.substring(2);
    }

    resource.IV = resource.IV.match(/.{8}/g);
    resource.IV[0] = parseInt(resource.IV[0], 16);
    resource.IV[1] = parseInt(resource.IV[1], 16);
    resource.IV[2] = parseInt(resource.IV[2], 16);
    resource.IV[3] = parseInt(resource.IV[3], 16);
    resource.IV = new Uint32Array(resource.IV);
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
    if (currentLine.match(/^#EXT-X-KEY/i)) {
      parseEncryption(currentLine, rootUri);
    }
    else if(currentLine.match(/^#EXTINF/) || currentLine.match(/^#EXT-X-STREAM-INF/)) {
      i++;
      if (i < lines.length) {
        manifestLines.push(parseResource(currentLine, lines[i], rootUri));
      }
    }
  }

  return manifestLines;
}

module.exports = parseManifest;
