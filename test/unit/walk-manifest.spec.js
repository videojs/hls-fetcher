var assert = require('assert');
var nock = require('nock');
nock.disableNetConnect();
nock.enableNetConnect(/localhost/);
var walker = require('../../src/walk-manifest');

var TEST_URL = 'http://manifest-list-test.com';

var customError = function(errors) {
  return function(err, uri, resources, resolve) {
    // Avoid adding the top level uri to nested errors
    if (err.message.includes('|'))
      errors.push(err);
    else
      errors.push(new Error(err.message + '|' + uri));

    resolve(resources);
  }
};

describe('walk-manifest', function() {
  describe('walkPlaylist', function() {
    afterEach(function() {
      if (!nock.isDone()) {
        this.test.error(new Error('Not all nock interceptors were used!'));
        nock.cleanAll();
      }
    });

    it('should return just top level error for bad m3u8 uri', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .reply(500);

      var options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};
      walker(options)
        .catch(function(err) {
          assert.equal(err.message, '500|' + TEST_URL + '/test.m3u8');
          assert(err.reponse);
          done();
        })
    });

    it('should return just m3u8 for empty m3u8', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/empty.m3u8`);

      var options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};
      walker(options)
        .then(function(resources) {
          var setResources = new Set(resources);
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

      var options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};
      walker(options)
        .then(function(resources) {
          // m3u8 and 11 segments
          var setResources = new Set(resources);
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

      var options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};
      walker(options)
        .then(function(resources) {
          // m3u8 and 11 segments
          var setResources = new Set(resources);
          assert.equal(setResources.size, 12);
          setResources.forEach(function(item) {
            assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
          });
          done();
        });
    });

    it('should not get stuck and short circuit for a cycle and not throw an top level error on custom onError', function(done) {
      nock(TEST_URL)
        .get('/cycle1.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/cycle1.m3u8`)
        .get('/cycle2.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/cycle2.m3u8`);

      var errors = [];
      var options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/cycle1.m3u8',
        onError: customError(errors),
        requestRetryMaxAttempts: 0
      };
      walker(options)
        .then(function(resources) {
          var setResources = new Set(resources);
          assert.equal(setResources.size, 2);         // 2 m3u8
          assert.equal(errors.length, 1);             // 1 error
          assert(errors.find(o => o.message === 'Trying to visit the same uri again; stuck in a cycle|' + TEST_URL + '/cycle1.m3u8'));
          resources.forEach(function(item) {
            assert(item.uri.includes('.m3u8'));
          });
          done();
        })
    });

    it('should not get stuck and throw a top level error for a cycle on default onError', function(done) {
      nock(TEST_URL)
        .get('/cycle1.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/cycle1.m3u8`)
        .get('/cycle2.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/cycle2.m3u8`);

      var options = {decrypt: false, basedir: '.', uri: TEST_URL + '/cycle1.m3u8', requestRetryMaxAttempts: 0};
      walker(options)
        .catch(function(err) {
          assert(err.message === 'Trying to visit the same uri again; stuck in a cycle|' + TEST_URL + '/cycle1.m3u8');
          done();
        });
    });

    it('should return top level error if server takes too long to respond with top level m3u8 on default onError', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .delayConnection(100)
        .replyWithFile(200, `${process.cwd()}/test/resources/simple.m3u8`);

      var options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        requestRetryMaxAttempts: 0,
        requestTimeout: 10,
        requestRetryDelay: 10
      };
      walker(options)
        .catch(function(err) {
          assert.equal(err.message, 'ESOCKETTIMEDOUT|' + TEST_URL + '/test.m3u8');
          done();
        });
    });

    it('should return error in resources not top error if server takes too long to respond m3u8 on custom onError', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .delayConnection(100)
        .replyWithFile(200, `${process.cwd()}/test/resources/simple.m3u8`);

      var errors = [];
      var options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        onError: customError(errors),
        requestRetryMaxAttempts: 0,
        requestTimeout: 10,
        requestRetryDelay: 10
      };
      walker(options)
        .then(function(resources) {
          assert.equal(resources.length, 0);
          assert(errors.find(o => o.message === 'ESOCKETTIMEDOUT|' + TEST_URL + '/test.m3u8'));
          done();
        });
    });

    it('should return just original m3u8 for invalid m3u8 and not break', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .reply(200, 'not a valid m3u8');

      var options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};
      walker(options)
        .then(function(resources) {
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

      var options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};
      walker(options)
        .then(function(resources) {
          // 4 m3u8 and 8 * 3 segments
          var setResources = new Set(resources);
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

      var options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};
      walker(options)
        .then(function(resources) {
          // 4 m3u8 and 8 * 3 segments
          var setResources = new Set(resources);
          assert.equal(setResources.size, 28);
          setResources.forEach(function(item) {
            assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
          });
          done();
        });
    });

    it('should for one sub playlist getting 404 should get top level 404 error on default onError', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(404)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      var options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};
      walker(options)
        .catch(function(err) {
          assert.equal(err.message, '404|' + TEST_URL + '/var256000/playlist.m3u8');
          done();
        });
    });

    it('should for one sub playlist getting 404 get 404 error but the rest of valid resources on custom onError', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(404)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      var errors = [];
      var options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        onError: customError(errors),
        requestRetryMaxAttempts: 0
      };
      walker(options)
        .then(function(resources) {
          // 3 m3u8 and 8 * 2 segments
          var setResources = new Set(resources);
          assert.equal(setResources.size, 19);

          assert(errors.find(o => o.message === '404|' + TEST_URL + '/var256000/playlist.m3u8'));
          resources.forEach(function(item) {
            assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
            // We shouldn't get the bad manifest
            assert(item.uri !== TEST_URL + '/var256000/playlist.m3u8');
          });
          done();
        });
    });

    it('should for one sub playlist getting 500 should get top level 500 error on default onError', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(500)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      var options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        requestRetryMaxAttempts: 0,
      };
      walker(options)
        .catch(function(err) {
          assert.equal(err.message, '500|' + TEST_URL + '/var256000/playlist.m3u8');
          done();
        });
    });

    it('should for one sub playlist getting 500 should get top level 500 error on default onError and with even on 2 retry', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .times(2)
        .reply(500)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      var options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        requestRetryMaxAttempts: 2,
        requestRetryDelay: 10
      };
      walker(options)
        .catch(function(err) {
          assert.equal(err.message, '500|' + TEST_URL + '/var256000/playlist.m3u8');
          done();
        });
    });

    it('should for one sub playlist getting 500 get 500 error but the rest of valid resources on custom onError', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(500)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      var errors = [];
      var options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        onError: customError(errors),
        requestRetryMaxAttempts: 0
      };
      walker(options)
        .then(function(resources) {
          // 3 m3u8 and 8 * 2 segments
          var setResources = new Set(resources);
          assert.equal(setResources.size, 19);

          assert(errors.find(o => o.message === '500|' + TEST_URL + '/var256000/playlist.m3u8'));
          resources.forEach(function(item) {
            assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
            // We shouldn't get the bad manifest
            assert(item.uri !== TEST_URL + '/var256000/playlist.m3u8');
          });
          done();
        });
    });

    it('should for one sub playlist throwing error should get top level error default onError', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .replyWithError('something awful happened')
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      var options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};
      walker(options)
        .catch(function(err) {
          assert.equal(err.message, 'something awful happened|' + TEST_URL + '/var256000/playlist.m3u8');
          done();
        });
    });

    it('should for one sub playlist throwing error should get error but have rest of valid segments/manifests default onError', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .replyWithError('something awful happened')
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);


      var errors = [];
      var options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        onError: customError(errors),
        requestRetryMaxAttempts: 0
      };
      walker(options)
        .then(function(resources) {
          // 3 m3u8 and 8 * 2 segments
          var setResources = new Set(resources);
          assert.equal(setResources.size, 19);

          assert(errors.find(o => o.message === 'something awful happened|' + TEST_URL + '/var256000/playlist.m3u8'));
          resources.forEach(function(item) {
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

      var options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};
      walker(options)
        .then(function(resources) {
          // 4 m3u8 and 8 * 2 segments
          var setResources = new Set(resources);
          assert.equal(setResources.size, 20);
          setResources.forEach(function(item) {
            assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
          });
          // We should still get the invalid m3u8
          assert(resources.filter(e => e.uri === TEST_URL + '/var256000/playlist.m3u8').length > 0);
          done();
        });
    });

    it('should throw top level error if sub playlist takes too long to respond with m3u8 default onError', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var256000/playlist.m3u8`)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .delayConnection(100)
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      var options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        requestRetryMaxAttempts: 0,
        requestTimeout: 10,
        requestRetryDelay: 10
      };
      walker(options)
        .catch(function(err) {
          assert.equal(err.message, 'ESOCKETTIMEDOUT|' + TEST_URL + '/var500000/playlist.m3u8');
          done();
        });
    });

    it('should have error for sub playlist takes too long to respond with m3u8 but have rest of resources custom onError', function(done) {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var256000/playlist.m3u8`)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .delayConnection(100)
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);
      
      var errors = [];
      var options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        onError: customError(errors),
        requestRetryMaxAttempts: 0,
        requestTimeout: 10,
        requestRetryDelay: 10
      };
      walker(options)
        .then(function(resources) {
          // 3 m3u8 and 8 * 2 segments
          var setResources = new Set(resources);
          assert.equal(setResources.size, 19);
          assert(errors.find(o => o.message === 'ESOCKETTIMEDOUT|' + TEST_URL + '/var500000/playlist.m3u8'));
          resources.forEach(function(item) {
            assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
            // We shouldn't get the bad manifest
            assert(item.uri !== TEST_URL + '/var500000/playlist.m3u8');
          });
          done();
        });
    });
  });
});
