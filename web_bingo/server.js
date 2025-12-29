import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Optimizaciones para alta carga (Fiestas del pueblo)
app.use(compression()); // Reduce el tamaño de los datos enviados (Gzip)
app.use(cors());

// Servir los archivos compilados de la web (Carpeta dist)
app.use(express.static(path.join(__dirname, 'dist')));

const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Ajustes para manejar 1000+ conexiones
    pingTimeout: 60000,
    pingInterval: 25000
});

let gameState = {
    calledNumbers: [],
    lastNumber: null
};

io.on('connection', (socket) => {
    // Reducimos logs para no saturar la consola con 1000 personas
    socket.emit('init-state', gameState);

    socket.on('draw-number', (number) => {
        if (!gameState.calledNumbers.includes(number)) {
            gameState.calledNumbers.push(number);
            gameState.lastNumber = number;
            io.emit('number-drawn', number); // Emitimos a todos (incluido admin para confirmar)
        }
    });

    socket.on('reset-game', () => {
        gameState = { calledNumbers: [], lastNumber: null };
        io.emit('game-reset');
    });

    // Retransmisión de Anuncios (Línea/Bingo)
    socket.on('show-announcement', (data) => {
        socket.broadcast.emit('show-announcement', data);
    });

    socket.on('hide-announcement', () => {
        socket.broadcast.emit('hide-announcement');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
    =============================================
    🚀 BINGO ESD - MODO FIESTAS ACTIVADO
    🌎 Servidor unificado en puerto: ${PORT}
    📈 Optimizado para 1000+ personas
    =============================================
    `);
});
