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
  res.status(200).json({ 
    status: 'healthy',
    cacheCount: movieCache.length,
    lastUpdated: lastCacheUpdate
  });
});

// Enhanced movie detection
function isMovieFile(msg) {
  const hasMedia = msg.document || msg.video || msg.photo || msg.audio;
  if (!hasMedia) return false;

  const caption = (msg.caption || '').toLowerCase();
  const filename = (
    msg.document?.file_name || 
    msg.video?.file_name || 
    msg.audio?.file_name ||
    `photo_${msg.message_id}.jpg`
  ).toLowerCase();

  // Match patterns for movies
  const isMovie = (
    /\b(movie|film|video|hippi|cinema)\b/.test(filename) ||
    /\b(movie|film|video|hippi|cinema)\b/.test(caption) ||
    /\b(19|20)\d{2}\b/.test(filename) ||  // Year match
    /\b(19|20)\d{2}\b/.test(caption)      // Year match
  );

  return isMovie;
}

// Fetch all movie files from channel
async function updateMovieCache() {
  try {
    console.log('Updating movie cache...');
    const messages = await bot.telegram.getChatHistory(CHANNEL_ID, 200); // Increased limit
    
    movieCache = messages
      .filter(isMovieFile)
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
          fileId = msg.photo[msg.photo.length - 1].file_id;
          fileName = `photo_${msg.message_id}.jpg`;
        } else if (msg.audio) {
          fileType = 'audio';
          fileId = msg.audio.file_id;
          fileName = msg.audio.file_name || `audio_${msg.message_id}.mp3`;
        }
        
        return {
          id: msg.message_id,
          fileId,
          type: fileType,
          name: fileName,
          caption: msg.caption,
          date: new Date(msg.date * 1000).toLocaleDateString()
        };
      });
    
    lastCacheUpdate = new Date();
    console.log(`Cache updated with ${movieCache.length} movies`);
    return true;
  } catch (error) {
    console.error('Cache update failed:', error);
    return false;
  }
}

// Search endpoint with improved matching
app.get('/api/movies', async (req, res) => {
  try {
    const { query, forceUpdate } = req.query;
    
    // Update cache if forced or older than 1 hour
    if (forceUpdate || !lastCacheUpdate || (new Date() - lastCacheUpdate) > 3600000) {
      await updateMovieCache();
    }
    
    // Normalize search for flexible matching
    const normalize = str => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const searchTerm = normalize(query);
    
    const results = searchTerm 
      ? movieCache.filter(movie => {
          const movieName = normalize(movie.name);
          const movieCaption = normalize(movie.caption);
          return (
            movieName.includes(searchTerm) ||
            movieCaption.includes(searchTerm) ||
            searchTerm.includes(movieName) ||
            searchTerm.includes(movieCaption)
          );
        })
      : movieCache;
    
    res.json({
      success: true,
      data: results,
      count: results.length,
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
    
    // Forward the message
    await bot.telegram.forwardMessage(userId, CHANNEL_ID, parseInt(movieId));
    
    res.json({ 
      success: true,
      message: 'Movie forwarded successfully'
    });
    
  } catch (error) {
    console.error('Forward error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Debug endpoint (disable in production)
app.get('/api/debug', async (req, res) => {
  try {
    const messages = await bot.telegram.getChatHistory(CHANNEL_ID, 50);
    const simplified = messages.map(msg => ({
      id: msg.message_id,
      type: msg.document ? 'document' : 
            msg.video ? 'video' : 
            msg.photo ? 'photo' : 
            msg.audio ? 'audio' : 'other',
      name: msg.document?.file_name || 
            msg.video?.file_name || 
            msg.audio?.file_name ||
            `photo_${msg.message_id}.jpg`,
      caption: msg.caption,
      isMovie: isMovieFile(msg),
      date: new Date(msg.date * 1000).toLocaleString()
    }));
    
    res.json({
      channel: CHANNEL_ID,
      count: messages.length,
      movies: simplified.filter(m => m.isMovie),
      allMessages: simplified
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  try {
    await bot.launch();
    console.log('Telegram bot started');
    
    // Initial cache update
    await updateMovieCache();
  } catch (error) {
    console.error('Startup error:', error);
  }
});

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  bot.stop();
  process.exit(0);
});
