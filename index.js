const express = require('express');
const axios = require('axios');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

// Configuration
const BOT_TOKEN = '7861502352:AAE6J2zWmfHsDmAIv-SQII8nL7aU5sNLJz8';
const CHANNEL_ID = '-1002145560187'; // or channel ID
const bot = new Telegraf(BOT_TOKEN);

// Cache for search results
let fileCache = [];
let lastCacheUpdate = 0;

// Middleware to update cache
async function updateCache() {
    try {
        const messages = await bot.telegram.getChatHistory(CHANNEL_ID, 100);
        
        fileCache = messages.map(msg => {
            if (msg.document) {
                return {
                    id: msg.message_id,
                    name: msg.document.file_name,
                    type: 'document',
                    caption: msg.caption
                };
            } else if (msg.photo) {
                return {
                    id: msg.message_id,
                    name: `photo_${msg.message_id}.jpg`,
                    type: 'photo',
                    caption: msg.caption
                };
            } else if (msg.video) {
                return {
                    id: msg.message_id,
                    name: msg.video.file_name || `video_${msg.message_id}.mp4`,
                    type: 'video',
                    caption: msg.caption
                };
            } else if (msg.audio) {
                return {
                    id: msg.message_id,
                    name: msg.audio.file_name || `audio_${msg.message_id}.mp3`,
                    type: 'audio',
                    caption: msg.caption
                };
            }
            return null;
        }).filter(Boolean);
        
        lastCacheUpdate = Date.now();
    } catch (error) {
        console.error('Cache update failed:', error);
    }
}

// Search endpoint
app.get('/search', async (req, res) => {
    try {
        // Update cache if older than 5 minutes
        if (Date.now() - lastCacheUpdate > 300000) {
            await updateCache();
        }
        
        const query = req.query.q.toLowerCase();
        const results = fileCache.filter(file => 
            file.name.toLowerCase().includes(query) || 
            (file.caption && file.caption.toLowerCase().includes(query))
        );
        
        res.json(results);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Forward endpoint
app.post('/forward', async (req, res) => {
    try {
        const { fileId, userId } = req.body;
        
        // Forward the message to user
        await bot.telegram.forwardMessage(
            userId, 
            CHANNEL_ID, 
            fileId
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Forward error:', error);
        res.status(500).json({ error: 'Forward failed' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Initial cache update
    updateCache();
});
