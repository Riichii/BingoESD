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
    lastNumber: null,
    linePrize: "0€",
    bingoPrize: "0€"
};

const ADMIN_TOKEN = "Fiesta26";

io.on('connection', (socket) => {
    // Verificamos si la conexión viene validada como Admin
    const isSocketAdmin = socket.handshake.auth.token === ADMIN_TOKEN;

    // Reducimos logs para no saturar la consola con 1000 personas
    socket.emit('init-state', gameState);

    socket.on('set-prizes', (data) => {
        if (!isSocketAdmin) return;
        gameState.linePrize = data.line;
        gameState.bingoPrize = data.bingo;
        socket.broadcast.emit('update-prizes', data);
    });

    socket.on('draw-number', (number) => {
        if (!isSocketAdmin) return;
        if (!gameState.calledNumbers.includes(number)) {
            gameState.calledNumbers.push(number);
            gameState.lastNumber = number;
            io.emit('number-drawn', number); // Emitimos a todos (incluido admin para confirmar)
        }
    });

    socket.on('unmark-number', (number) => {
        if (!isSocketAdmin) return;
        // Permitir que el admin desmarque números si se equivoca
        gameState.calledNumbers = gameState.calledNumbers.filter(n => n !== number);
        
        // Si el último número fue desmarcado, actualizamos al anterior si existe
        if (gameState.lastNumber === number) {
             gameState.lastNumber = gameState.calledNumbers.length > 0 
                ? gameState.calledNumbers[gameState.calledNumbers.length - 1] 
                : null;
        }
        io.emit('number-unmarked', number);
    });

    socket.on('reset-game', () => {
        if (!isSocketAdmin) return;
        gameState.calledNumbers = [];
        gameState.lastNumber = null;
        io.emit('game-reset');
    });

    // Protección Anti-Caídas: Permite al Admin restaurar la memoria del servidor si este se reinicia
    socket.on('restore-state', (data) => {
        if (!isSocketAdmin) return;
        gameState.calledNumbers = data.calledNumbers || [];
        gameState.lastNumber = data.lastNumber;
        gameState.linePrize = data.linePrize;
        gameState.bingoPrize = data.bingoPrize;
        socket.broadcast.emit('init-state', gameState); // Empuja el estado restaurado a todos los teléfonos invitados
    });

    // Retransmisión de Anuncios (Línea/Bingo)
    socket.on('show-announcement', (data) => {
        if (!isSocketAdmin) return;
        socket.broadcast.emit('show-announcement', data);
    });

    socket.on('hide-announcement', () => {
        if (!isSocketAdmin) return;
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
