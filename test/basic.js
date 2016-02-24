var test = require('tape');
var parse = require('../parse.js');
var fetcher = require('../index.js')


/*Begin encrypted segment fetching tests */

/*   1. Test method=none encryption */
test('parseManifest correctly identifies method=none encryption', function(t) {
  var
    manifestData = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-VERSION:3\n#EXT-X-PLAYLIST-TYPE:VOD\n\
                    #EXT-X-TARGETDURATION:11\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:7.007,\n\
                    http://api323-phx.unicornmedia.com/content.ts\n#EXTINF:8.075,\n\
                    http://api323-phx.unicornmedia.com/content.ts",
    manifestURI = "http://api323-phx.unicornmedia.com",
    manifestLines = parse.parseManifest(manifestURI, manifestData);
    for(var i = 0; i < manifestLines.length; i++) {
      if(manifestLines[i].type == 'segment') {
        t.equal(manifestLines[i].encrypted, false);
      }
    }
    t.end();
});

/*   2. Test method=AES-128 encryption */
test('parseManifest correctly identifies method=AES-128 encryption', function(t) {
  var
    manifestData = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-VERSION:3\n#EXT-X-PLAYLIST-TYPE:VOD\n\
                    #EXT-X-TARGETDURATION:11\n#EXT-X-KEY:METHOD=AES-128,URI='http://once.unicornmedia.com/key/da338eac-df49-4f99-85f1-bca3fdf2242c/f5f4dd56-a8a9-42bc-aca9-4b6a93659533/4236fac6-f0df-4f9a-b9c7-159cfb257618/once.key?umx=cAy9b5515NitZ2XV9RnbyA==',IV=0xc6fa3642dff09a4fb9c7159cfb257618\n\
                    #EXTINF:7.007,\n\
                    http://api323-phx.unicornmedia.com/content.ts\n#EXTINF:8.075,\n\
                    http://api323-phx.unicornmedia.com/content.ts",
    manifestURI = "http://api323-phx.unicornmedia.com",
    manifestLines = parse.parseManifest(manifestURI, manifestData);
    for(var i = 0; i < manifestLines.length; i++) {
      if(manifestLines[i].type == 'segment') {
        t.equal(manifestLines[i].encrypted, true);
      }
    }
    t.end();
});

/*   3. Test method=AES-128 encryption with no IV */
test('parseManifest correctly identifies segment IV based on media sequence number', function(t) {
  var
    manifestData = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-VERSION:3\n#EXT-X-PLAYLIST-TYPE:VOD\n\
                    #EXT-X-TARGETDURATION:11\n#EXT-X-KEY:METHOD=AES-128,URI='http://once.unicornmedia.com/key/da338eac-df49-4f99-85f1-bca3fdf2242c/f5f4dd56-a8a9-42bc-aca9-4b6a93659533/4236fac6-f0df-4f9a-b9c7-159cfb257618/once.key?umx=cAy9b5515NitZ2XV9RnbyA=='\n#EXTINF:7.007,\nhttp://api323-phx.unicornmedia.com/content.ts\n#EXTINF:8.075,\nhttp://api323-phx.unicornmedia.com/content.ts",
    manifestURI = "http://api323-phx.unicornmedia.com",
    manifestLines = parse.parseManifest(manifestURI, manifestData),
    counter = 0,
    baseArray = [];
  for(var i = 0; i < manifestLines.length; i++) {
    if(manifestLines[i].type == 'segment') {
      baseArray[0] = 0;
      baseArray[1] = 0;
      baseArray[2] = 0;
      baseArray[3] = parseInt(counter);
      counter += 1;
      baseArray = new Uint32Array(baseArray);
      for(var j = 0; j < baseArray.length; j++){
        t.equal(manifestLines[i].IV[j],baseArray[j]);
      }
    }
  }
  t.end();
});

