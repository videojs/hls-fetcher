const assert = require('assert');
const nock = require('nock');
nock.disableNetConnect();
nock.enableNetConnect(/localhost/);
const walker = require('../../src/walk-manifest');

const TEST_URL = 'http://manifest-list-test.com';

describe('walk-manifest', function() {
    describe('walkPlaylist', function() {

        it('should return just segments for simple m3u8', function(done) {

            const m3u8 = nock(TEST_URL)
                .get('/test.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/simple.m3u8`);

            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                // m3u8 and 11 segments
                assert.equal(resources.length, 12);
                resources.forEach(function(item) {
                    assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
                });
                done();
            });
        });

        it('should return just segments for m3u8 with sub playlists', function(done) {

            nock(TEST_URL)
                .get('/test.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
                .get('/var256000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var256000/playlist.m3u8`)
                .get('/var386000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
                .get('/var500000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);


            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                // 4 m3u8 and 8 * 3 segments
                assert.equal(resources.length, 28);
                resources.forEach(function(item) {
                    assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
                });
                done();
            });
        });

        it('should return not throw an error if one sub playlist gets a 404', function(done) {

            nock(TEST_URL)
                .get('/test.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
                .get('/var256000/playlist.m3u8')
                .reply(404)
                .get('/var386000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
                .get('/var500000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);


            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                // 3 m3u8 and 8 * 2 segments
                assert.equal(resources.length, 19);
                resources.forEach(function(item) {
                    assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
                    assert(item.uri !== TEST_URL + '/var256000/playlist.m3u8');
                });
                done();
            });
        });

        it('should return not throw an error if one sub playlist gets an error', function(done) {

            nock(TEST_URL)
                .get('/test.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
                .get('/var256000/playlist.m3u8')
                .replyWithError('something awful happened')
                .get('/var386000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
                .get('/var500000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);


            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                // 3 m3u8 and 8 * 2 segments
                assert.equal(resources.length, 19);
                resources.forEach(function(item) {
                    assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
                    assert(item.uri !== TEST_URL + '/var256000/playlist.m3u8');
                });
                done();
            });
        });


    });
});
