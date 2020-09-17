/* eslint-env mocha */
/* eslint-disable max-nested-callbacks */
const assert = require('assert');
const nock = require('nock');

nock.disableNetConnect();
nock.enableNetConnect(/localhost/);
const walker = require('../../src/walk-manifest');

const TEST_URL = 'http://manifest-list-test.com';

const countResources = function({
  extensions,
  resources,
  file = true,
  uri = true,
  total = true,
  uniqueFile = true
}) {
  extensions = extensions || ['m4s', 'm3u8', 'ts', 'mp4', 'mpd', 'm4a'];
  const uniqueFiles = [];
  const counts = {};

  if (total) {
    counts.total = resources.length;
  }

  resources.forEach(function(item) {
    if (uniqueFile && uniqueFiles.indexOf(item.file) !== -1) {
      return;
    }
    uniqueFiles.push(item.file);
    extensions.forEach(function(ext) {
      if (file && !item.file.includes(`.${ext}`)) {
        return;
      }

      if (uri && !item.uri.includes(`.${ext}`)) {
        return;
      }

      counts[ext] = counts[ext] || 0;
      counts[ext]++;
    });
  });

  return counts;
};

const customError = function(errors) {
  return function(err, uri, resources, resolve) {
    // Avoid adding the top level uri to nested errors
    if (err.message.includes('|')) {
      errors.push(err);
    } else {
      errors.push(new Error(err.message + '|' + uri));
    }

    resolve(resources);
  };
};

