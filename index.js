var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var fetch = require('fetch');
var parseManifest = require('./parse.js');

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

function getIt (cwd, uri) {
  var playlistFilename = path.basename(uri);

  // Fetch playlist
  fetch.fetchUrl('uri', function getPlaylist (err, meta, body) {
    if (err) {
      // TODO: Error handling? reporting?
      return;
    }

    //   Parse playlist
    var manifest = parseManifest(uri, body);

    // Save manifest
    fs.writeSync(path.resolve(cwd, playlistFilename), manifest.localManifest);

    //   For each resource in manifest.resources
    manifest.resources.forEach(function (resource) {
      if (resource.type === 'segment') {
        var filename = path.basename(resource.uri);

        // Fetch it to CWD (streaming)
        var segmentStream = new fetch.FetchStream(resource.uri);
        var outputStream = fs.createWriteStream(path.resolve(cwd, filename));

        segmentStream.pipe(outputStream);
        // TODO: Error handling? reporting?
      } else {
        // Create subCWD from URI
        var subCWD = getCWDName(uri, resource.uri);
        // If subCWD does not exist, make subCWD (mkdirp)
        mkdirp(path.resolve(subCWD), function (err) {
            if (err) {
              // TODO: Error handling? reporting?
              return;
            }

            // Call `getIt` with subCWD and resource uri
            getIt(subCWD, resource.uri);
        });
      }
    });
  });
}
