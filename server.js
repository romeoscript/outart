const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const { google } = require('googleapis');
const { log } = require('console');
const app = express();
const port = 3000;
const apiKey = 'AIzaSyDgFfQZhNTQOW5J_K81GebJ3fzLqx75OJw';

// Function to get Channel ID from YouTube API
async function getChannelId(youtube, identifier, isUsername = false) {
    console.log(identifier);
    try {
        const response = await youtube.channels.list({
            part: 'snippet,contentDetails,statistics',
            ...(isUsername ? { forUsername: identifier } : { id: identifier })
        });
        console.log(response);
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


app.get('/read-csv', async (req, res) => {
    const results = [];
    const validUrls = [];  // Array to store valid URLs
    const toBeProcessedUrls = [];  // Array to store URLs to be processed
    const invalidUrls = [];  // Array to store invalid URLs
    const youtube = google.youtube({
        version: 'v3',
        auth: apiKey
    });

    fs.createReadStream('art.csv')
        .pipe(csv())
        .on('data', (data) => results.push(data['YouTube Link:']))
        .on('end', async () => {
            for (const url of results) {
                const result = await convertToChannelIdUrl(url, youtube);
                if (result.type === 'valid') {
                    validUrls.push(result.url);
                } else if (result.type === 'toBeProcessed') {
                    toBeProcessedUrls.push(result.url);
                } else {
                    invalidUrls.push(result.url);
                }
            }

            res.json({
                validYoutubeUrls: validUrls,
                toBeProcessedUrls: toBeProcessedUrls,
                invalidUrls: invalidUrls
            });
        });
});
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
