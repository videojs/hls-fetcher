var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var fetch = require('fetch');
var parseManifest = require('./parse.js');
var async = require('async');

var DEFAULT_CONCURRENCY = 5;

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
  fetch.fetchUrl(uri, function getPlaylist (err, meta, body) {
    if (err) {
      console.error('Error fetching url:', uri);
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
        async.eachLimit(segments, concurrency, function (resource, done) {
          var trimmedUri = resource.line.slice(0, resource.line.lastIndexOf('.ts') + 3);
          var filename = path.basename(trimmedUri);

          console.log('Start fetching', resource.line);

          // Fetch it to CWD (streaming)
          var segmentStream = new fetch.FetchStream(resource.line);
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

module.exports = getIt;
