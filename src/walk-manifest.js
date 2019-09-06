/* eslint-disable no-console */
const m3u8 = require('m3u8-parser');
const mpd = require('mpd-parser');
const request = require('requestretry');
const url = require('url');
const path = require('path');
const querystring = require('querystring');
const filenamify = require('filenamify');

// replace invalid http/fs characters with valid representations
const fsSanitize = function(filepath) {
  return path.normalize(filepath)
    // split on \, \\, or /
    .split(/\\\\|\\|\//)
    // max filepath is 255 on OSX/linux, and 260 on windows, 255 is fine for both
    // replace invalid characters with nothing
    .map((p) => filenamify(querystring.unescape(p), {replacement: '', maxLength: 255}))
    // join on OS specific path seperator
    .join(path.sep);
};

const joinURI = function(absolute, relative) {
  const parse = url.parse(absolute);

  parse.pathname = path.resolve(parse.pathname, relative);
  return url.format(parse);
};

const isAbsolute = function(uri) {
  const parsed = url.parse(uri);

  if (parsed.protocol) {
    return true;
  }
  return false;
};

const mediaGroupPlaylists = function(mediaGroups) {
  const playlists = [];

  ['AUDIO', 'VIDEO', 'CLOSED-CAPTIONS', 'SUBTITLES'].forEach(function(type) {
    const mediaGroupType = mediaGroups[type];

    if (mediaGroupType && !Object.keys(mediaGroupType).length) {
      return;
    }

    for (const group in mediaGroupType) {
      for (const item in mediaGroupType[group]) {
        const props = mediaGroupType[group][item];

        playlists.push(props);
      }
    }
  });
  return playlists;
};

const parseM3u8Manifest = function(content) {
  const parser = new m3u8.Parser();

  parser.push(content);
  parser.end();
  return parser.manifest;
};

const collectPlaylists = function(parsed) {
  return []
    .concat(parsed.playlists || [])
    .concat(mediaGroupPlaylists(parsed.mediaGroups || {}) || [])
    .reduce(function(acc, p) {
      acc.push(p);

      if (p.playlists) {
        acc = acc.concat(collectPlaylists(p));
      }
      return acc;
    }, []);
};

const parseMpdManifest = function(content, srcUrl) {
  const mpdPlaylists = mpd.toPlaylists(mpd.inheritAttributes(mpd.stringToMpdXml(content), {
    manifestUri: srcUrl
  }));

  const m3u8Result = mpd.toM3u8(mpdPlaylists);
  const m3u8Playlists = collectPlaylists(m3u8Result);

  m3u8Playlists.forEach(function(m) {
    const mpdPlaylist = m.attributes && mpdPlaylists.find(function(p) {
      return p.attributes.id === m.attributes.NAME;
    });

    if (mpdPlaylist) {
      m.dashattributes = mpdPlaylist.attributes;
    }
    // add sidx to segments
    if (m.sidx) {
      // fix init segment map if it has one
      if (m.sidx.map && !m.sidx.map.uri) {
        m.sidx.map.uri = m.sidx.map.resolvedUri;
      }

      m.segments.push(m.sidx);
    }
  });

  return m3u8Result;
};

const parseKey = function(requestOptions, basedir, decrypt, resources, manifest, parent) {
  return new Promise(function(resolve, reject) {

    if (!manifest.parsed.segments[0] || !manifest.parsed.segments[0].key) {
      return resolve({});
    }
    const key = manifest.parsed.segments[0].key;

    let keyUri = key.uri;

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
      key.file = path.join(key.file, path.basename(fsSanitize(key.uri)));

      manifest.content = Buffer.from(manifest.content.toString().replace(
        key.uri,
        path.relative(path.dirname(manifest.file), key.file)
      ));
      key.uri = keyUri;
      resources.push(key);
      return resolve(key);
    }

    requestOptions.url = keyUri;
    requestOptions.encoding = null;

    // get the aes key
    request(requestOptions)
      .then(function(response) {
        if (response.statusCode !== 200) {
          const keyError = new Error(response.statusCode + '|' + keyUri);

          console.error(keyError);
          return reject(keyError);
        }

        const keyContent = response.body;

        key.bytes = new Uint32Array([
          keyContent.readUInt32BE(0),
          keyContent.readUInt32BE(4),
          keyContent.readUInt32BE(8),
          keyContent.readUInt32BE(12)
        ]);

        // remove the key from the manifest
        manifest.content = Buffer.from(manifest.content.toString().replace(
          new RegExp('.*' + key.uri + '.*'),
          ''
        ));

        resolve(key);
      })
      .catch(function(err) {
        // TODO: do we even care about key errors; currently we just keep going and ignore them.
        const keyError = new Error(err.message + '|' + keyUri);

        console.error(keyError, err);
        reject(keyError);
      });
  });
};

