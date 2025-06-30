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
            rooms.set(room, { 
                joueurs: new Map(), 
                currentQuestionIndex: 0, 
                started: false,
                reponsesRecues: new Set(),
                timer: null
            });
        }

        rooms.get(room).joueurs.set(socket.id, { pseudo, score: 0 });

        io.to(room).emit('updatePlayers', [...rooms.get(room).joueurs.values()]);
    });

    socket.on('startQuiz', () => {
        const room = socket.room;
        const salle = rooms.get(room);
        if (!salle.started) {
            salle.started = true;
            salle.currentQuestionIndex = 0;
            envoyerQuestion(room);
        }
    });

    socket.on('submitAnswer', (reponse) => {
        const { room } = socket;
        const salle = rooms.get(room);
        if (!salle) return;
        if (!salle.reponsesRecues) salle.reponsesRecues = new Set();

        // Ne compter qu'une seule réponse par joueur
        if (salle.reponsesRecues.has(socket.id)) return;

        salle.reponsesRecues.add(socket.id);

        const questionActuelle = questions[salle.currentQuestionIndex];
        const joueur = salle.joueurs.get(socket.id);

        if (questionActuelle && reponse.trim().toLowerCase() === questionActuelle.reponse.toLowerCase()) {
            joueur.score += 1;
        }

        io.to(room).emit('updatePlayers', [...salle.joueurs.values()]);

        // SI TOUS LES JOUEURS ONT RÉPONDU, passer à la question suivante tout de suite
        if (salle.reponsesRecues.size === salle.joueurs.size) {
            clearTimeout(salle.timer);
            passerALaQuestionSuivante(room);
        }
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
    if (!salle) return;
    salle.reponsesRecues = new Set(); // Reset pour la nouvelle question

    if (salle.currentQuestionIndex < questions.length) {
        const question = questions[salle.currentQuestionIndex];
        io.to(room).emit('newQuestion', {
            question: question.question,
            numero: salle.currentQuestionIndex + 1,
            choix: question.choix
        });

        // Timer pour passer à la question suivante au bout de 10 secondes
        salle.timer = setTimeout(() => {
            passerALaQuestionSuivante(room);
        }, 10000);
    } else {
        const classement = [...salle.joueurs.values()].sort((a, b) => b.score - a.score);
        io.to(room).emit('endQuiz', classement);
    }
}

function passerALaQuestionSuivante(room) {
    const salle = rooms.get(room);
    if (!salle) return;
    salle.currentQuestionIndex += 1;
    envoyerQuestion(room);
}

server.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}/client.html`);
});
