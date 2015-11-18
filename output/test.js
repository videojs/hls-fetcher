var getIt = require('../');

getIt({
    cwd: './',
    uri: 'https://devimages.apple.com.edgekey.net/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8'
  },
  function (err) {
    if (err) {
      console.log('IT ALL BROKE!');
      return;
    }
    console.log('HLS saved!');
  });
