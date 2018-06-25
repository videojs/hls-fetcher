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

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8'};
      walker(options, function(err, resources) {
        assert(!err);
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

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8'};
      walker(options, function(err, resources) {
        assert(!err);
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

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8'};
      walker(options, function(err, resources) {
        assert(!err);
        // m3u8 and 11 segments
        const setResources = new Set(resources);
        assert.equal(setResources.size, 12);
        setResources.forEach(function(item) {
          assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
        });
        done();
      });
    });

    it('should not get stuck and short circuit for a cycle and not throw an top level error on continueOnError true', function(done) {

      nock(TEST_URL)
        .get('/cycle1.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/cycle1.m3u8`)
        .get('/cycle2.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/cycle2.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/cycle1.m3u8', continueOnError: true};
      walker(options, function(topError, resources) {
        assert(!topError);
        // 2 m3u8 1 error
        const setResources = new Set(resources);
        assert.equal(setResources.size, 3);
        const nestedErrors = resources.filter(e => e instanceof Error);
        const validResources = resources.filter(r => 'uri' in r);
        assert(nestedErrors.find(o => o.message === 'Trying to visit the same uri again; stuck in a cycle|' + TEST_URL + '/cycle1.m3u8'));
        validResources.forEach(function(item) {
          assert(item.uri.includes('.m3u8'));
        });
        done();
      });
    });

    it('should not get stuck and throw a top level error for a cycle on continueOnError false', function(done) {

      nock(TEST_URL)
        .get('/cycle1.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/cycle1.m3u8`)
        .get('/cycle2.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/cycle2.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/cycle1.m3u8'};
      walker(options, function(topError, resources) {
        assert.equal(topError.message, 'Trying to visit the same uri again; stuck in a cycle|' + TEST_URL + '/cycle1.m3u8');
        assert(!resources);
        done();
      });
    });

    it('should return top level error if server takes too long to respond with top level m3u8 on continueOnError false', function(done) {
      this.timeout(3000);

      // We timeout if the server doesn't respond within 1.5s
      nock(TEST_URL)
        .get('/test.m3u8')
        .delayConnection(2000)
        .replyWithFile(200, `${process.cwd()}/test/resources/simple.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8'};
      walker(options, function(err, resources) {
        assert.equal(err.message, 'ESOCKETTIMEDOUT|' + TEST_URL + '/test.m3u8');
        assert(!resources);
        done();
      });
    });

    it('should return error in resources not top error if server takes too long to respond m3u8 on continueOnError true', function(done) {
      this.timeout(3000);

      // We timeout if the server doesn't respond within 1.5s
      nock(TEST_URL)
        .get('/test.m3u8')
        .delayConnection(2000)
        .replyWithFile(200, `${process.cwd()}/test/resources/simple.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', continueOnError: true};
      walker(options, function(topError, resources) {
        assert(!topError);
        // 1 error
        const setResources = new Set(resources);
        assert.equal(setResources.size, 1);
        const nestedErrors = resources.filter(e => e instanceof Error);
        assert(nestedErrors.find(o => o.message === 'ESOCKETTIMEDOUT|' + TEST_URL + '/test.m3u8'));
        done();
      });
    });

    it('should return just original m3u8 for invalid m3u8 and not break', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .reply(200, 'not a valid m3u8');

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8'};
      walker(options, function(err, resources) {
        assert(!err);
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

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8'};
      walker(options, function(err, resources) {
        assert(!err);
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

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8'};
      walker(options, function(err, resources) {
        assert(!err);
        // 4 m3u8 and 8 * 3 segments
        const setResources = new Set(resources);
        assert.equal(setResources.size, 28);
        setResources.forEach(function(item) {
          assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
        });
        done();
      });
    });

    it('should for one sub playlist getting 404 should get top level 404 error on continueOnError false', function(done) {

      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(404)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8'};
      walker(options, function(err, resources) {
        assert.equal(err.message, '404|' + TEST_URL + '/var256000/playlist.m3u8');
        assert(!resources);
        done();
      });
    });

    it('should for one sub playlist getting 404 get 404 error but the rest of valid resources on continueOnError true', function(done) {

      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(404)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', continueOnError: true};
      walker(options, function(topError, resources) {
        assert(!topError);
        // 3 m3u8 and 8 * 2 segments and 1 error
        const setResources = new Set(resources);
        assert.equal(setResources.size, 20);
        const nestedErrors = resources.filter(e => e instanceof Error);
        const validResources = resources.filter(r => 'uri' in r);
        assert(nestedErrors.find(o => o.message === '404|' + TEST_URL + '/var256000/playlist.m3u8'));
        validResources.forEach(function(item) {
          assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
          // We shouldn't get the bad manifest
          assert(item.uri !== TEST_URL + '/var256000/playlist.m3u8');
        });
        done();
      });
    });

    it('should for one sub playlist getting 500 should get top level 500 error on continueOnError false', function(done) {

      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(500)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);


      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8'};
      walker(options, function(err, resources) {
        assert.equal(err.message, '500|' + TEST_URL + '/var256000/playlist.m3u8');
        assert(!resources);
        done();
      });
    });

    it('should for one sub playlist getting 500 get 500 error but the rest of valid resources on continueOnError true', function(done) {

      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(500)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', continueOnError: true};
      walker(options, function(topError, resources) {
        assert(!topError);
        // 3 m3u8 and 8 * 2 segments and 1 error
        const setResources = new Set(resources);
        assert.equal(setResources.size, 20);
        const nestedErrors = resources.filter(e => e instanceof Error);
        const validResources = resources.filter(r => 'uri' in r);
        assert(nestedErrors.find(o => o.message === '500|' + TEST_URL + '/var256000/playlist.m3u8'));
        validResources.forEach(function(item) {
          assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
          // We shouldn't get the bad manifest
          assert(item.uri !== TEST_URL + '/var256000/playlist.m3u8');
        });
        done();
      });
    });

    it('should for one sub playlist throwing error should get top level error continueOnError false', function(done) {

      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .replyWithError('something awful happened')
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8'};
      walker(options, function(err, resources) {
        assert.equal(err.message, 'something awful happened|' + TEST_URL + '/var256000/playlist.m3u8');
        assert(!resources);
        done();
      });
    });

    it('should for one sub playlist throwing error should get error but have rest of valid segments/manifests continueOnError true', function(done) {

      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .replyWithError('something awful happened')
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', continueOnError: true};
      walker(options, function(topError, resources) {
        assert(!topError);
        // 3 m3u8 and 8 * 2 segments and 1 error
        const setResources = new Set(resources);
        assert.equal(setResources.size, 20);
        const nestedErrors = resources.filter(e => e instanceof Error);
        const validResources = resources.filter(r => 'uri' in r);
        assert(nestedErrors.find(o => o.message === 'something awful happened|' + TEST_URL + '/var256000/playlist.m3u8'));
        validResources.forEach(function(item) {
          assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
          assert(item.uri !== TEST_URL + '/var256000/playlist.m3u8');
        });
        done();
      });
    });

    it('should not break if sub playlist is not a valid m3u8', function(done) {

      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(200, 'not valid m3u8')
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8'};
      walker(options, function(err, resources) {
        assert(!err);
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

    it('should throw top level error if sub playlist takes too long to respond with m3u8 continueOnError false', function(done) {
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


      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8'};
      walker(options, function(err, resources) {
        assert.equal(err.message, 'ESOCKETTIMEDOUT|' + TEST_URL + '/var500000/playlist.m3u8');
        assert(!resources);
        done();
      });
    });

    it('should have error for sub playlist takes too long to respond with m3u8 but have rest of resources continueOnError true', function(done) {
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

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', continueOnError: true};
      walker(options, function(topError, resources) {
        assert(!topError);
        // 3 m3u8 and 8 * 2 segments and 1 error
        const setResources = new Set(resources);
        assert.equal(setResources.size, 20);
        const nestedErrors = resources.filter(e => e instanceof Error);
        const validResources = resources.filter(r => 'uri' in r);
        assert(nestedErrors.find(o => o.message === 'ESOCKETTIMEDOUT|' + TEST_URL + '/var500000/playlist.m3u8'));
        validResources.forEach(function(item) {
          assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
          // We shouldn't get the bad manifest
          assert(item.uri !== TEST_URL + '/var500000/playlist.m3u8');
        });
        done();
      });
    });
  });
});
