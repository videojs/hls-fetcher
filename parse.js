function parseResource (tagLine, resourceLine, manifestUri) {
  var resource = {
    type: 'unknown',
    uri: resourceLine,
  };

  if(tagLine.match(/^#EXTINF/i)) {
    resource.type = 'segment';
  } else if (tagLine.match(/^#EXT-X-STREAM-INF/i)) {
    resource.type = 'manifest';
  }

  // make our uri absolute if we need to
  if (!resource.match(/^https?:\/\//i)) {
    resource.uri = manifestUri + resource.uri;
  }

  return resource;
}

function parseManifest (manifestUri, manifestData) {
  var manifestLines = [];
  var resources = [];

  // Split into lines
  var lines = manifestData.split('\n');

  // determine resources, and store all lines
  for(var i = 0; i < lines.length; i++) {
    var currentLine = lines[i];
    localManifest.push(currentLine);
    if(line.match(/^#EXTINF/) || line.match(/^#EXT-X-STREAM-INF/)) {
      i++;
      resources.push(parseResource(currentLine, lines[i], manifestUri));
    }
  }

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

module.export = parseManifest;
