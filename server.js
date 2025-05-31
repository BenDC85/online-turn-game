// server.js (TEMPORARILY SIMPLIFIED FOR RENDER 502 DEBUGGING)

// require('dotenv').config(); // Dotenv not needed for this simplified version
const express = require('express');
const http = require('http');
const path = require('path');
// const socketIo = require('socket.io'); // Socket.IO removed for now
// const { createClient } = require('@supabase/supabase-js'); // Supabase removed for now

const app = express();
const server = http.createServer(app); // Still create an HTTP server for Express
// const io = socketIo(server); // Socket.IO instance removed

const PORT = process.env.PORT || 3000; // Render will provide this

// Supabase client initialization REMOVED for this test

// Serve static files from the 'public' directory
const publicDirectoryPath = path.join(__dirname, 'public');
app.use(express.static(publicDirectoryPath));

// Basic route to confirm Express is working (optional, but good for direct test)
app.get('/health', (req, res) => {
    res.status(200).send('Healthy: Express server is running!');
});

// Multiplayer Game State Variables REMOVED for this test
// Socket.IO event handlers REMOVED for this test

server.listen(PORT, () => {
    console.log(`Simplified server is running on http://localhost:${PORT}`);
    console.log(`Serving static files from: ${publicDirectoryPath}`);
    console.log(`Attempting to serve index.html. Socket.IO and DB are disabled for this test.`);
});