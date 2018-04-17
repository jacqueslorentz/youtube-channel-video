const rp = require('request-promise');
const fs = require('fs');
const ytdl = require('youtube-dl');
const API_KEY = require('./api-key');

const API_URL = 'https://www.googleapis.com/youtube/v3';
const VIDEO_URL = 'https://www.youtube.com/watch?v=';

const log = msg => console.log(msg);

const playlistRequest = (playlistId, nextPageToken) => new Promise((resolve) => {
    const params = {
        part: 'snippet',
        playlistId,
        key: API_KEY,
        maxResults: 50,
    };
    rp({
        url: `${API_URL}/playlistItems`,
        qs: (!nextPageToken ? params : { ...params, ...{ pageToken: nextPageToken } }),
        transform: JSON.parse,
    }).then((res) => {
        const data = res.items.map(e => ({
            title: e.snippet.title.trim(),
            url: VIDEO_URL + e.snippet.resourceId.videoId,
        }));
        if (res.nextPageToken) {
            playlistRequest(playlistId, res.nextPageToken).then((nextData) => {
                resolve(nextData ? data.concat(nextData) : null);
            });
        } else {
            resolve(data);
        }
    }).catch((err) => {
        log('Error when fetching channel playlist: ', err);
        resolve(null);
    });
});

const searchChannel = (channel, isUsername) => new Promise((resolve) => {
    const key = (isUsername ? 'forUsername' : 'id');
    rp({
        url: `${API_URL}/channels?part=contentDetails,snippet&${key}=${channel}&key=${API_KEY}`,
        transform: JSON.parse,
    }).then((res) => {
        resolve(res.items.length === 0 ? null : {
            title: res.items[0].snippet.title,
            id: res.items[0].contentDetails.relatedPlaylists.uploads,
        });
    }).catch((err) => {
        log('Error when searching channel: ', err);
        resolve(null);
    });
});

const getDisplaySize = (size, i) => {
    const suffixes = ['B', 'KB', 'MB', 'GB'];

    if (size < (i + 1) * 1024) {
        return `${size.toFixed(2)} ${suffixes[i]}`;
    }
    return getDisplaySize(size / 1024, i + 1);
};

const displayPourcentage = (pos, size) => {
    if (!size || size <= 0) {
        return;
    }
    const percent = `${((pos / size) * 100).toFixed(2)}%`;
    process.stdout.cursorTo(0);
    process.stdout.clearLine(1);
    process.stdout.write(`\tProgression: ${
        size === pos ? 'Done\n' : percent
    }`);
};

const downloadVideo = (data, index, path) => {
    if (index >= data.length) {
        log('Finish downloading all videos!!');
        return;
    }
    const elem = data[index];
    log(`[${parseInt(index, 10) + 1}/${data.length}] ${elem.title}`);

    const video = ytdl(elem.url);
    video.on('error', err => log('An error occurs: ', err));
    video.on('end', () => downloadVideo(data, index + 1, path));

    video.on('info', (info) => {
        video.pipe(fs.createWriteStream(`${path}/${elem.title}.mp4`));
        log(`\tSize: ${getDisplaySize(info.size, 0)}`);
        let pos = 0;
        video.on('data', (chunk) => {
            pos += chunk.length;
            displayPourcentage(pos, info.size);
        });
    });
};

(async () => {
    if (process.argv.length < 3) {
        log('USAGE: yarn run channel-id-or-username');
        return;
    }
    const channel = process.argv[2];
    const infos = await searchChannel(channel, true) || await searchChannel(channel, false);
    if (infos === null) {
        log(`Channel Id or Username '${channel}' not found...`);
        return;
    }
    log(`Found channel '${infos.title}' !\nParse playlist to fetch all videos...`);

    playlistRequest(infos.id, null).then((data) => {
        if (!data) { return; }
        if (!data.length || data.length <= 0) {
            log('No video found on this channel');
            return;
        }
        log(`Found ${data.length} videos on this channel.`);

        const path = `${__dirname}/${infos.title}`;
        if (fs.existsSync(path) || fs.mkdirSync(path)) {
            log(`Cannot create '${path}' directory (maybe already existing).`);
            return;
        }
        log('Start downloading videos.');
        downloadVideo(data, 0, path);
    });
})();
