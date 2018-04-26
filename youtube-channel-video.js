const rp = require('request-promise');
const fs = require('fs');
const ytdl = require('ytdl-core');
const API_KEY = require('./api-key');
const { spawn } = require('child_process');

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

const getDisplaySize = (size, index) => {
    const i = index || 0;
    const suffixes = ['B', 'KB', 'MB', 'GB'];

    if (size < (i + 1) * 1024) {
        return `${size.toFixed(2)} ${suffixes[i]}`;
    }
    return getDisplaySize(size / 1024, i + 1);
};

const displayPourcentage = (isVideo, pos, size) => {
    if (!size || size <= 0) {
        return;
    }
    const percent = `${((pos / size) * 100).toFixed(2)}%`;
    process.stdout.cursorTo(0);
    process.stdout.clearLine(1);
    process.stdout.write(`\t[${isVideo ? 'Video' : 'Audio'}] Progression: ${
        size === pos ? 'Done' : percent
    } (${getDisplaySize(size)})${size === pos ? '\n' : ''}`);
};

const downloadPart = (isVideo, elem, path) => new Promise((resolve, reject) => {
    const file = `${path}/${elem.title}_${isVideo ? 'video' : 'audio'}only.${isVideo ? 'mp4' : 'm4a'}`;
    const video = ytdl(elem.url, {
        filter: format => format.container === (isVideo ? 'mp4' : 'm4a'),
        quality: (isVideo ? 'highestvideo' : 'highestaudio'),
    });
    video.on('error', reject);
    video.on('end', () => resolve(file));
    video.on('progress', (chunk, downloaded, len) => {
        displayPourcentage(isVideo, downloaded, len);
    });
    video.pipe(fs.createWriteStream(file));
});

const mergeParts = (videoFile, audioFile, outputFile) => new Promise((resolve, reject) => {
    spawn('ffmpeg', [
        '-i', videoFile,
        '-i', audioFile,
        '-c', 'copy',
        outputFile,
    ]).on('close', (code) => {
        if (code === 0) {
            resolve();
        } else {
            reject(new Error('Cannot merge video and audio files..'));
        }
    });
});

const downloadVideo = async (data, index, path) => {
    if (index >= data.length) {
        log('Finish downloading all videos!!');
        return;
    }
    const elem = data[index];
    log(`[${parseInt(index, 10) + 1}/${data.length}] ${elem.title}`);

    try {
        const videoFile = await downloadPart(true, elem, path);
        const audioFile = await downloadPart(false, elem, path);
        const outputFile = `${path}/${elem.title}.mp4`;
        await mergeParts(videoFile, audioFile, outputFile);
        log(`Video merged and saved into ${outputFile}`);

        await fs.unlinkSync(videoFile);
        await fs.unlinkSync(audioFile);
        downloadVideo(data, index + 1, path);
    } catch (err) {
        log(`An error occurs: ${err}`);
        downloadVideo(data, index + 1, path);
    }
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
