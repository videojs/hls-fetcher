var m3u8 = require('m3u8-parser');
var request = require('request');
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

var parseKey = function(basedir, decrypt, resources, manifest, parent, callback) {
  if (!manifest.parsed.segments[0] || !manifest.parsed.segments[0].key) {
    return callback({});
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
    return callback(key);
  }

  // get the aes key
  request({url: keyUri, encoding: null, timeout: 1500}, function(error, response, body) {
    if (error) {
      console.error('Failed to get key', error, keyUri);
      return callback({});
    }
    if (response.statusCode !== 200) {
      console.error('Failed to get key', response.statusCode, keyUri);
      return callback({});
    }

    var keyContent = body;
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


    return callback(key);
  });
};

var walkPlaylist = function(decrypt, basedir, uri, parent, manifestIndex, callback) {

  // Default parameters
  if (!callback) {
    callback = parent;
    parent = false;
    manifestIndex = 0;
  }

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

  request({url: manifest.uri, timeout: 1500}, function(error, response, body) {
    if (error) {
      console.error('Failed to get key', error, manifest.uri);
      return callback(null, resources);
    }
    if (response.statusCode !== 200) {
      console.error('Failed to get key', response.statusCode, manifest.uri);
      return callback(null, resources);
    }
    // Only push manifest uris that get a non 200 and don't timeout
    resources.push(manifest);

    manifest.content = body;

    manifest.parsed = parseManifest(manifest.content);
    manifest.parsed.segments = manifest.parsed.segments || [];
    manifest.parsed.playlists = manifest.parsed.playlists || [];
    manifest.parsed.mediaGroups = manifest.parsed.mediaGroups || {};

    var playlists = manifest.parsed.playlists.concat(mediaGroupPlaylists(manifest.parsed.mediaGroups));
    parseKey(basedir, decrypt, resources, manifest, parent, function(key) {
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
      async.map(playlists, function(p, cb) {
        if (!p.uri) {
          return cb(null);
        }
        walkPlaylist(decrypt, basedir, p.uri, manifest, playlists.indexOf(p), cb);
      }, function(err, results) {
        var flattened = [].concat.apply([], results);
        resources = resources.concat(flattened);
        callback(null, resources);
      });
    });
  });

};

module.exports = walkPlaylist;