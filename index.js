require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

// Health check endpoint - REQUIRED for Render
app.get('/_health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    message: 'Telegram Media Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Sample API endpoint
app.get('/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    // In a real implementation, you would search your Telegram channel here
    const mockResults = [
      {
        id: 'msg_001',
        name: `${query} Movie Poster.jpg`,
        type: 'photo',
        caption: `Official ${query} movie poster`
      },
      {
        id: 'msg_002',
        name: `${query} Trailer.mp4`,
        type: 'video',
        caption: `Official ${query} trailer`
      }
    ];

    res.json(mockResults);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Initialize Telegram Bot (if token exists)
if (process.env.BOT_TOKEN) {
  const bot = new Telegraf(process.env.BOT_TOKEN);
  
  bot.command('start', (ctx) => {
    ctx.reply('Welcome to the Media Search Bot!');
  });

  bot.launch();
  console.log('Telegram bot started');
} else {
  console.warn('No BOT_TOKEN provided - Telegram bot disabled');
}

// Server startup
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/_health`);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});
