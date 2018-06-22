const assert = require('assert');
const nock = require('nock');
nock.disableNetConnect();
nock.enableNetConnect(/localhost/);
const walker = require('../../src/walk-manifest');

const TEST_URL = 'http://manifest-list-test.com';

describe('walk-manifest', function() {
    describe('walkPlaylist', function() {

        it('should return just m3u8 for empty m3u8', function(done) {

            nock(TEST_URL)
                .get('/test.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/empty.m3u8`);

            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                const setResources = new Set(resources);
                assert.equal(setResources.size, 1);
                setResources.forEach(function(item) {
                    assert(item.uri.includes('.m3u8'));
                });
                done();
            });
        });

        it('should return just segments for simple m3u8', function(done) {

            nock(TEST_URL)
                .get('/test.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/simple.m3u8`);

            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                // m3u8 and 11 segments
                const setResources = new Set(resources);
                assert.equal(setResources.size, 12);
                setResources.forEach(function(item) {
                    assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
                });
                done();
            });
        });

        it('should follow http redirects for simple m3u8', function(done) {

            nock(TEST_URL)
                .get('/test.m3u8')
                .reply(302, undefined, {location: TEST_URL + '/redirect.m3u8'})
                .get('/redirect.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/simple.m3u8`);

            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                // m3u8 and 11 segments
                const setResources = new Set(resources);
                assert.equal(setResources.size, 12);
                setResources.forEach(function(item) {
                    assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
                });
                done();
            });
        });

        it('should not get stuck for a cycle of m3u8', function(done) {

            nock(TEST_URL)
                .get('/cycle1.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/cycle1.m3u8`)
                .get('/cycle2.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/cycle2.m3u8`);

            walker(false, '.', TEST_URL + '/cycle1.m3u8', function(err, resources) {
                console.log(resources);
                // m3u8 and 11 segments
                const setResources = new Set(resources);
                assert.equal(setResources.size, 2);
                setResources.forEach(function(item) {
                    assert(item.uri.includes('.m3u8'));
                });
                done();
            });
        });

        it('should return nothing if server takes too long to respond with m3u8', function(done) {
            this.timeout(3000);

            nock(TEST_URL)
                .get('/test.m3u8')
                .delayConnection(2000)
                .replyWithFile(200, `${process.cwd()}/test/resources/simple.m3u8`);

            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                assert.equal(resources.length, 0);
                done();
            });
        });

        it('should return just original m3u8 for invalid m3u8 and not break', function(done) {
            nock(TEST_URL)
                .get('/test.m3u8')
                .reply(200, 'not a valid m3u8');

            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                assert.equal(resources.length, 1);
                resources.forEach(function(item) {
                    assert(item.uri.includes('.m3u8'));
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
                const setResources = new Set(resources);
                assert.equal(setResources.size, 28);
                setResources.forEach(function(item) {
                    assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
                });
                done();
            });
        });

        it('should return just segments for m3u8 with sub playlists with a redirect', function(done) {

            nock(TEST_URL)
                .get('/test.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
                .get('/var256000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var256000/playlist.m3u8`)
                .get('/var386000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
                .get('/var500000/playlist.m3u8')
                .reply(302, undefined, {location: TEST_URL + '/redirect.m3u8'})
                .get('/redirect.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                // 4 m3u8 and 8 * 3 segments
                const setResources = new Set(resources);
                assert.equal(setResources.size, 28);
                setResources.forEach(function(item) {
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
                const setResources = new Set(resources);
                assert.equal(setResources.size, 19);
                setResources.forEach(function(item) {
                    assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
                    assert(item.uri !== TEST_URL + '/var256000/playlist.m3u8');
                });
                done();
            });
        });

        it('should return not throw an error if one sub playlist gets a 500', function(done) {

            nock(TEST_URL)
                .get('/test.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
                .get('/var256000/playlist.m3u8')
                .reply(500)
                .get('/var386000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
                .get('/var500000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);


            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                // 3 m3u8 and 8 * 2 segments
                const setResources = new Set(resources);
                assert.equal(setResources.size, 19);
                setResources.forEach(function(item) {
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
                const setResources = new Set(resources);
                assert.equal(setResources.size, 19);
                setResources.forEach(function(item) {
                    assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
                    assert(item.uri !== TEST_URL + '/var256000/playlist.m3u8');
                });
                done();
            });
        });

        it('should return not break if sub playlist is not a valid m3u8', function(done) {

            nock(TEST_URL)
                .get('/test.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
                .get('/var256000/playlist.m3u8')
                .reply(200, 'not valid m3u8')
                .get('/var386000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
                .get('/var500000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);


            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                // 4 m3u8 and 8 * 2 segments
                const setResources = new Set(resources);
                assert.equal(setResources.size, 20);
                setResources.forEach(function(item) {
                    assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
                });
                // We should still get the invalid m3u8
                assert(resources.filter(e => e.uri === TEST_URL + '/var256000/playlist.m3u8').length > 0);
                done();
            });
        });


        it('should skip sub playlist if it too long to respond with m3u8', function(done) {
            this.timeout(3000);

            nock(TEST_URL)
                .get('/test.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
                .get('/var256000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var256000/playlist.m3u8`)
                .get('/var386000/playlist.m3u8')
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
                .get('/var500000/playlist.m3u8')
                .delayConnection(2000)
                .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);


            walker(false, '.', TEST_URL + '/test.m3u8', function(err, resources) {
                // 3 m3u8 and 8 * 2 segments
                const setResources = new Set(resources);
                assert.equal(setResources.size, 19);
                setResources.forEach(function(item) {
                    assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
                });
                // We should not get the timed out m3u8
                assert(resources.filter(e => e.uri === TEST_URL + '/var500000/playlist.m3u8').length === 0);
                done();
            });

        });


    });
});
