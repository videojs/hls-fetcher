# HLS-FETCHER

[![Build Status](https://travis-ci.org/videojs/hls-fetcher.svg?branch=master)](https://travis-ci.org/videojs/hls-fetcher)
[![Greenkeeper badge](https://badges.greenkeeper.io/videojs/hls-fetcher.svg)](https://greenkeeper.io/)
[![Slack Status](http://slack.videojs.com/badge.svg)](http://slack.videojs.com)

[![NPM](https://nodei.co/npm/hls-fetcher.png?downloads=true&downloadRank=true)](https://nodei.co/npm/hls-fetcher/)

A plugin that displays user-friendly messages when Video.js encounters an error.

Lead Maintainer: Brandon Casey [@brandonocasey](https://github.com/brandonocasey)

Maintenance Status: Stable

A simple CLI tool to fetch an entire hls manifest and it's segments and save it all locally.

## Installation

``` bash
  $ [sudo] npm install hls-fetcher -g
```

### Command Line Usage

**Example**
```
hls-fetcher -i http://example.com/hls_manifest.m3u8
```

**Options**
```
  $ hls-fetcher
  Usage: hls-fetcher

  Options:
    -i, --input        uri to m3u8 (required)
    -o, --output       output path (default:'./')
    -c, --concurrency  number of simultaneous fetches (default: 5)
```
