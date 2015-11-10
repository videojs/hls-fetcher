var fetch = require('fetch');

function parseResource (tagLine, resourceLine, localManifest, manifestObj) {
  // if tagLine starts with #EXTINF
  //     create an object with a resource type of 'segment' and an absolute URI
  // else if tagLine starts with #EXT-X-STREAM-INF
  //     create an object with a resource type of 'manifest' and an absolute URI

  // push localized URI to localManifest
}

function parsePlaylist (playlist) {
  var localManifest = [];
  var resources = [];

  // Split into lines
  // For each line
  //   push to localManifest
  //   if starts with #EXTINF or #EXT-X-STREAM-INF
  //     call parseResource with both lines and object

  /* OUTPUT:
    {
      localManifest: <string with purely cwd-relative uris>,
      resources: [
        {
          uri: <absolute uri>,
          type: {'segment' | 'manifest'}
        }
      ]
    }
  */ 
  return {
    localManifest: localManifest.join('\n'),
    resources: resources
  };
}

function getCWDName (parentUri, localUri) {
  // parent: http://foo.bar/baz/index.m3u8
  // local: http://foo.bar/baz/sub.m3u8
  // return 'sub'

  // parent: http://foo.bar/baz/index.m3u8
  // local: http://foo.bar/baz/quux/sub.m3u8
  // return 'quux'
}

function getIt (cwd, uri) {
  //   Fetch playlist
  //   Parse playlist

  //   For each resource in manifest.resources
  //     If resource.type is 'segment'
  //       Fetch it to CWD (streaming)
  //     Else
  //       Create subCWD from URI
  //       If subCWD does not exist, make subCWD (mkdirp)
  //       Call `getIt` with subCWD and resource uri
}