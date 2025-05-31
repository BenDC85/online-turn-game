// public/client.js

const socket = io({ autoConnect: false }); // Don't connect automatically yet

// Get HTML elements
const joinSection = document.getElementById('join-section');
const gameSection = document.getElementById('game-section');
const userIdInput = document.getElementById('user-id-input');
const joinGameButton = document.getElementById('join-game-button');
const joinMessageParagraph = document.getElementById('join-message');

const socketMessageParagraph = document.getElementById('socket-message');
const playerIdDisplay = document.getElementById('player-id-display');
const userIdConfirmSpan = document.getElementById('user-id-confirm'); // To show entered User ID
const currentTurnDisplay = document.getElementById('current-turn-display');
const takeTurnButton = document.getElementById('take-turn-button');
const messageList = document.getElementById('message-list');

let myPlayerNumber = null;
let myUserId = null;
let isGameReady = false;

console.log('Client-side JavaScript loaded.');

// --- Join Game Logic ---
if (joinGameButton) {
    joinGameButton.addEventListener('click', () => {
        const userId = userIdInput.value.trim();
        if (userId) {
            myUserId = userId; // Store it globally for this client session
            localStorage.setItem('turnGameUserId', userId); // Save for next visit
            
            addMessageToLog(`Attempting to join game as "${userId}"...`);
            socketMessageParagraph.textContent = 'Connecting to server...';
            socket.connect(); // Now connect to the server

            // The server will handle player assignment after connection and 'joinGame' event
        } else {
            joinMessageParagraph.textContent = 'Please enter a User ID.';
        }
    });
}

// --- Try to auto-fill User ID from localStorage ---
const savedUserId = localStorage.getItem('turnGameUserId');
if (savedUserId && userIdInput) {
    userIdInput.value = savedUserId;
}

// --- Socket.IO Event Handlers ---
socket.on('connect', () => {
    console.log('Successfully connected to Socket.IO server! My Socket ID:', socket.id);
    addMessageToLog('Connected to server!');
    if (socketMessageParagraph) {
        socketMessageParagraph.textContent = 'Connected! Sending join request...';
    }
    // After connecting, send the joinGame event with the userId
    if (myUserId) {
        socket.emit('joinGame', myUserId); // Send the chosen User ID
    } else {
        // This case should ideally not happen if connect() is only called after getting userId
        console.error("Connected but no User ID to send. This shouldn't happen.");
        addMessageToLog("Error: Connected but no User ID was set. Please refresh and try joining again.");
    }
});

socket.on('join_success', (playerNumber) => {
    myPlayerNumber = playerNumber;
    console.log(`Successfully joined game. I have been assigned as Player ${myPlayerNumber}`);
    addMessageToLog(`Successfully joined as Player ${myPlayerNumber} (User ID: "${myUserId}").`);

    if (playerIdDisplay) playerIdDisplay.textContent = `Player ${myPlayerNumber}`;
    if (userIdConfirmSpan) userIdConfirmSpan.textContent = myUserId;
    if (socketMessageParagraph) socketMessageParagraph.textContent = `You are Player ${myPlayerNumber}. Waiting for game state...`;
    
    // Hide join section, show game section
    if (joinSection) joinSection.classList.add('hidden');
    if (gameSection) gameSection.classList.remove('hidden');
});

socket.on('join_fail', (message) => {
    console.error('Failed to join game:', message);
    addMessageToLog(`Join failed: ${message}`);
    if (joinMessageParagraph) joinMessageParagraph.textContent = message;
    if (socketMessageParagraph) socketMessageParagraph.textContent = `Join failed. ${message}`;
    myUserId = null; // Clear stored User ID if join failed
    socket.disconnect(); // Disconnect if join failed
});


// 'player_assignment' is now part of 'join_success'
// socket.on('player_assignment', (playerNumber) => { ... }); // This is effectively replaced


socket.on('turn_update', (currentTurnPlayerNumber) => {
    console.log(`Turn update received: It is Player ${currentTurnPlayerNumber}'s turn.`);
    if (currentTurnDisplay) {
        currentTurnDisplay.textContent = currentTurnPlayerNumber;
    }

    if (isGameReady && myPlayerNumber === currentTurnPlayerNumber) {
        if (takeTurnButton) takeTurnButton.disabled = false;
        if (!takeTurnButton.disabled) {
             addMessageToLog("It's your turn!");
        }
    } else {
        if (takeTurnButton) takeTurnButton.disabled = true;
    }
});

socket.on('server_message', (message) => {
    console.log('Message from server:', message);
    addMessageToLog(message);

    if (message.includes('Two players are connected! Game ready')) {
        isGameReady = true;
    } else if (message.includes('Waiting for players') || message.includes('has disconnected.')) {
        isGameReady = false;
        if (takeTurnButton) takeTurnButton.disabled = true;
        if (currentTurnDisplay) currentTurnDisplay.textContent = '?';
    } else if (message.includes('Sorry, the game is currently full')) {
        if (takeTurnButton) takeTurnButton.disabled = true;
        // If the server says it's full, and we're trying to join, it's handled by join_fail.
        // This message might be for already connected players if some logic error occurs server-side.
    }
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected from server. Reason:', reason);
    addMessageToLog(`Disconnected from server: ${reason}.`);
    if (socketMessageParagraph) {
        socketMessageParagraph.textContent = 'Disconnected from server.';
    }
    if (playerIdDisplay) {
        playerIdDisplay.textContent = 'Disconnected';
    }
    if (currentTurnDisplay) {
        currentTurnDisplay.textContent = '?';
    }
    if (takeTurnButton) {
        takeTurnButton.disabled = true;
    }
    
    // Show join section again if disconnected unexpectedly
    if (joinSection && gameSection) { // Make sure elements exist
        if (!joinSection.classList.contains('hidden') || gameSection.classList.contains('hidden')) {
            // If already showing join or game section is hidden, means we probably tried to join and failed or got disconnected early.
            // No need to flip UI if join was never successful.
        } else {
            // If game section was visible, means we were in a game.
             joinSection.classList.remove('hidden');
             gameSection.classList.add('hidden');
             addMessageToLog("Connection lost. Please try joining again.");
        }
    }
    myPlayerNumber = null;
    // myUserId remains so it can be auto-filled if they try to rejoin.
    isGameReady = false;
});

if (takeTurnButton) {
    takeTurnButton.addEventListener('click', () => {
        if (!takeTurnButton.disabled && myPlayerNumber !== null && isGameReady) {
            console.log(`Player ${myPlayerNumber} (User: "${myUserId}") is taking their turn.`);
            socket.emit('takeTurn');
            takeTurnButton.disabled = true;
            addMessageToLog('You took your turn. Waiting for opponent...');
        } else if (!isGameReady){
            addMessageToLog('Cannot take turn: Game is not ready (waiting for opponent).');
        } else {
            addMessageToLog('Cannot take turn: It is not your turn or you are not assigned a player number.');
        }
    });
}

function addMessageToLog(messageText) {
    if (messageList) {
        const li = document.createElement('li');
        const timestamp = new Date().toLocaleTimeString();
        li.textContent = `[${timestamp}] ${messageText}`;
        messageList.appendChild(li);
        messageList.scrollTop = messageList.scrollHeight;
    } else {
        console.log(`[LOG ${new Date().toLocaleTimeString()}] ${messageText}`);
    }
}