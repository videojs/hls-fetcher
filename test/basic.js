var test = require('tape');
var parse = require('../parse.js');
var index = require('../index.js')

/* BEGIN parse.js tests */

test('parseResource playlist test 1', function (t) {
	var 
	  tagLine = "#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=240000",
	  resourceLine = "prog_index.m3u8",
	  manifestUri = "http://example.com/hls_manifest.m3u8",
	  resource = parse.parseResource(tagLine, resourceLine, manifestUri);

	t.plan(2);
    t.equal(resource.type, 'playlist');
    t.equal(resource.line, manifestUri + '/' + resourceLine);
});

test('parseResource playlist test 2', function (t) {
	var 
	  tagLine = "#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=440000",
	  resourceLine = "prog_index2.m3u8",
	  manifestUri = "http://example.com/hls_manifest.m3u8",
	  resource = parse.parseResource(tagLine, resourceLine, manifestUri);

    t.plan(2);
    t.equal(resource.type, 'playlist');
    t.equal(resource.line, manifestUri + '/' + resourceLine);
});

test('parseResource segment test 1', function (t) {
	var 
	  tagLine = "#EXTINF:10, no desc",
	  resourceLine = "fileSequence0.ts",
	  manifestUri = "http://example.com/hls_manifest.m3u8",
	  resource = parse.parseResource(tagLine, resourceLine, manifestUri);
    
    t.plan(2);
    t.equal(resource.type, 'segment');
    t.equal(resource.line, manifestUri + '/' + resourceLine);
});

test('parseResource segment test 2', function (t) {
	var 
	  tagLine = "#EXTINF:10, no desc",
	  resourceLine = "http://example.com/hls_manifest.m3u8/fileSequence0.ts",
	  manifestUri = "http://example.com/hls_manifest.m3u8",
	  resource = parse.parseResource(tagLine, resourceLine, manifestUri);

    t.plan(2);
    t.equal(resource.type, 'segment');
    t.equal(resource.line, "http://example.com/hls_manifest.m3u8/fileSequence0.ts");
});

test('parseManifest test 1', function (t) {
	var 
	  manifestUri = "http://example.com/hls_manifest.m3u8",
	  manifestData = "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10, no desc\nfileSequence0.ts\n#EXTINF:10, no desc\nfileSequence1.ts\n#EXT-X-ENDLIST",
	  manifestLines = parse.parseManifest(manifestUri, manifestData);

	var expected = [ { type: 'tag', line: '#EXTM3U' },
  				{ type: 'tag', line: '#EXT-X-TARGETDURATION:10' },
  				{ type: 'tag', line: '#EXT-X-MEDIA-SEQUENCE:0' },
  				{ type: 'tag', line: '#EXTINF:10, no desc' },
  				{ type: 'segment', line: 'http://example.com/fileSequence0.ts' },
  				{ type: 'tag', line: '#EXTINF:10, no desc' },
  				{ type: 'segment', line: 'http://example.com/fileSequence1.ts' },
  				{ type: 'tag', line: '#EXT-X-ENDLIST' } ];
    
    t.plan(1);
    t.deepEqual(manifestLines, expected);
});

/* END parse.js tests */


/* BEGIN index.js tests */

test('getCWDName test 1', function (t) {	
	var 
	  line = "http://example.com/hls_manifest.m3u8/fileSequence0.ts",
	  uri = "http://example.com/hls_manifest.m3u8";

	t.plan(1);
	t.equal(index.getCWDName(uri, line), 'hls_manifest.m3u8');
});


/* this test also requires parseManifest to be working correctly */
test('createManifestText test 1', function (t) {
	var 
	  uri = "http://example.com/hls_manifest.m3u8",
	  manifestData = "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10, no desc\nfileSequence0.ts\n#EXTINF:10, no desc\nfileSequence1.ts\n#EXT-X-ENDLIST",
	  manifestLines = parse.parseManifest(uri, manifestData),
	  expected = "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10, no desc\nfileSequence0.ts\n#EXTINF:10, no desc\nfileSequence1.ts\n#EXT-X-ENDLIST";
	
	t.plan(1);
	t.equal(index.createManifestText(manifestLines, uri),expected);
});

/* END index.js tests */