describe('walk-manifest', function() {
  describe('walkPlaylist', function() {
    /* eslint-disable no-console */
    beforeEach(function() {
      this.oldError = console.error;

      console.error = () => {};
    });
    afterEach(function() {
      console.error = this.oldError;
      if (!nock.isDone()) {
        this.test.error(new Error('Not all nock interceptors were used!'));
        nock.cleanAll();
      }
    });
    /* eslint-enable no-console */

    it('should return just top level error for bad m3u8 uri', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .reply(500);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .catch(function(err) {
          assert.equal(err.message, '500|' + TEST_URL + '/test.m3u8');
          assert(err.reponse);
        });
    });

    it('should return just m3u8 for empty m3u8', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/empty.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          const counts = countResources({resources});

          assert.deepEqual(counts, {
            total: 1,
            m3u8: 1
          });
        });
    });

    it('should return just segments for simple m3u8', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/simple.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          const counts = countResources({resources});

          assert.deepEqual(counts, {
            m3u8: 1,
            ts: 11,
            total: 12
          });
        });
    });

    it('should return just segments for m3u8 with windows paths', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/windows.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          const counts = countResources({resources});

          assert.deepEqual(counts, {
            m3u8: 1,
            ts: 2,
            total: 3
          });
          assert.equal(resources[1].file, 'chunk_0.ts');
          assert.equal(resources[2].file, 'chunk_1.ts');
        });
    });

    it('should return correct paths for m3u8', function() {
      nock(TEST_URL)
        .get('/test/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/path-testing.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          const counts = countResources({resources});

          assert.deepEqual(counts, {
            m3u8: 1,
            ts: 4,
            total: 5
          });
          assert.equal(resources[0].uri, `${TEST_URL}/test/test.m3u8`);
          assert.equal(resources[1].uri, `${TEST_URL}/test/chunk_0.ts`);
          assert.equal(resources[2].uri, `${TEST_URL}/test/chunk_1.ts`);
          assert.equal(resources[3].uri, `${TEST_URL}/test/test/chunk_2.ts`);
          assert.equal(resources[4].uri, `${TEST_URL}/test/chunk_3.ts`);
        });
    });

    it('should shorten paths that will be too long', function() {
      // string used in long-path.m3u8
      const longPathRandom = 'OYK%40%3F%2BrjKeGaskhhsmf8E7aoUftbIfXZo0ucm9qebBFsXG5yepliwyfwKIf4zTGqMocHsTJePF91V17ZJ4h8A7mS3ysNSOcjKQT2oAVJmfD3vJIwdDfD0mZqlA9jQOOWwXnLy0UQtn9V2eYXlNAdIc9w8yDFPxDp509vJC9lurHWewql6eg22drnACC2rEDOXYit0I3CqOaVRvLSIqG0quUda5CoDn7vmaCBlvsBA0MEoWQSG0TEmDtdTT6DP8vUCC7BTtr9Zaxo5l9QYnWyNMzZNszjijCoKq8LsAi95WIo2n9';
      const chunkPath = `chunk_@.ts?token=${longPathRandom}`
        .replace('?token=OYK%40%3F%2B', 'token=OYK@+')
        .substring(0, 255);
      const manifestUri = `test.m3u8?token=${longPathRandom}`;
      const manifestPath = manifestUri
        .replace('?token=OYK%40%3F%2B', 'token=OYK@+')
        .substring(0, 255);

      nock(TEST_URL)
        .get(`/test/${manifestUri}`)
        .replyWithFile(200, `${process.cwd()}/test/resources/long-path.m3u8`);

      const options = {
        decrypt: false,
        basedir: '.',
        uri: `${TEST_URL}/test/${manifestUri}`,
        requestRetryMaxAttempts: 0
      };

      return walker(options)
        .then(function(resources) {
          const counts = countResources({resources});

          assert.deepEqual(counts, {
            m3u8: 1,
            ts: 4,
            total: 5
          });
          assert.equal(resources[0].file, manifestPath, 'manifest');
          assert.equal(resources[1].file, chunkPath.replace('@', '0'), 'chunk 0');
          assert.equal(resources[2].file, chunkPath.replace('@', '1'), 'chunk 1');
          assert.equal(resources[3].file, chunkPath.replace('@', '2'), 'chunk 2');
          assert.equal(resources[4].file, chunkPath.replace('@', '3'), 'chunk 3');
        });
    });

    it('should return fmp4/ts segments and init segment for fmp4 m3u8', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/fmp4.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          const counts = countResources({resources});

          assert.deepEqual(counts, {
            m3u8: 1,
            m4s: 5,
            ts: 6,
            mp4: 1,
            total: 13
          });
        });
    });

    it('should follow http redirects for simple m3u8', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .reply(302, undefined, {location: TEST_URL + '/redirect.m3u8'})
        .get('/redirect.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/simple.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          const counts = countResources({resources});

          assert.deepEqual(counts, {
            m3u8: 1,
            ts: 11,
            total: 12
          });
        });
    });

    it('should not get stuck and short circuit for a cycle and throw no errors', function() {
      nock(TEST_URL)
        .get('/cycle1.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/cycle1.m3u8`)
        .get('/cycle2.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/cycle2.m3u8`);

      const errors = [];
      const options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/cycle1.m3u8',
        requestRetryMaxAttempts: 0
      };

      return walker(options)
        .then(function(resources) {
          const counts = countResources({resources});

          assert.deepEqual(counts, {
            m3u8: 2,
            total: 2
          });

          // no errors on cycle
          assert.equal(errors.length, 0);
        });
    });

    it('should return top level error if server takes too long to respond with top level m3u8 on default onError', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .delayConnection(100)
        .replyWithFile(200, `${process.cwd()}/test/resources/simple.m3u8`);

      const options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        requestRetryMaxAttempts: 0,
        requestTimeout: 10,
        requestRetryDelay: 10
      };

      return walker(options)
        .catch(function(err) {
          assert.equal(err.message, 'ESOCKETTIMEDOUT|' + TEST_URL + '/test.m3u8');
        });
    });

    it('should return error in resources not top error if server takes too long to respond m3u8 on custom onError', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .delayConnection(100)
        .replyWithFile(200, `${process.cwd()}/test/resources/simple.m3u8`);

      const errors = [];
      const options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        onError: customError(errors),
        requestRetryMaxAttempts: 0,
        requestTimeout: 10,
        requestRetryDelay: 10
      };

      return walker(options)
        .then(function(resources) {
          assert.equal(resources.length, 0);
          assert(errors.find(o => o.message === 'ESOCKETTIMEDOUT|' + TEST_URL + '/test.m3u8'));
        });
    });

    it('should return just original m3u8 for invalid m3u8 and not break', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .reply(200, 'not a valid m3u8');

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          const counts = countResources({resources});

          assert.deepEqual(counts, {
            m3u8: 1,
            total: 1
          });
        });
    });

    it('should return just segments for m3u8 with sub playlists', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var256000/playlist.m3u8`)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          const counts = countResources({resources});

          assert.deepEqual(counts, {
            m3u8: 4,
            ts: 24,
            total: 28
          });
        });
    });

    it('should return just segments for m3u8 with sub playlists with a redirect', function() {
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

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          const counts = countResources({resources});

          assert.deepEqual(counts, {
            m3u8: 4,
            ts: 24,
            total: 28
          });
        });
    });

    it('should for one sub playlist getting 404 should get top level 404 error on default onError', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(404)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .catch(function(err) {
          assert.equal(err.message, '404|' + TEST_URL + '/var256000/playlist.m3u8');
        });
    });

    it('should for one sub playlist getting 404 get 404 error but the rest of valid resources on custom onError', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(404)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const errors = [];
      const options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        onError: customError(errors),
        requestRetryMaxAttempts: 0
      };

      return walker(options)
        .then(function(resources) {
          const counts = countResources({resources});

          assert.deepEqual(counts, {
            m3u8: 3,
            ts: 16,
            total: 19
          });

          resources.forEach(function(item) {
            // We shouldn't get the bad manifest
            assert(item.uri !== TEST_URL + '/var256000/playlist.m3u8');
          });
        });
    });

    it('should for one sub playlist getting 500 should get top level 500 error on default onError', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(500)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        requestRetryMaxAttempts: 0
      };

      return walker(options)
        .catch(function(err) {
          assert.equal(err.message, '500|' + TEST_URL + '/var256000/playlist.m3u8');
        });
    });

    it('should for one sub playlist getting 500 should get top level 500 error on default onError and with even on 2 retry', function() {
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

      const options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        requestRetryMaxAttempts: 2,
        requestRetryDelay: 10
      };

      return walker(options)
        .catch(function(err) {
          assert.equal(err.message, '500|' + TEST_URL + '/var256000/playlist.m3u8');
        });
    });

    it('should for one sub playlist getting 500 get 500 error but the rest of valid resources on custom onError', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(500)
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const errors = [];
      const options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        onError: customError(errors),
        requestRetryMaxAttempts: 0
      };

      return walker(options)
        .then(function(resources) {
          // 3 m3u8 and 8 * 2 segments
          const setResources = new Set(resources);

          assert.equal(setResources.size, 19);

          assert(errors.find(o => o.message === '500|' + TEST_URL + '/var256000/playlist.m3u8'));
          resources.forEach(function(item) {
            assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
            // We shouldn't get the bad manifest
            assert(item.uri !== TEST_URL + '/var256000/playlist.m3u8');
          });
        });
    });

    it('should for one sub playlist throwing error should get top level error default onError', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .replyWithError('something awful happened')
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .catch(function(err) {
          assert.equal(err.message, 'something awful happened|' + TEST_URL + '/var256000/playlist.m3u8');
        });
    });

    it('should for one sub playlist throwing error should get error but have rest of valid segments/manifests default onError', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .replyWithError('something awful happened')
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const errors = [];
      const options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        onError: customError(errors),
        requestRetryMaxAttempts: 0
      };

      return walker(options)
        .then(function(resources) {
          // 3 m3u8 and 8 * 2 segments
          const setResources = new Set(resources);

          assert.equal(setResources.size, 19);

          assert(errors.find(o => o.message === 'something awful happened|' + TEST_URL + '/var256000/playlist.m3u8'));
          resources.forEach(function(item) {
            assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
            assert(item.uri !== TEST_URL + '/var256000/playlist.m3u8');
          });
        });
    });

    it('should not break if sub playlist is not a valid m3u8', function() {
      nock(TEST_URL)
        .get('/test.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/playlist.m3u8`)
        .get('/var256000/playlist.m3u8')
        .reply(200, 'not valid m3u8')
        .get('/var386000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var386000/playlist.m3u8`)
        .get('/var500000/playlist.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/with-sub-manifest/var500000/playlist.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/test.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          // 4 m3u8 and 8 * 2 segments
          const setResources = new Set(resources);

          assert.equal(setResources.size, 20);
          setResources.forEach(function(item) {
            assert(item.uri.includes('.ts') || item.uri.includes('.m3u8'));
          });
          // We should still get the invalid m3u8
          assert(resources.filter(e => e.uri === TEST_URL + '/var256000/playlist.m3u8').length > 0);
        });
    });

    it('should throw top level error if sub playlist takes too long to respond with m3u8 default onError', function() {
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

      const options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        requestRetryMaxAttempts: 0,
        requestTimeout: 10,
        requestRetryDelay: 10
      };

      return walker(options)
        .catch(function(err) {
          assert.equal(err.message, 'ESOCKETTIMEDOUT|' + TEST_URL + '/var500000/playlist.m3u8');
        });
    });

    it('should have error for sub playlist takes too long to respond with m3u8 but have rest of resources custom onError', function() {
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

      const errors = [];
      const options = {
        decrypt: false,
        basedir: '.',
        uri: TEST_URL + '/test.m3u8',
        onError: customError(errors),
        requestRetryMaxAttempts: 0,
        requestTimeout: 10,
        requestRetryDelay: 10
      };

      return walker(options)
        .then(function(resources) {
          const count = countResources({resources, extensions: ['ts', 'm3u8']});

          assert.deepEqual(count, {
            ts: 16,
            m3u8: 3,
            total: 19
          });
          assert(errors.find(o => o.message === 'ESOCKETTIMEDOUT|' + TEST_URL + '/var500000/playlist.m3u8'));
          resources.forEach(function(item) {
            // We shouldn't get the bad manifest
            assert(item.uri !== TEST_URL + '/var500000/playlist.m3u8');
          });
        });
    });

    it('should return segments and playlists for mpd', function() {
      nock(TEST_URL)
        .get('/dash.mpd')
        .replyWithFile(200, `${process.cwd()}/test/resources/dash.mpd`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/dash.mpd', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          // m3u8 and 13 segments
          const setResources = new Set(resources);
          const count = {mp4: 0, m4v: 0, m4a: 0, mpd: 0};

          assert.equal(setResources.size, 37);
          setResources.forEach(function(item) {
            if (item.uri.includes('.mp4')) {
              count.mp4 += 1;
            } else if (item.uri.includes('.m4v')) {
              count.m4v += 1;
            } else if (item.uri.includes('.m4a')) {
              count.m4a += 1;
            } else if (item.uri.includes('.mpd')) {
              count.mpd += 1;
            } else {
              assert(false, `items uri ${item.uri} was unexpected`);
              return;
            }

            assert(true, 'items uri was expected');
          });

          assert.equal(count.mp4, 6, 'mp4 count as expected');
          assert.equal(count.mpd, 1, 'mpd count as expected');
          assert.equal(count.m4v, 25, 'm4v count as expected');
          assert.equal(count.m4a, 5, 'm4a count as expected');
        });
    });

    it('should return segments and playlists for mpd with sidx', function() {
      nock(TEST_URL)
        .get('/sidx.mpd')
        .replyWithFile(200, `${process.cwd()}/test/resources/sidx.mpd`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/sidx.mpd', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          // m3u8 and 13 segments
          const setResources = new Set(resources);
          const count = {mp4: 0, m4v: 0, m4a: 0, mpd: 0};

          assert.equal(setResources.size, 7);
          setResources.forEach(function(item) {
            if (item.uri.includes('.mp4')) {
              count.mp4 += 1;
            } else if (item.uri.includes('.mpd')) {
              count.mpd += 1;
            } else {
              assert(false, `items uri ${item.uri} was unexpected`);
              return;
            }

            assert(true, 'items uri was expected');
          });

          assert.equal(count.mp4, 6, 'mp4 count as expected');
          assert.equal(count.mpd, 1, 'mpd count as expected');
        });
    });

    it('should handle tilde in the query', function() {
      nock(TEST_URL)
        .get('/tilde.m3u8?foo=~nope')
        .replyWithFile(200, `${process.cwd()}/test/resources/tilde-query-param.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/tilde.m3u8?foo=~nope', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          const count = countResources({resources, extensions: ['ts', 'm3u8']});

          assert.deepEqual(count, {
            ts: 9,
            m3u8: 1,
            total: 10
          });

        });
    });

    it('should handle paths in the query', function() {
      nock(TEST_URL)
        .get('/path-query.m3u8?foo=/no/dont/include')
        .replyWithFile(200, `${process.cwd()}/test/resources/path-query.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/path-query.m3u8?foo=/no/dont/include', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          const count = countResources({resources, extensions: ['ts', 'm3u8']});

          assert.deepEqual(count, {
            ts: 9,
            m3u8: 1,
            total: 10
          });

          resources.forEach(function({file}) {
            assert(!(/\/no\/dont\/include/).test(file), 'does not have query in file path');
          });
        });
    });

    it('handles duplicate manifests', function() {
      nock(TEST_URL)
        .get('/master.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/duplicate-manifests/master.m3u8`)
        .get('/manifest0/rendition.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/duplicate-manifests/manifest0/rendition.m3u8`)
        .get('/manifest1/rendition.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/duplicate-manifests/manifest1/rendition.m3u8`)
        .get('/manifest2/rendition.m3u8')
        .replyWithFile(200, `${process.cwd()}/test/resources/duplicate-manifests/manifest2/rendition.m3u8`);

      const options = {decrypt: false, basedir: '.', uri: TEST_URL + '/master.m3u8', requestRetryMaxAttempts: 0};

      return walker(options)
        .then(function(resources) {
          const count = countResources({resources, extensions: ['ts', 'm3u8']});

          assert.deepEqual(count, {
            ts: 27,
            m3u8: 4,
            total: 31
          });

          resources.forEach(function({file}) {
            assert(!(/\/no\/dont\/include/).test(file), 'does not have query in file path');
          });
        });
    });
    // end walkPlaylist
  });
});
