require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Telegram Bot
const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;

// Cache for movie files
let movieCache = [];
let lastCacheUpdate = null;

// Health check endpoint
app.get('/_health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Fetch all movie files from channel
async function updateMovieCache() {
  try {
    const messages = await bot.telegram.getChatHistory(CHANNEL_ID, 100);
    
    movieCache = messages
      .filter(msg => {
        // Check if message contains a media file with "movie" in caption/filename
        const hasMedia = msg.document || msg.video || msg.photo;
        const caption = msg.caption || '';
        const filename = msg.document?.file_name || msg.video?.file_name || '';
        
        return hasMedia && (caption.toLowerCase().includes('movie') || 
                          filename.toLowerCase().includes('movie'));
      })
      .map(msg => {
        let fileType, fileId, fileName;
        
        if (msg.document) {
          fileType = 'document';
          fileId = msg.document.file_id;
          fileName = msg.document.file_name;
        } else if (msg.video) {
          fileType = 'video';
          fileId = msg.video.file_id;
          fileName = msg.video.file_name;
        } else if (msg.photo) {
          fileType = 'photo';
          fileId = msg.photo[msg.photo.length - 1].file_id; // Highest quality
          fileName = `photo_${msg.message_id}.jpg`;
        }
        
        return {
          id: msg.message_id,
          fileId,
          type: fileType,
          name: fileName,
          caption: msg.caption,
          date: new Date(msg.date * 1000).toISOString()
        };
      });
    
    lastCacheUpdate = new Date();
    return true;
  } catch (error) {
    console.error('Cache update failed:', error);
    return false;
  }
}

// Search endpoint
app.get('/api/movies', async (req, res) => {
  try {
    const { query } = req.query;
    
    // Update cache if older than 1 hour or empty
    if (!lastCacheUpdate || (new Date() - lastCacheUpdate) > 3600000) {
      await updateMovieCache();
    }
    
    // Filter movies by search query
    const results = query 
      ? movieCache.filter(movie => 
          movie.name.toLowerCase().includes(query.toLowerCase()) || 
          (movie.caption && movie.caption.toLowerCase().includes(query.toLowerCase()))
        )
      : movieCache;
    
    res.json({
      success: true,
      data: results,
      lastUpdated: lastCacheUpdate
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Forward movie to user
app.post('/api/request-movie', async (req, res) => {
  try {
    const { movieId, userId } = req.body;
    
    if (!movieId || !userId) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing movieId or userId' 
      });
    }
    
    // Forward the message to user
    await bot.telegram.forwardMessage(
      userId,
      CHANNEL_ID,
      parseInt(movieId)
    );
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Forward error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  bot.launch();
  console.log('Telegram bot started');
  
  // Initial cache update
  updateMovieCache().then(success => {
    console.log(success ? 'Cache updated successfully' : 'Cache update failed');
  });
});
