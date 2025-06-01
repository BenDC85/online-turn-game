// server.js

require('dotenv').config();
const express = require('express');
const http =require('http');
const path = require('path');
const socketIo = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("CRITICAL ERROR: Supabase URL or Key is missing. Make sure .env file is set up correctly.");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);
console.log("Supabase client initialized.");

const publicDirectoryPath = path.join(__dirname, 'public');
app.use(express.static(publicDirectoryPath));

let players = {}; 
let playerSockets = {};
let nextPlayerNumber = 1;
const MAX_PLAYERS = 2;
let currentPlayerTurn = 1;
let gameReady = false;

io.on('connection', (socket) => {
    console.log(`--- Client connected: ${socket.id} (Awaiting User ID for join) ---`);

    socket.on('joinGame', async (userId) => {
        console.log(`Socket ${socket.id} attempting to join game with User ID: "${userId}"`);

        if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
            console.log(`Join attempt failed for socket ${socket.id}: Invalid User ID.`);
            socket.emit('join_fail', 'Invalid User ID provided.');
            socket.disconnect(true);
            return;
        }
        
        const trimmedUserId = userId.trim();

        for (const id in players) {
            if (players[id].userId === trimmedUserId) {
                console.log(`Join attempt failed for socket ${socket.id} (User ID: "${trimmedUserId}"): User ID already in an active game session.`);
                socket.emit('join_fail', 'This User ID is already in the game. Try a different ID or wait.');
                socket.disconnect(true);
                return;
            }
        }

        if (Object.keys(players).length >= MAX_PLAYERS) {
            console.log(`Game full. Denying join for User ID "${trimmedUserId}" (Socket: ${socket.id}).`);
            socket.emit('join_fail', 'Sorry, the game is currently full.');
            socket.disconnect(true);
            return;
        }

        let assignedPlayerNumber = nextPlayerNumber;
        players[socket.id] = { playerNumber: assignedPlayerNumber, userId: trimmedUserId };
        playerSockets[assignedPlayerNumber] = socket;
        nextPlayerNumber++;

        console.log(`Socket ${socket.id} successfully joined as Player ${assignedPlayerNumber} with User ID: "${trimmedUserId}".`);
        socket.emit('join_success', assignedPlayerNumber);
        io.emit('server_message', `Player ${assignedPlayerNumber} (User: "${trimmedUserId}") has joined the game.`);

        if (Object.keys(players).length === MAX_PLAYERS) {
            gameReady = true;
            currentPlayerTurn = 1;
            const p1SocketId = playerSockets[1]?.id;
            const p1UserId = players[p1SocketId]?.userId || 'P1';
            console.log('Two players connected. Game is now ready. Player 1 starts.');
            io.emit('server_message', `Two players are connected! Game ready. Player 1 (User: "${p1UserId}") it is your turn.`);
            io.emit('turn_update', currentPlayerTurn);
        } else {
            gameReady = false;
            io.emit('server_message', 'Waiting for another player to join...');
        }
    });

    socket.on('takeTurn', async () => {
        const playerData = players[socket.id];
        if (!playerData) {
            socket.emit('server_message', "Error: You don't seem to be registered in the game. Please rejoin.");
            return;
        }
        const actingPlayerNumber = playerData.playerNumber;
        const actingUserId = playerData.userId;

        if (!gameReady) {
            socket.emit('server_message', 'Cannot take turn: The game is not ready (waiting for opponent).');
            return;
        }

        if (actingPlayerNumber === currentPlayerTurn) {
            console.log(`Player ${actingPlayerNumber} (User: "${actingUserId}") took their turn. Attempting to update database.`);
            
            const { error: rpcError } = await supabase.rpc('increment_turn_count', {
                user_profile_id: actingUserId 
            });

            if (rpcError) {
                console.error(`Database RPC Error for user "${actingUserId}":`, rpcError.message);
                io.emit('server_message', `Player ${actingPlayerNumber} (User: "${actingUserId}") took turn. (DB update issue: ${rpcError.message})`);
            } else {
                console.log(`Successfully updated turn count for User ID: "${actingUserId}" in database.`);
                io.emit('server_message', `Player ${actingPlayerNumber} (User: "${actingUserId}") finished their turn. Turn recorded.`);
            }
            
            currentPlayerTurn = (currentPlayerTurn === 1) ? 2 : 1;
            
            io.emit('turn_update', currentPlayerTurn);
            const nextPlayerSocketId = playerSockets[currentPlayerTurn]?.id;
            const nextPlayerUserId = players[nextPlayerSocketId]?.userId || `P${currentPlayerTurn}`;
            io.emit('server_message', `It is now Player ${currentPlayerTurn} (User: "${nextPlayerUserId}")'s turn.`);
            console.log(`Turn switched. It is now Player ${currentPlayerTurn}'s turn.`);
        } else {
            socket.emit('server_message', 'It is not your turn!');
        }
    });

    socket.on('disconnect', () => {
        const disconnectedPlayerData = players[socket.id];
        let disconnectedPlayerNumber = null;
        let disconnectedUserId = 'Unknown User';

        if (disconnectedPlayerData) {
            disconnectedPlayerNumber = disconnectedPlayerData.playerNumber;
            disconnectedUserId = disconnectedPlayerData.userId;
        }
        
        console.log(`--- Client disconnected: ${socket.id} (was Player ${disconnectedPlayerNumber || 'N/A'}, User: "${disconnectedUserId}") ---`);

        if (disconnectedPlayerNumber) {
            delete players[socket.id];
            delete playerSockets[disconnectedPlayerNumber];
            
            io.emit('server_message', `Player ${disconnectedPlayerNumber} (User: "${disconnectedUserId}") has disconnected.`);
            gameReady = false;

            const remainingPlayerSocketIds = Object.keys(players);
            if (remainingPlayerSocketIds.length === 1) {
                const soleRemainingSocketId = remainingPlayerSocketIds[0];
                const remainerData = players[soleRemainingSocketId];
                
                players[soleRemainingSocketId] = { playerNumber: 1, userId: remainerData.userId };
                playerSockets[1] = playerSockets[remainerData.playerNumber];

                if (remainerData.playerNumber === 2) {
                    delete playerSockets[2];
                }
                
                const p1Socket = playerSockets[1];
                if (p1Socket) {
                    p1Socket.emit('join_success', 1);
                }
                
                io.emit('server_message', `Previous Player ${remainerData.playerNumber} (User: "${remainerData.userId}") is now Player 1. Waiting for a new Player 2.`);
                console.log(`Player ${remainerData.playerNumber} (User: "${remainerData.userId}", Socket: ${soleRemainingSocketId}) is now Player 1.`);
                nextPlayerNumber = 2;
            } else {
                console.log('No players left. Resetting for new game.');
                nextPlayerNumber = 1;
            }
            
            currentPlayerTurn = 1;
            io.emit('turn_update', currentPlayerTurn);
            io.emit('server_message', 'Waiting for players...');
        } else {
            console.log(`Socket ${socket.id} disconnected but was not an active player.`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Socket.IO is attached and listening.');
    if (supabaseUrl && supabaseKey) {
        console.log('Supabase client is configured and ready.');
    } else {
        console.warn('Supabase URL/Key NOT DETECTED. Database features will fail.');
    }
    console.log('Waiting for client connections...');
});