const walkPlaylist = function(options) {
  return new Promise(function(resolve, reject) {

    const {
      decrypt,
      basedir,
      uri,
      parent = false,
      manifestIndex = 0,
      onError = function(err, errUri, resources, res, rej) {
        // Avoid adding the top level uri to nested errors
        if (err.message.includes('|')) {
          rej(err);
        } else {
          rej(new Error(err.message + '|' + errUri));
        }
      },
      visitedUrls = [],
      requestTimeout = 1500,
      requestRetryMaxAttempts = 5,
      dashPlaylist = null,
      requestRetryDelay = 5000
    } = options;

    let resources = [];
    const manifest = {parent};

    manifest.uri = uri;
    manifest.file = path.join(basedir, path.basename(fsSanitize(uri)));

    // if we are not the master playlist
    if (dashPlaylist && parent) {
      manifest.file = parent.file;
      manifest.uri = parent.uri;
    } else if (parent) {
      manifest.file = path.join(
        path.dirname(parent.file),
        'manifest' + manifestIndex,
        path.basename(fsSanitize(manifest.file))
      );
      // get the real uri of this playlist
      if (!isAbsolute(manifest.uri)) {
        manifest.uri = joinURI(path.dirname(parent.uri), manifest.uri);
      }
      // replace original uri in file with new file path
      parent.content = Buffer.from(parent.content.toString().replace(uri, path.relative(path.dirname(parent.file), manifest.file)));
    }

    if (!dashPlaylist && visitedUrls.includes(manifest.uri)) {
      console.error(`[WARN] Trying to visit the same uri again; skipping to avoid getting stuck in a cycle: ${manifest.uri}`);
      return resolve(resources);
    }

    let requestPromise;

    if (dashPlaylist) {
      requestPromise = Promise.resolve({statusCode: 200});
    } else {
      requestPromise = request({
        url: manifest.uri,
        timeout: requestTimeout,
        maxAttempts: requestRetryMaxAttempts,
        retryDelay: requestRetryDelay
      });
    }

    requestPromise.then(function(response) {
      if (response.statusCode !== 200) {
        const manifestError = new Error(response.statusCode + '|' + manifest.uri);

        manifestError.reponse = response;
        return onError(manifestError, manifest.uri, resources, resolve, reject);
      }
      // Only push manifest uris that get a non 200 and don't timeout
      let dash;

      if (!dashPlaylist) {
        resources.push(manifest);
        visitedUrls.push(manifest.uri);

        manifest.content = response.body;
        if ((/^application\/dash\+xml/i).test(response.headers['content-type']) || (/^\<\?xml/i).test(response.body)) {
          dash = true;
          manifest.parsed = parseMpdManifest(manifest.content, manifest.uri);
        } else {
          manifest.parsed = parseM3u8Manifest(manifest.content);
        }
      } else {
        dash = true;
        manifest.parsed = dashPlaylist;
      }

      manifest.parsed.segments = manifest.parsed.segments || [];
      manifest.parsed.playlists = manifest.parsed.playlists || [];
      manifest.parsed.mediaGroups = manifest.parsed.mediaGroups || {};

      const initSegments = [];

      manifest.parsed.segments.forEach(function(s) {
        if (s.map && s.map.uri && !initSegments.some((m) => s.map.uri === m.uri)) {
          manifest.parsed.segments.push(s.map);
          initSegments.push(s.map);
        }
      });

      const playlists = manifest.parsed.playlists.concat(mediaGroupPlaylists(manifest.parsed.mediaGroups));

      parseKey({
        time: requestTimeout,
        maxAttempts: requestRetryMaxAttempts,
        retryDelay: requestRetryDelay
      }, basedir, decrypt, resources, manifest, parent).then(function(key) {
        // SEGMENTS
        manifest.parsed.segments.forEach(function(s, i) {
          if (!s.uri) {
            return;
          }
          // put segments in manifest-name/segment-name.ts
          s.file = path.join(path.dirname(manifest.file), path.basename(fsSanitize(s.uri)));

          if (!isAbsolute(s.uri)) {
            s.uri = joinURI(path.dirname(manifest.uri), s.uri);
          }
          if (key) {
            s.key = key;
            s.key.iv = s.key.iv || new Uint32Array([0, 0, 0, manifest.parsed.mediaSequence, i]);
          }
          if (manifest.content) {
            manifest.content = Buffer.from(manifest.content.toString().replace(
              s.uri,
              path.relative(path.dirname(manifest.file), s.file)
            ));
          }
          resources.push(s);
        });

        // SUB Playlists
        const subs = playlists.map(function(p, z) {
          if (!p.uri && !dash) {
            return Promise.resolve(resources);
          }
          return walkPlaylist({
            dashPlaylist: dash ? p : null,
            decrypt,
            basedir,
            uri: p.uri,
            parent: manifest,
            manifestIndex: z,
            onError,
            visitedUrls,
            requestTimeout,
            requestRetryMaxAttempts,
            requestRetryDelay
          });
        });

        Promise.all(subs).then(function(r) {
          const flatten = [].concat.apply([], r);

          resources = resources.concat(flatten);
          resolve(resources);
        }).catch(function(err) {
          onError(err, manifest.uri, resources, resolve, reject);
        });
      });
    })
      .catch(function(err) {
        onError(err, manifest.uri, resources, resolve, reject);
      });
  });
};

module.exports = walkPlaylist;
