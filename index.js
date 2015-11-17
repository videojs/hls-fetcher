var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var fetch = require('fetch');
var parseManifest = require('./parse.js');
var async = require('async');

var CONCURRENT_FETCH_LIMIT = 5;

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

function getIt (cwd, uri, done) {
  var playlistFilename = path.basename(uri);

  // Fetch playlist
  fetch.fetchUrl(uri, function getPlaylist (err, meta, body) {
    if (err) {
      // TODO: Error handling? reporting?
      return done(err);
    }

    // Parse playlist
    var manifest = parseManifest(uri, body.toString());

    // Save manifest
    fs.writeFileSync(path.resolve(cwd, playlistFilename), createManifestText(manifest, uri));

    var segments = manifest.filter(function (resource) {
      return resource.type === 'segment';
    });
    var playlists = manifest.filter(function (resource) {
      return resource.type === 'playlist';
    });

    async.series([
      function fetchSegments (next) {
        async.eachLimit(segments, CONCURRENT_FETCH_LIMIT, function (resource, done) {
          var filename = path.basename(resource.line);

          console.log('Start fetching', resource.line);

          // Fetch it to CWD (streaming)
          var segmentStream = new fetch.FetchStream(resource.line);
          var outputStream = fs.createWriteStream(path.resolve(cwd, filename));

          segmentStream.pipe(outputStream);
          segmentStream.on('error', function (err) {
            console.log('Fetching of', resource.line, 'failed with error:', err);
            return done(err);
          });
          segmentStream.on('end', function () {
            console.log('Finished fetching', resource.line);
            return done();
          });
        }, next);
      },
      function fetchPlaylists (next) {
        async.eachSeries(playlists, function (resource, done) {
          // Create subCWD from URI
          var subCWD = getCWDName(uri, resource.line);
          // If subCWD does not exist, make subCWD (mkdirp)
          mkdirp(path.resolve(subCWD), function (err) {
              if (err) {
                // TODO: Error handling? reporting?
                return done(err);
              }

              // Call `getIt` with subCWD and resource uri
              getIt(subCWD, resource.line, done);
          });
        }, next);
      }
    ], done);
  });
}

module.exports = getIt;
