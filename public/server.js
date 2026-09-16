const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

function createDeck() {
    let deck = [];
    for (let suit of SUITS) {
        for (let value of VALUES) {
            deck.push({ suit, value });
        }
    }
    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

let players = [];

io.on('connection', (socket) => {
    console.log('لاعب جديد اتصل:', socket.id);

    if (players.length < 4) {
        players.push({ id: socket.id, seat: players.length + 1, hand: [] });
        socket.emit('playerAssigned', { seat: players.length });
    } else {
        socket.emit('roomFull');
        return;
    }

    if (players.length === 4) {
        let deck = shuffle(createDeck());
        players.forEach((player, index) => {
            player.hand = deck.slice(index * 13, (index + 1) * 13);
            io.to(player.id).emit('gameStart', {
                hand: player.hand,
                seat: player.seat
            });
        });
        console.log('تم بدء اللعبة وتوزيع 13 ورقة لكل لاعب.');
    }

    socket.on('disconnect', () => {
        console.log('لاعب قطع الاتصال:', socket.id);
        players = players.filter(p => p.id !== socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`الخادم يعمل حالياً على البورت ${PORT}`);
});