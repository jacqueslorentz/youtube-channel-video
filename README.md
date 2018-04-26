# Youtube Channel Video

Download all video from a Youtube channel

## Getting Started

### Prerequisites

ffmpeg and ffprobe must be installed on your system.
Get them from here: https://ffmpeg.org/

### Installation

Install dependencies with yarn:
```
yarn install
```
Add your Youtube Api Key in the ``api-key.js`` file, like this:
```javascript
module.exports = 'YOUR_YOUTUBE_API_KEY';
```
And run the script:
```
node youtube-channel-video.js CHANNEL_ID_OR_USERNAME
```
This will download all videos in a folder with channel name.

### Coding style guide

Usage of eslint to check the script file:
```
yarn eslint
```

## Built With

* [node-ytdl-core](https://github.com/fent/node-ytdl-core) - youtube downloader in javascript
* [request-promise](https://github.com/request/request-promise) - simplified HTTP request client

## License

Under MIT License - [LICENSE.md](LICENSE.md)
