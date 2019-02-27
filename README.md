
# HLS-FETCHER

[![Build Status](https://travis-ci.org/videojs/hls-fetcher.svg?branch=master)](https://travis-ci.org/videojs/hls-fetcher)
[![Greenkeeper badge](https://badges.greenkeeper.io/videojs/hls-fetcher.svg)](https://greenkeeper.io/)
[![Slack Status](http://slack.videojs.com/badge.svg)](http://slack.videojs.com)

[![NPM](https://nodei.co/npm/hls-fetcher.png?downloads=true&downloadRank=true)](https://nodei.co/npm/hls-fetcher/)

Maintenance Status: Stable

A simple CLI tool to fetch an entire hls manifest and it's segments and save it all locally.

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Installation](#installation)
  - [Command Line Usage](#command-line-usage)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

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
