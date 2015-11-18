# HLS-FETCHER

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
