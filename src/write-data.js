var Promise = require('bluebird');
var mkdirp = Promise.promisify(require('mkdirp'));
var request = require('requestretry');
var fs = Promise.promisifyAll(require('fs'));
var aesDecrypter = require('aes-decrypter').Decrypter;
var path = require('path');

var writeFile = function(file, content) {
  return mkdirp(path.dirname(file)).then(function() {
    return fs.writeFileAsync(file, content);
  }).then(function() {
    console.log('Finished: ' + path.relative('.', file));
  });
};

var requestFile = function(uri) {
  var options = {
    uri: uri,
    timeout: 60000, // 60 seconds timeout
    encoding: null, // treat all responses as a buffer
    retryDelay: 1000 // retry 1s after on failure
  };
  return new Promise(function(resolve, reject) {
    request(options, function(err, response, body) {
      if (err) {
        return reject(err);
      }
      return resolve(body);
    });
  });
};

var toArrayBuffer = function(buffer) {
    var ab = new ArrayBuffer(buffer.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
        view[i] = buffer[i];
    }
    return ab;
};

var decryptFile = function(content, encryption) {
  return new Promise(function(resolve, reject) {
    var d = new aesDecrypter(toArrayBuffer(content), encryption.bytes, encryption.iv, function(err, bytes) {
      return resolve(new Buffer(bytes));
    })
  });
};

var WriteData = function(decrypt, concurrency, resources, callback) {
  var inProgress = [];
  var operations = [];

  resources.forEach(function(r) {
    if (r.content) {
      operations.push(function() { return writeFile(r.file, r.content); });
    } else if (r.key && decrypt) {
      operations.push(function() {
        return requestFile(r.uri).then(function(content) {
          return decryptFile(content, r.key);
        }).then(function(content) {
          return writeFile(r.file, content)
        });
      });
    } else if (inProgress.indexOf(r.uri) === -1) {
      operations.push(function() {
        return requestFile(r.uri).then(function(content) {
          return writeFile(r.file, content);
        });
      });
      inProgress.push(r.uri);
    }
  });

  return Promise.map(operations, function(o) {
    return Promise.join(o());
  }, {concurrency: concurrency}).all(function(o) {
    console.log('DONE!');
    return Promise.resolve();
  }).asCallback(callback);
};

module.exports = WriteData;
