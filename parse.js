var path = require('path');
var URL = require('url');

function parseEncryption(tagLine, manifestUri) {
  var IV;
  var keyURI;

  if (tagLine.match(/^#EXT-X-KEY/i) && tagLine.match(/AES/)) {
    var encryptionInfo = tagLine.split(',');
    keyURI = encryptionInfo[1];
    keyURI = keyURI.substring(5, keyURI.length - 1);
    if (!keyURI.match(/^https?:\/\//i)) {
      keyURI = manifestUri + '/' + keyURI;
    }
    if (encryptionInfo.length > 2) {
      //we have an IV
      IV = encryptionInfo[2]
      IV = IV.substring(3, IV.length);
    }

    return {
      IV: IV,
      keyURI: keyURI
    };
  }
}

function parseResource (tagLine, resourceLine, manifestUri, mediaSequence, encryptionSettings) {
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

  if (encryptionSettings) {
    resource.encrypted = true;
    resource.keyURI = encryptionSettings.keyURI;
    resource.IV = encryptionSettings.IV;
  }

  var usingHex = false;
  if (resource.IV) {
    resource.IV = resource.IV.substring(2);
    resource.IV = resource.IV.match(/.{8}/g);
    resource.IV = new Uint32Array([
      parseInt(resource.IV[0], 16),
      parseInt(resource.IV[1], 16),
      parseInt(resource.IV[2], 16),
      parseInt(resource.IV[3], 16)
    ]);
  } else {
    resource.IV = new Uint32Array([0, 0, 0, mediaSequence]);
  }

  // make our uri absolute if we need to
  if (!resourceLine.match(/^https?:\/\//i)) {
    resource.line = manifestUri + '/' + resource.line;
  }
  return resource;
}

function parseManifest (manifestUri, manifestData) {
  var mediaSequence = 0;
  var manifestLines = [];
  var rootUri = path.dirname(manifestUri);
  var encryptionSettings;

  // Split into lines
  var lines = manifestData.split('\n');

  // determine resources, and store all lines
  for(var i = 0; i < lines.length; i++) {
    var currentLine = lines[i];
    manifestLines.push({type: 'tag', line: currentLine});
    if (currentLine.match(/^#EXT-X-KEY/i)) {
      encryptionSettings = parseEncryption(currentLine, manifestUri);
    } else if(currentLine.match(/^#EXT-X-MEDIA-SEQUENCE/i)) {
      mediaSequence = parseFloat(currentLine.split(':')[1]);
    } else if(currentLine.match(/^#EXTINF/) || currentLine.match(/^#EXT-X-STREAM-INF/)) {
      i++;
      if (i < lines.length) {
        manifestLines.push(parseResource(currentLine, lines[i], rootUri, mediaSequence++, encryptionSettings));
      }
    }
  }

  return manifestLines;
}

module.exports = {parseManifest:parseManifest, parseResource:parseResource, parseEncryption:parseEncryption};
