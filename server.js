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
let currentTurn = 1;
let kingSeat = 1;
let selectedContract = null;
let tableCards = [];
let trixBoard = { 'Hearts': [], 'Diamonds': [], 'Clubs': [], 'Spades': [] };
let finishedRank = [];

function evaluateTrick(cards) {
    const leadSuit = cards[0].card.suit;
    let winningCard = cards[0];

    for (let i = 1; i < cards.length; i++) {
        if (cards[i].card.suit === leadSuit && cards[i].card.value > winningCard.card.value) {
            winningCard = cards[i];
        }
    }
    return winningCard.seat;
}

io.on('connection', (socket) => {
    if (players.length < 4) {
        const seat = players.length + 1;
        players.push({ id: socket.id, seat: seat, hand: [], score: 0 });
        socket.emit('playerAssigned', { seat: seat });
    } else {
        socket.emit('roomFull');
        return;
    }

    if (players.length === 4) {
        startNewKingdom();
    }

    function startNewKingdom() {
        let deck = shuffle(createDeck());
        currentTurn = kingSeat;
        selectedContract = null;
        tableCards = [];
        trixBoard = { 'Hearts': [], 'Diamonds': [], 'Clubs': [], 'Spades': [] };
        finishedRank = [];

        players.forEach((player, index) => {
            player.hand = deck.slice(index * 13, (index + 1) * 13);
            io.to(player.id).emit('gameStart', {
                hand: player.hand,
                seat: player.seat,
                kingSeat: kingSeat,
                scores: players.map(p => ({ seat: p.seat, score: p.score }))
            });
        });
    }

    socket.on('selectContract', (contract) => {
        const player = players.find(p => p.id === socket.id);
        if (!player || player.seat !== kingSeat) return;

        selectedContract = contract;
        io.emit('contractSelected', {
            contract: selectedContract,
            kingSeat: kingSeat,
            currentTurn: currentTurn
        });
    });

    socket.on('playCard', (card) => {
        const player = players.find(p => p.id === socket.id);
        if (!player || player.seat !== currentTurn || !selectedContract) return;

        if (selectedContract === 'Trix') {
            player.hand = player.hand.filter(c => !(c.suit === card.suit && c.value === card.value));
            trixBoard[card.suit].push(card.value);
            trixBoard[card.suit].sort((a, b) => a - b);

            if (player.hand.length === 0 && !finishedRank.includes(player.seat)) {
                finishedRank.push(player.seat);
                const points = [200, 150, 100, 50];
                player.score += points[finishedRank.length - 1];
            }

            advanceTurn();

            io.emit('trixUpdated', {
                trixBoard: trixBoard,
                currentTurn: currentTurn,
                scores: players.map(p => ({ seat: p.score, score: p.score }))
            });
            return;
        }

        player.hand = player.hand.filter(c => !(c.suit === card.suit && c.value === card.value));
        tableCards.push({ card, seat: player.seat });

        if (tableCards.length === 4) {
            const winnerSeat = evaluateTrick(tableCards);
            const winner = players.find(p => p.seat === winnerSeat);

            if (selectedContract === 'KingOfHearts') {
                if (tableCards.some(tc => tc.card.suit === 'Hearts' && tc.card.value === 13)) winner.score -= 75;
            } else if (selectedContract === 'Queens') {
                const queensCount = tableCards.filter(tc => tc.card.value === 12).length;
                winner.score -= (queensCount * 25);
            } else if (selectedContract === 'Diamonds') {
                const diamondsCount = tableCards.filter(tc => tc.card.suit === 'Diamonds').length;
                winner.score -= (diamondsCount * 10);
            } else if (selectedContract === 'Tricks') {
                winner.score -= 15;
            }

            io.emit('trickComplete', {
                tableCards: tableCards,
                winnerSeat: winnerSeat,
                nextTurn: winnerSeat,
                scores: players.map(p => ({ seat: p.seat, score: p.score }))
            });

            currentTurn = winnerSeat;
            tableCards = [];
        } else {
            currentTurn = (currentTurn % 4) + 1;
            io.emit('cardPlayed', {
                playedCard: card,
                playedBy: player.seat,
                currentTurn: currentTurn,
                tableCards: tableCards
            });
        }
    });

    socket.on('passTrixTurn', () => {
        if (selectedContract === 'Trix' && players.find(p => p.id === socket.id)?.seat === currentTurn) {
            advanceTurn();
            io.emit('trixUpdated', {
                trixBoard: trixBoard,
                currentTurn: currentTurn,
                scores: players.map(p => ({ seat: p.seat, score: p.score }))
            });
        }
    });

    function advanceTurn() {
        do {
            currentTurn = (currentTurn % 4) + 1;
        } while (finishedRank.includes(currentTurn) && finishedRank.length < 4);
    }

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (players.length === 0) kingSeat = 1;
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`الخادم يعمل حالياً على البورت ${PORT}`);
});