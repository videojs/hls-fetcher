var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var fetch = require('fetch');
var parse = require('./parse.js');
var Decrypter = require('./decrypter.js');
var async = require('async');
var fileIndex = 1;

var DEFAULT_CONCURRENCY = 5;
var duplicateFileCount = 0;
var DEFAULT_TIMEOUT = 180000;

function getCWDName (parentUri, localUri) {
  // Do I need to use node's URL object?
  var parentPaths = path.dirname(parentUri).split('/');
  var localPaths = path.dirname(localUri).split('/');

  var lookFor = parentPaths.pop();
  var i = localPaths.length;

  while (i--) {
    if (localPaths[i] === lookFor) {
      break;
    }
  }

  // No unique path-part found, use filename
  if (i === localPaths.length - 1) {
    return path.basename(localUri, path.extname(localUri));
  }

  return localPaths.slice(i + 1).join('_');
}

function createManifestText (manifest, rootUri) {
  return manifest.map(function (line) {
    if (line.type === 'playlist') {
      var subCWD = getCWDName(rootUri, line.line);
      return subCWD + '/' + path.basename(line.line);
    } else if (line.type === 'segment') {
      return path.basename(line.line);
    }
    return line.line;
  }).join('\n');
}

function getIt (options, done) {
  var uri = options.uri;
  var cwd = options.cwd;
  var concurrency = options.concurrency || DEFAULT_CONCURRENCY;
  var playlistFilename = path.basename(uri);

  // Fetch playlist
  fetch.fetchUrl(uri, {timeout: DEFAULT_TIMEOUT}, function getPlaylist (err, meta, body) {
    if (err) {
      console.error('Error fetching url:', uri);
      return done(err);
    }

    // Parse playlist
    var manifest = parse.parseManifest(uri, body.toString());

    // Save manifest
    if (playlistFilename.match(/\?/)) {
      playlistFilename = playlistFilename.match(/^.+\..+\?/)[0];
      playlistFilename = playlistFilename.substring(0, playlistFilename.length - 1);
    }
    if (!playlistFilename.match(/.+m3u8$/i)) {
      playlistFilename = "playlist" +  ".m3u8";
    }

    fs.writeFileSync(path.resolve(cwd, playlistFilename), createManifestText(manifest, uri));

    var segments = manifest.filter(function (resource) {
      return resource.type === 'segment';
    });
    var playlists = manifest.filter(function (resource) {
      return resource.type === 'playlist';
    });

    async.series([
      function fetchSegments (next) {
        async.eachLimit(segments, concurrency, function (resource, done) {
          var filename = path.basename(resource.line);
          if (resource.encrypted) {
            return fetchAndDecryptedSegment(resource, filename, cwd, done);
          } else {
            return streamToDisk(resource, filename, cwd, done);
          }
        }, next);
      },
      function fetchPlaylists (next) {
        async.eachSeries(playlists, function (resource, done) {
          // Create subCWD from URI
          var subCWD = getCWDName(uri, resource.line);
          var subDir = path.resolve(cwd, subCWD);

          // If subCWD does not exist, make subCWD (mkdirp)
          mkdirp(subDir, function (err) {
            if (err) {
              console.error('Error creating output path:', subDir);
              return done(err);
            }

            // Call `getIt` with subCWD and resource uri
            getIt({
              cwd: subDir,
              uri: resource.line,
              concurrency: concurrency
              },
              done);
          });
        }, next);
      }
    ], done);
  });
}

function streamToDisk (resource, filename, cwd, done) {
  console.log('Streaming', resource.line, 'to disk.');
  // Fetch it to CWD (streaming)
  var segmentStream = new fetch.FetchStream(resource.line);
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

  var outputStream = fs.createWriteStream(path.resolve(cwd, filename));

  segmentStream.pipe(outputStream);

  segmentStream.on('error', function (err) {
    console.error('Fetching of url:', resource.line);
    return done(err);
  });

  segmentStream.on('end', function () {
    console.log('Finished fetching', resource.line);
    return done();
  });
}

function fetchAndDecryptedSegment (resource, filename, cwd, done) {
  // Fetch the key
  fetch.fetchUrl(resource.keyURI, {timeout: DEFAULT_TIMEOUT}, function (err, meta, keyBody) {
    if (err) {
      return done(err);
    }
    // Convert it to an Uint32Array
    var key_bytes = new Uint32Array([
      keyBody.readUInt32BE(0),
      keyBody.readUInt32BE(4),
      keyBody.readUInt32BE(8),
      keyBody.readUInt32BE(12)
    ]);

    console.log('Decrypting', resource.line, 'with key', keyBody, 'and IV', [resource.IV[0], resource.IV[1], resource.IV[2], resource.IV[3]]);

    // Fetch segment data
    fetch.fetchUrl(resource.line, {timeout: DEFAULT_TIMEOUT},function (err, meta, segmentBody) {
      if (err) {
        return done(err);
      }
      // Convert it to an Uint8Array
      var segmentData = new Uint8Array(segmentBody);

      // Use key, iv, and segment data to decrypt segment into Uint8Array
      var decryptedSegment = new Decrypter(segmentData, key_bytes, resource.IV, function (err, data) {
        // Save Uint8Array to disk

        if (filename.match(/\?/)) {
          filename = filename.match(/^.+\..+\?/)[0];
          filename = filename.substring(0, filename.length - 1);
        }
        if(fs.existsSync(path.resolve(cwd, filename))) {
          filename = filename.split('.')[0] + duplicateFileCount + '.' + filename.split('.')[1];
          duplicateFileCount += 1;
        }
        return fs.writeFile(path.resolve(cwd, filename), new Buffer(data), done);
      });
    });
  });
}

module.exports = {getIt:getIt, getCWDName:getCWDName, createManifestText:createManifestText};
