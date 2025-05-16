const express = require('express');
const axios = require('axios');
const { Telegraf } = require('telegraf');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram Bot Setup
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const DB_CHANNEL_ID = process.env.DB_CHANNEL_ID;

// Cache for movie data
let movieCache = [];
let lastCacheUpdate = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes in milliseconds

// Middleware
app.use(express.json());

/**
 * Fetch all movies from Telegram channel and cache them
 */
async function fetchAndCacheMovies() {
    try {
        console.log('Fetching movies from Telegram channel...');
        
        const messages = await bot.telegram.getChatHistory(DB_CHANNEL_ID, 0, 100);
        const movies = [];

        for (const message of messages) {
            if (message.document || message.video) {
                const file = message.document || message.video;
                const movieInfo = extractMovieInfo(file.file_name);
                
                movies.push({
                    title: movieInfo.title,
                    year: movieInfo.year,
                    quality: movieInfo.quality,
                    fileId: file.file_id,
                    messageId: message.message_id,
                    link: `https://t.me/${bot.context.botInfo.username}?start=get-${message.message_id}`
                });
            }
        }

        movieCache = movies;
        lastCacheUpdate = Date.now();
        console.log(`Cached ${movies.length} movies`);
        return movies;
    } catch (error) {
        console.error('Error fetching movies:', error);
        throw error;
    }
}

/**
 * Extract movie info from filename
 */
function extractMovieInfo(filename) {
    // Example patterns:
    // "Movie Name (2023) [1080p].mkv"
    // "Movie.Name.2023.1080p.WEB-DL.x264.mkv"
    const patterns = [
        /^(.*?)\s*\((\d{4})\)\s*(?:\[([^\]]+)\])?/i,  // Match "Title (Year) [Quality]"
        /^(.*?)[\.\s](\d{4})[\.\s]([^\s\.]+)/i       // Match "Title.Year.Quality"
    ];

    for (const pattern of patterns) {
        const match = filename.match(pattern);
        if (match) {
            return {
                title: match[1].replace(/\./g, ' ').trim(),
                year: match[2],
                quality: match[3] || 'Unknown'
            };
        }
    }

    // Fallback if no pattern matches
    return {
        title: filename.replace(/\.[^/.]+$/, ""), // Remove extension
        year: 'Unknown',
        quality: 'Unknown'
    };
}

/**
 * Search movies in cache
 */
function searchMovies(query) {
    const normalizedQuery = query.toLowerCase();
    return movieCache.filter(movie => 
        movie.title.toLowerCase().includes(normalizedQuery) ||
        movie.year.toLowerCase().includes(normalizedQuery)
    );
}

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        service: 'Movie Search API',
        endpoints: {
            search: '/search?q=:query',
            movies: '/movies'
        }
    });
});

/**
 * Search endpoint
 */
app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        
        if (!query) {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }

        // Refresh cache if stale
        if (Date.now() - lastCacheUpdate > CACHE_TTL) {
            await fetchAndCacheMovies();
        }

        const results = searchMovies(query);
        
        res.json({
            query,
            count: results.length,
            results: results.map(movie => ({
                title: movie.title,
                year: movie.year,
                quality: movie.quality,
                download_link: movie.link
            }))
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get all movies endpoint
 */
app.get('/movies', async (req, res) => {
    try {
        // Refresh cache if stale
        if (Date.now() - lastCacheUpdate > CACHE_TTL) {
            await fetchAndCacheMovies();
        }
        
        res.json({
            count: movieCache.length,
            movies: movieCache
        });
    } catch (error) {
        console.error('Error getting movies:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Initialize cache on startup
fetchAndCacheMovies().catch(console.error);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Search endpoint: http://localhost:${PORT}/search?q=:query`);
});
