var path = require('path');
var URL = require('url');
var IV;
var keyURI;
var begunEncryption = false;
var sequenceNumber = -1;
var useSequence = false;

function parseEncryption(tagLine, manifestUri) {

  if (tagLine.match(/^#EXT-X-KEY/i) && tagLine.match(/AES/)) {
    var encryptionInfo = tagLine.split(',');
    begunEncryption = true;
    keyURI = encryptionInfo[1];
    keyURI = keyURI.substring(5, keyURI.length - 1);
    if (encryptionInfo.length > 2) {
      //we have an IV
      IV = encryptionInfo[2]
      IV = IV.substring(3, IV.length - 1);
    } else {
      //use the media sequence number
      useSequence = true;
    }

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
    sequenceNumber += 1;
  } else if (tagLine.match(/^#EXT-X-STREAM-INF/i)) {
    resource.type = 'playlist';
  }

  if (begunEncryption) {
    resource.encrypted = true;
    resource.keyURI = keyURI;
    if (useSequence) {
      resource.IV = sequenceNumber.toString();
    } else {
      resource.IV = IV;
    }
    // make our uri absolute if we need to
    if (!resource.keyURI.match(/^https?:\/\//i)) {
      resource.keyURI = manifestUri + '/' + resource.keyURI;
    }
  }
  var usingHex = false;
  if (resource.IV) {
    if (resource.IV.substring(0,2) === '0x') {
      resource.IV = resource.IV.substring(2);
      usingHex = true;
    }
    if (usingHex) {
      resource.IV = resource.IV.match(/.{8}/g);
      resource.IV[0] = parseInt(resource.IV[0], 16);
      resource.IV[1] = parseInt(resource.IV[1], 16);
      resource.IV[2] = parseInt(resource.IV[2], 16);
      resource.IV[3] = parseInt(resource.IV[3], 16);

    } else {
      var tempIV = resource.IV;
      resource.IV = [];
      resource.IV[0] = 0;
      resource.IV[1] = 0;
      resource.IV[2] = 0;
      resource.IV[3] = parseInt(tempIV, 10);
    }
    resource.IV = new Uint32Array(resource.IV);

  }

  // make our uri absolute if we need to
  if (!resourceLine.match(/^https?:\/\//i)) {
    resource.line = manifestUri + '/' + resource.line;
  }
  return resource;
}

function parseManifest (manifestUri, manifestData) {
  sequenceNumber = -1;
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

    else if(currentLine.match(/^#EXT-X-MEDIA-SEQUENCE/i)) {
      sequenceNumber = parseInt(currentLine.split(':')[1]);
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

module.exports = {parseManifest:parseManifest, parseResource:parseResource, parseEncryption:parseEncryption};
