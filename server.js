const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const { google } = require('googleapis');
const { log } = require('console');
const multer = require('multer')
const cors = require('cors');
const app = express();
const port = 4000;
const path = require('path')
const apiKey = 'AIzaSyDgFfQZhNTQOW5J_K81GebJ3fzLqx75OJw';

const upload = multer({dest: 'uploads/'})

app.use(cors());

// Function to get Channel ID from YouTube API
async function getChannelId(youtube, identifier, isUsername = false) {
    console.log(identifier);
    try {
        const response = await youtube.channels.list({
            part: 'snippet,contentDetails,statistics',
            ...(isUsername ? { forUsername: identifier } : { id: identifier })
        });

        if (response.data.items && response.data.items.length > 0) {
            const channel = response.data.items[0];
            return channel ? channel.id : null;
        } else {
            console.log(`No channel found for identifier: ${identifier}`);
            return null;
        }
    } catch (error) {
        console.error('Error fetching channel ID:', error);
        return null;
    }
}

function isValidYoutubeUrl(url) {
    return url && url.startsWith('http') && url.includes('youtube.com/');
}

async function convertToChannelIdUrl(url, youtube) {
    try {
        if (!isValidYoutubeUrl(url)) {
            console.log(`Invalid URL skipped: ${url}`);
            return { type: 'invalid', url };
        }

        const urlObj = new URL(url);
        let channelId = null;
        let isUsernameUrl = false;

        if (urlObj.pathname.startsWith('/channel/')) {
            channelId = urlObj.pathname.split('/channel/')[1];
        } else if (urlObj.pathname.startsWith('/user/') || urlObj.pathname.startsWith('/@')) {
            let username = urlObj.pathname.split('/').pop();
            if (username.startsWith('@')) {
                username = username.substring(1)
            }
            channelId = await getChannelId(youtube, username, true);
            isUsernameUrl = true;
        }

        if (channelId) {
            return { type: 'valid', url: `https://www.youtube.com/channel/${channelId}` };
        } else if (isUsernameUrl) {
            return { type: 'toBeProcessed', url };
        } else {
            return { type: 'invalid', url };  // Handle other URL formats
        }
    } catch (error) {
        console.error('Error processing URL:', error);
        return { type: 'invalid', url }; // Mark as invalid URL
    }
}

async function getLatestVideos(youtube, channelId) {
    try {
        const response = await youtube.search.list({
            part: 'snippet',
            channelId: channelId,
            maxResults: 5,
            order: 'date' // Sort by date to get the latest videos
        });

        return response.data.items.map(item => `https://www.youtube.com/watch?v=${item.id.videoId}`);
    } catch (error) {
        console.error('Error fetching latest videos:', error);
        return [];
    }
}
app.post('/upload-csv',  cors(), upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const filePath = path.join(__dirname, req.file.path);
    const results = [];
    const youtube = google.youtube({ version: 'v3', auth: apiKey });

    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data['YouTube Link:']))
        .on('end', async () => {
            const channelsData = [];

            for (const url of results) {
                const result = await convertToChannelIdUrl(url, youtube);
                if (result.type === 'valid') {
                    const latestVideos = await getLatestVideos(youtube, result.url.split('/channel/')[1]);
                    channelsData.push({
                        channelUrl: result.url,
                        latestVideos: latestVideos
                    });
                }
                // Process 'toBeProcessed' and 'invalid' URLs as needed
            }

            // Optionally, delete the file after processing
            fs.unlinkSync(filePath);

            res.json({ channelsData });
        });
});


app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
