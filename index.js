// Node modules
var path = require('path');
var fetch = require('fetch');
var parse = require('./parse.js');
var async = require('async');
var fs = require('fs');

function getIt(options, done) {
  var uri = options.uri,
    cwd = options.cwd,
    concurrency = options.concurrency || DEFAULT_CONCURRENCY,
    playlistFilename = path.basename(uri.split('?')[0]);

  //start of the program, fetch master playlist
  fetch.fetchUrl(uri, function getPlaylist(err, meta, body) {
    if (err) {
      console.error('Error fetching url:', uri);
      return done(err);
    }
    //we now have the master playlist
    var masterPlaylist = parse.parseMasterPlaylist(uri, body.toString()),
      mediaPlaylists = masterPlaylist.medPlaylists,
      oldLength = mediaPlaylists.length,
      masterManifestLines = masterPlaylist.manLines,
      i;
    playlistFilename = playlistFilename = playlistFilename.split('?')[0];

    //save master playlist
    fs.writeFileSync(path.resolve(cwd, playlistFilename), masterPlaylist.manLines.join('\n'));
    // parse the mediaplaylists for segments and targetDuration
    for (i = 0; i < mediaPlaylists.length; i++) {
      parse.parseMediaPlaylist(masterPlaylist.medPlaylists[i], doneParsing, path.dirname(masterPlaylist.uri), cwd);
    }
    masterPlaylist.mediaPlaylists = [];

    function doneParsing(playlist) {
      masterPlaylist.mediaPlaylists.push(playlist);
      // once we have gotten all of the data, setup downloading
      if(masterPlaylist.mediaPlaylists.length === oldLength) {
        setupDownload()
      }
    }

    function setupDownload() {
      var pl = masterPlaylist.mediaPlaylists,
        rootUri,
        newFunction,
        newerFunction,
        i;
      // set update and download intervals
      for (i = 0; i < pl.length; i++) {
        rootUri = path.dirname(pl[i].uri);
        updateFunction = pl[i].update.bind(pl[i]);
        downloadFunction = pl[i].download.bind(pl[i]);
        downloadFunction(rootUri, cwd, pl[i].bandwidth);
        setInterval(updateFunction, pl[i].targetDuration * 1000, rootUri);
        setInterval(downloadFunction,pl[i].targetDuration * 500, rootUri, cwd, pl[i].bandwidth);
      }
    }
  });
}
module.exports = getIt;
