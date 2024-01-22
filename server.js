const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const multer = require('multer');
const cors = require('cors');
const officegen = require('officegen');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const port = 4000;
const upload = multer({ dest: 'uploads/' });
const youtube = google.youtube({ version: 'v3', auth: 'AIzaSyDJ0TgnGyTgVLeGogPQu3LugEEMpZx4inc' }); // Replace with your API Key

app.use(cors());

function isValidYoutubeChannelUrl(url) {
    const urlPattern = /^https:\/\/www\.youtube\.com\/channel\/UC[a-zA-Z0-9_-]+$/;
    return urlPattern.test(url);
}

async function getLatestVideos(channelId) {
    try {
        const response = await youtube.search.list({
            part: 'snippet',
            channelId: channelId,
            maxResults: 5,
            order: 'date'
        });

        return response.data.items.map(item => `https://www.youtube.com/watch?v=${item.id.videoId}`);
    } catch (error) {
        console.error('Error fetching latest videos:', error);
        return [];
    }
}

app.post('/upload-csv', cors(), upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const filePath = path.join(__dirname, req.file.path);
    const results = [];

    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data['YouTube Link:']))
        .on('end', async () => {
            const channelsData = [];

            for (const url of results) {
                if (isValidYoutubeChannelUrl(url)) {
                    const channelId = url.split('/channel/')[1];
                    const latestVideos = await getLatestVideos(channelId);
                    channelsData.push({
                        channelUrl: url,
                        latestVideos: latestVideos
                    });
                }
            }

            // Generate Word document
            const docx = officegen('docx');
            channelsData.forEach(channel => {
                let pObj = docx.createP();
                pObj.addText(`Channel URL: ${channel.channelUrl}`, { bold: true });

                if (channel.latestVideos.length > 0) {
                    channel.latestVideos.forEach(video => {
                        pObj = docx.createP();
                        pObj.addText(video);
                    });
                } else {
                    pObj = docx.createP();
                    pObj.addText('No latest videos available');
                }
            });

            docx.generate(res, {
                'finalize': function (written) {
                    console.log('Finish to create a Word file.');
                },
                'error': function (err) {
                    console.log(err);
                }
            });

            // Optionally, delete the uploaded CSV file
            fs.unlinkSync(filePath);
        });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