/*   4. Test alternating keys for AES-128 encryption */
test('parseManifest correctly identifies alternating keys for AES-128 encryption', function(t) {
  var
    manifestData = "#EXT-X-KEY:METHOD=AES-128,URI='index-encryption-00001.key',IV=0x00000000000000000000000000000000\n#EXTINF:10,\nindex-00001.ts\n#EXT-X-KEY:METHOD=AES-128,URI='index-encryption-00002.key',IV=0x00000000000000000000000000000000\n#EXTINF:10,\nindex-00002.ts",
    manifestURI = "http://api323-phx.unicornmedia.com",
    manifestLines = parse.parseManifest(manifestURI, manifestData),
    counter = 0;
    for(var i = 0; i < manifestLines.length; i++) {
      if(manifestLines[i].type == 'segment') {
        if (counter == 0) {
          //check first encryption key
          t.equal(manifestLines[i].keyURI, "http://api323-phx.unicornmedia.com/index-encryption-00001.key");
        } else {
          t.equal(manifestLines[i].keyURI, "http://api323-phx.unicornmedia.com/index-encryption-00002.key");
        }
        counter += 1;
      }
    }
    t.end();
});

/*End encrypted segment fetching tests */

////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////

/* Begin non-encrypted segment fetching tests */

/*   1. Test non-absolute uri correction */
test('parseResource corrects non-absolute URI', function(t) {
  var
    tagLine = "#EXTINF:10,",
    resourceLine = "index-00001.ts",
    manifestURI = "https://s3.amazonaws.com/_bc_dml/example-content/hlse",
    resource = parse.parseResource(tagLine, resourceLine, manifestURI);
  t.plan(1);
  t.equal(resource.line, "https://s3.amazonaws.com/_bc_dml/example-content/hlse/index-00001.ts");
});

/*   2. Test absolute uri stays the same */
test('parseResource does not correct absolute URI', function(t) {
  var
    tagLine = "#EXTINF:10,",
    resourceLine = "https://s3.amazonaws.com/_bc_dml/example-content/hlse/index-00001.ts",
    manifestURI = "https://s3.amazonaws.com/_bc_dml/example-content/hlse",
    resource = parse.parseResource(tagLine, resourceLine, manifestURI);
  t.plan(1);
  t.equal(resource.line, "https://s3.amazonaws.com/_bc_dml/example-content/hlse/index-00001.ts");
});

/*   3. Test that parseManifest returns the correct number of lines */
test('correct amount of manifest lines', function(t) {
  var
    manifestData = "#EXTM3U\n#EXT-X-VERSION:2\n#EXT-X-PLAYLIST-TYPE:VOD\n\
                    #EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n\
                    #EXT-X-KEY:METHOD=AES-128,URI='index-encryption-00001.key',IV=0x00000000000000000000000000000000\n\
                    #EXTINF:10,\nindex-00001.ts\n#EXTINF:10,\nindex-00002.ts\n#EXTINF:10,\nindex-00003.ts",
    manifestURI = "https://s3.amazonaws.com/_bc_dml/example-content/hlse",
    manifestLines = parse.parseManifest(manifestURI, manifestData);
  t.plan(1);
  t.equal(manifestLines.length, 12);
});

/*   4. Test that getCWDName works as originally planned */
test('getCWDName works properly', function(t) {
  var
    test1 = fetcher.getCWDName("http://a.com/b/index.m3u8", "http://a.com/b/test.m3u8"),
    test2 = fetcher.getCWDName("http://a.com/b/index.m3u8", "http://a.com/b/c/test.m3u8"),
    test3 = fetcher.getCWDName("http://a.com/b/index.m3u8", "http://a.com/b/c/d/e/test.m3u8");
  t.plan(3);
  t.equal(test1, 'test');
  t.equal(test2, 'c');
  t.equal(test3, 'c_d_e');
});

/*   5. Test that parseResource identifies segments and playlists correctly */
test('parseResource can identify whether a line is either a playlist or a segment', function(t) {
  var
    tagLine1 = "#EXTINF:10,",
    resourceLine1 = "index-00001.ts",
    manifestURI1 = "https://s3.amazonaws.com/_bc_dml/example-content/hlse",
    tagLine2 = "#EXT-X-STREAM-INF:BANDWIDTH=1200000,AVERAGE-BANDWIDTH=1200000",
    resourceLine2 = "http://api323-phx.unicornmedia.com/now/media/playlist.m3u8",
    manifestURI2 = "http://api323-phx.unicornmedia.com/now/media",
    resource1 = parse.parseResource(tagLine1, resourceLine1, manifestURI1),
    resource2 = parse.parseResource(tagLine2, resourceLine2, manifestURI2);
  t.plan(2);
  t.equal(resource1.type, 'segment');
  t.equal(resource2.type, 'playlist');
});

/* End non-encrypted segment fetching tests */
