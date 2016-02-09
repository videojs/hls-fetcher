// Node modules
var path = require('path');
var mkdirp = require('mkdirp');
var fetch = require('fetch');
var Decrypter = require('./decrypter.js');
var fs = require('fs');

//downloads the first segment encountered that hasn't already been downloaded.
function download(rootUri, cwd, bandwidth) {
  var i,
    seg,
    filename;

  for (i = 0; i < this.segments.length; i++) {
    seg = this.segments[i];
    if (!seg.downloaded) {

      if (!seg.line.match(/^https?:\/\//i)) {
        seg.line = rootUri + '/' + seg.line;
      }
      seg.downloaded = true;
      filename = path.basename(seg.line);
      console.log('Start fetching', seg.line);
      if (seg.encrypted) {
        // Fetch the key
        fetch.fetchUrl(seg.keyURI, function (err, meta, keyBody) {
          var key_bytes;
          if (err) {
            return done(err);
          }
          // Convert it to an Uint32Array
          key_bytes = new Uint32Array([
            keyBody.readUInt32BE(0),
            keyBody.readUInt32BE(4),
            keyBody.readUInt32BE(8),
            keyBody.readUInt32BE(12)
          ]);
          // Fetch segment data

          fetch.fetchUrl(seg.line, function (err, meta, segmentBody) {
            if (err) {
              return done(err);
            }
            // Convert it to an Uint8Array
            var segmentData = new Uint8Array(segmentBody),
              decryptedSegment;

            // Use key, iv, and segment data to decrypt segment into Uint8Array
            decryptedSegment = new Decrypter(segmentData, key_bytes, seg.IV, function (err, data) {
              // Save Uint8Array to disk
              if (filename.match(/\?/)) {
                filename = filename.match(/^.+\..+\?/)[0];
                filename = filename.substring(0, filename.length - 1);
              }
              if (fs.existsSync(path.resolve(cwd, filename))) {
                filename = filename.split('.')[0] + duplicateFileCount + '.' + filename.split('.')[1];
                duplicateFileCount += 1;
              }
              cwd = cwd + '/' + bandwidth + '/';

              return fs.writeFile(path.resolve(cwd, filename), new Buffer(data), function () { console.log("Finished fetching")});
            });
          });
        });
      } else {
        return streamToDisk(seg, filename, cwd, bandwidth);
      }
      return;
    }
  }
}

function streamToDisk (resource, filename, cwd, bandwidth) {
  // Fetch it to CWD (streaming)

  var segmentStream = new fetch.FetchStream(resource.line),
    outputStream;

  //handle duplicate filenames & remove query parameters
  if (filename.match(/\?/)) {
    filename = filename.match(/^.+\..+\?/)[0];
    filename = filename.substring(0, filename.length - 1);
  }

  if (fs.existsSync(path.resolve(cwd, filename))) {
    filename = filename.split('.')[0] + duplicateFileCount + '.' + filename.split('.')[1];
    duplicateFileCount += 1;
  }
  if (!filename.match(/.+ts$/i)) {
    filename = "segment" + duplicateFileCount + ".ts";
    duplicateFileCount += 1;
  }
  cwd = cwd + '/' + bandwidth + '/';
  outputStream = fs.createWriteStream(path.resolve(cwd, filename));

  segmentStream.pipe(outputStream);

  segmentStream.on('error', function (err) {
    console.error('Fetching of url:', resource.line);
    //return done(err);
  });

  segmentStream.on('end', function () {
    console.log('Finished fetching', resource.line);
    //return done();
  });
}

module.exports = download;
