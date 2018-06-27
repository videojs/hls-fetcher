var m3u8 = require('m3u8-parser');
var request = require('requestretry');
var async = require('async');
var url = require('url');
var path = require('path');
var fs = require('fs');

// replace invalid http/fs characters with valid representations
var fsSanitize = function(filepath) {
  return filepath
    .replace(/\?/g, '-questionmark-');
};

var joinURI = function(absolute, relative) {
  var parse = url.parse(absolute);
  parse.pathname = path.join(parse.pathname, relative);
  return url.format(parse);
};

var isAbsolute = function(uri) {
  var parsed = url.parse(uri);
  if (parsed.protocol) {
    return true;
  }
  return false;
};

var mediaGroupPlaylists = function(mediaGroups) {
  var playlists = [];
  ['AUDIO', 'VIDEO', 'CLOSED-CAPTIONS', 'SUBTITLES'].forEach(function(type) {
    var mediaGroupType = mediaGroups[type];
    if (mediaGroupType && !Object.keys(mediaGroupType).length) {
      return;
    }

    for (var group in mediaGroupType) {
      for (var item in mediaGroupType[group]) {
        var props = mediaGroupType[group][item];
        playlists.push(props);
      }
    }
  });
  return playlists;
};

var parseManifest = function(content) {
  var parser = new m3u8.Parser();
  parser.push(content);
  parser.end();
  return parser.manifest;
};

var parseKey = function(requestOptions, basedir, decrypt, resources, manifest, parent, callback) {
  if (!manifest.parsed.segments[0] || !manifest.parsed.segments[0].key) {
    return callback(null, {});
  }
  var key = manifest.parsed.segments[0].key;

  var keyUri = key.uri;
  if (!isAbsolute(keyUri)) {
    keyUri = joinURI(path.dirname(manifest.uri), keyUri);
  }

  // if we are not decrypting then we just download the key
  if (!decrypt) {
    // put keys in parent-dir/key-name.key
    key.file = basedir;
    if (parent) {
      key.file = path.dirname(parent.file);
    }
    key.file = path.join(key.file, fsSanitize(path.basename(key.uri)));

    manifest.content = new Buffer(manifest.content.toString().replace(
      key.uri,
      path.relative(path.dirname(manifest.file), key.file)
    ));
    key.uri = keyUri;
    resources.push(key);
    return callback(null, key);
  }

  requestOptions.url = keyUri;
  requestOptions.encoding = null;

  // get the aes key
  request(requestOptions, function(error, response, keyContent) {
    // TODO: do we even care about key errors; currently we just keep going and ignore them.
    if (error) {
      const keyError = new Error(error.message + '|' + keyUri);
      console.error(keyError, error);
      return callback(keyError);
    }
    if (response.statusCode !== 200) {
      const keyError = new Error(response.statusCode + '|' + keyUri);
      console.error(keyError);
      return callback(keyError);
    }

    key.bytes = new Uint32Array([
      keyContent.readUInt32BE(0),
      keyContent.readUInt32BE(4),
      keyContent.readUInt32BE(8),
      keyContent.readUInt32BE(12)
    ]);

    // remove the key from the manifest
    manifest.content = new Buffer(manifest.content.toString().replace(
      new RegExp('.*' + key.uri + '.*'),
      ''
    ));


    return callback(null, key);
  });
};

var walkPlaylist = function(options, callback) {
  var {
    decrypt,
    basedir,
    uri,
    parent = false,
    manifestIndex = 0,
    onError = function(err, uri, resources, callback) {
      // Avoid adding the top level uri to nested errors
      if (err.message.includes('|')) {
        return callback(err);
      } else {
        var errWithUri = new Error(err.message + '|' + uri);
        return callback(errWithUri);
      }
    },
    visitedUrls = [],
    requestTimeout = 1500,
    requestRetryMaxAttempts = 5,
    requestRetryDelay = 5000
  } = options;

  var resources = [];
  var manifest = {};
  manifest.uri = uri;
  manifest.file = path.join(basedir, fsSanitize(path.basename(uri)));

  // if we are not the master playlist
  if (parent) {
    manifest.file = path.join(
      path.dirname(parent.file),
      'manifest' + manifestIndex,
      fsSanitize(path.basename(manifest.file))
    );
    // get the real uri of this playlist
    if (!isAbsolute(manifest.uri)) {
      manifest.uri = joinURI(path.dirname(parent.uri), manifest.uri);
    }
    // replace original uri in file with new file path
    parent.content = new Buffer(parent.content.toString().replace(uri, path.relative(path.dirname(parent.file), manifest.file)));
  }

  if (visitedUrls.includes(manifest.uri)) {
    var manifestError = new Error('Trying to visit the same uri again; stuck in a cycle');
    return onError(manifestError, manifest.uri, resources, callback);
  }

  request({
    url: manifest.uri,
    timeout: requestTimeout,
    maxAttempts: requestRetryMaxAttempts,
    retryDelay: requestRetryDelay
  }, function(error, response, body) {
    if (error) {
      return onError(error, manifest.uri, resources, callback);
    }
    if (response.statusCode !== 200) {
      var manifestError = new Error(response.statusCode + '|' + manifest.uri);
      manifestError.reponse = response;
      return onError(manifestError, manifest.uri, resources, callback);
    }
    // Only push manifest uris that get a non 200 and don't timeout
    resources.push(manifest);
    visitedUrls.push(manifest.uri);

    manifest.content = body;

    manifest.parsed = parseManifest(manifest.content);
    manifest.parsed.segments = manifest.parsed.segments || [];
    manifest.parsed.playlists = manifest.parsed.playlists || [];
    manifest.parsed.mediaGroups = manifest.parsed.mediaGroups || {};

    var playlists = manifest.parsed.playlists.concat(mediaGroupPlaylists(manifest.parsed.mediaGroups));
    parseKey({
      time: requestTimeout,
      maxAttempts: requestRetryMaxAttempts,
      retryDelay: requestRetryDelay
    }, basedir, decrypt, resources, manifest, parent, function(err, key) {
      // SEGMENTS
      manifest.parsed.segments.forEach(function(s, i) {
        if (!s.uri) {
          return;
        }
        // put segments in manifest-name/segment-name.ts
        s.file = path.join(path.dirname(manifest.file), fsSanitize(path.basename(s.uri)));
        if (!isAbsolute(s.uri)) {
          s.uri = joinURI(path.dirname(manifest.uri), s.uri);
        }
        if (key) {
          s.key = key;
          s.key.iv = s.key.iv || new Uint32Array([0, 0, 0, manifest.parsed.mediaSequence, i]);
        }
        manifest.content = new Buffer(manifest.content.toString().replace(
          s.uri,
          path.relative(path.dirname(manifest.file), s.file)
        ));
        resources.push(s);
      });

      // SUB Playlists
      // The reflect is used so we can still continue running even if one of the playlists is broken.
      async.map(playlists, function(p, cb) {
        if (!p.uri) {
          return cb(null, []);
        }
        walkPlaylist({
          decrypt,
          basedir,
          uri: p.uri,
          parent: manifest,
          manifestIndex: playlists.indexOf(p),
          onError,
          visitedUrls,
          requestTimeout,
          requestRetryMaxAttempts,
          requestRetryDelay
        }, cb);
      }, function(err, results) {
        var flattenedResource = [].concat.apply([], results);
        resources = resources.concat(flattenedResource);
        if (err) {
          return onError(err, manifest.uri, resources, callback);
        } else {
          return callback(null, resources);
        }
      });
    });
  });
};

module.exports = walkPlaylist;
