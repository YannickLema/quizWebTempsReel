const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const questions = JSON.parse(fs.readFileSync('questions.json', 'utf-8'));

app.use(express.static('public'));

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('✅ Un joueur s’est connecté');

    socket.on('joinRoom', ({ pseudo, room }) => {
        socket.join(room);
        socket.pseudo = pseudo;
        socket.room = room;

        if (!rooms.has(room)) {
            rooms.set(room, { joueurs: new Map(), currentQuestionIndex: 0, started: false });
        }

        rooms.get(room).joueurs.set(socket.id, { pseudo, score: 0 });

        io.to(room).emit('updatePlayers', [...rooms.get(room).joueurs.values()]);
    });

    socket.on('startQuiz', () => {
        const room = socket.room;
        if (!rooms.get(room).started) {
            rooms.get(room).started = true;
            envoyerQuestion(room);
        }
    });

    socket.on('submitAnswer', (reponse) => {
        const { room, pseudo } = socket;
        const salle = rooms.get(room);
        const questionActuelle = questions[salle.currentQuestionIndex];
        const joueur = salle.joueurs.get(socket.id);

        if (questionActuelle && reponse.trim().toLowerCase() === questionActuelle.reponse.toLowerCase()) {
            joueur.score += 1;
        }

        io.to(room).emit('updatePlayers', [...salle.joueurs.values()]);
    });

    socket.on('disconnect', () => {
        const { room } = socket;
        if (rooms.has(room)) {
            rooms.get(room).joueurs.delete(socket.id);
            io.to(room).emit('updatePlayers', [...rooms.get(room).joueurs.values()]);
            console.log('❌ Un joueur déconnecté');
        }
    });
});

function envoyerQuestion(room) {
    const salle = rooms.get(room);
    if (salle.currentQuestionIndex < questions.length) {
        const question = questions[salle.currentQuestionIndex];
        io.to(room).emit('newQuestion', {
            question: question.question,
            numero: salle.currentQuestionIndex + 1,
            choix: question.choix
        });


        setTimeout(() => {
            salle.currentQuestionIndex += 1;
            envoyerQuestion(room);
        }, 20000); // 20 secondes
    } else {
        const classement = [...salle.joueurs.values()].sort((a, b) => b.score - a.score);
        io.to(room).emit('endQuiz', classement);
    }
}

server.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}/client.html`);
});
