import './style.css'
import { io } from "socket.io-client";

const urlParams = new URLSearchParams(window.location.search);
const isAdmin = urlParams.get('admin') === '1' ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

// Conexión al servidor de sincronización (Automática por host)
const socket = io();

if (!isAdmin) {
  document.body.classList.add('is-guest');
}

class BingoEngine {
  constructor() {
    this.calledNumbers = [];
    this.buttons = {};
    this.audio = new Audio();
    this.volume = 0.5;
    this.audioQueue = [];
    this.isPlaying = false;
    this.currentPlayingNumber = null;
    this.isAdmin = isAdmin;

    // Configuración de eventos de audio
    this.audio.onended = () => {
      this.isPlaying = false;
      this.currentPlayingNumber = null;
      this.processAudioQueue();
    };

    // DOM Elements (Matches index.html exactly)
    this.boardEl = document.getElementById('bingoBoard');
    this.lastNumberEl = document.getElementById('lastNumber');
    this.historyEl = document.getElementById('history');
    this.drawBtn = document.getElementById('drawBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.volumeSlider = document.getElementById('volumeSlider');
    this.announcementOverlay = document.getElementById('announcementOverlay');
    this.announcementTitle = document.getElementById('announcementTitle');
    this.announcementStatus = document.getElementById('announcementStatus');
    this.announcementAmount = document.getElementById('announcementAmount');
    this.linePrize = "0€";
    this.bingoPrize = "0€";

    this.init();
    this.setupSockets();
    this.checkVideoStatus();

    if (this.isAdmin) {
      this.setupKeyboardShortcuts();
    }
  }

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'l') {
        this.broadcastAnnouncement('¡TENEMOS LÍNEA!', 'LÍNEA CORRECTA', this.linePrize);
      } else if (e.key.toLowerCase() === 'b') {
        this.broadcastAnnouncement('¡TENEMOS BINGO!', 'BINGO CORRECTO', this.bingoPrize);
      } else if (e.key === 'Escape') {
        this.closeAnnouncement();
      }
    });
  }

  broadcastAnnouncement(title, status, amount) {
    socket.emit('show-announcement', { title, status, amount });
    this.showAnnouncementUI(title, status, amount);
  }

  showAnnouncementUI(title, status, amount) {
    this.announcementOverlay.classList.add('active');
    this.announcementTitle.innerText = title;
    this.announcementStatus.innerText = status;
    this.announcementAmount.innerText = amount || "---";
  }

  closeAnnouncement() {
    socket.emit('hide-announcement');
    this.announcementOverlay.classList.remove('active');
  }

  checkVideoStatus() {
    const video = document.getElementById('bgVideo');
    if (video) {
      video.play().catch(e => console.warn("Autoplay bloqueado o fallo de video:", e));
      video.onerror = () => console.error("Error al cargar el video de fondo:", video.error);
    }
  }

  setupSockets() {
    socket.on('init-state', (state) => {
      state.calledNumbers.forEach(n => this.markNumber(n, false));
      if (state.lastNumber) this.updateLastNumberUI(state.lastNumber);
      this.linePrize = state.linePrize || "0€";
      this.bingoPrize = state.bingoPrize || "0€";
    });

    socket.on('update-prizes', (data) => {
      this.linePrize = data.line;
      this.bingoPrize = data.bingo;
    });

    socket.on('number-drawn', (number) => {
      if (!this.isAdmin) {
        this.markNumber(number, false);
      }
    });

    socket.on('show-announcement', (data) => {
      this.showAnnouncementUI(data.title, data.status, data.amount);
    });

    socket.on('hide-announcement', () => {
      this.announcementOverlay.classList.remove('active');
    });

    socket.on('game-reset', () => {
      this.resetUI();
    });
  }

  init() {
    this.createBoard();

    if (this.drawBtn) {
      this.drawBtn.onclick = () => this.drawNumber();
    }
    if (this.resetBtn) {
      this.resetBtn.onclick = () => this.resetGame();
    }

    if (this.volumeSlider) {
      this.audio.volume = this.volumeSlider.value;
      this.volumeSlider.oninput = (e) => {
        this.volume = parseFloat(e.target.value);
        this.audio.volume = this.volume;
      };
    }
  }

  createBoard() {
    if (!this.boardEl) return;
    this.boardEl.innerHTML = '';
    for (let i = 1; i <= 90; i++) {
      const cell = document.createElement('div');
      cell.className = 'bingo-cell';
      cell.textContent = i;
      cell.onclick = () => {
        if (this.isAdmin) this.toggleNumber(i);
      };
      this.buttons[i] = cell;
      this.boardEl.appendChild(cell);
    }
  }

  drawNumber() {
    const available = Array.from({ length: 90 }, (_, i) => i + 1)
      .filter(n => !this.calledNumbers.includes(n));

    if (available.length === 0) return;

    const chosen = available[Math.floor(Math.random() * available.length)];
    this.markNumber(chosen, true);
    socket.emit('draw-number', chosen);
  }

  markNumber(n, shouldSpeak) {
    if (this.calledNumbers.includes(n)) return;

    this.calledNumbers.push(n);
    const btn = this.buttons[n];
    if (btn) btn.classList.add('marked');

    if (shouldSpeak && this.isAdmin) {
      this.playVoice(n);
    }

    this.updateLastNumberUI(n);
    this.updateHistoryUI();
  }

  toggleNumber(n) {
    if (this.calledNumbers.includes(n)) {
      this.calledNumbers = this.calledNumbers.filter(num => num !== n);
      if (this.buttons[n]) this.buttons[n].classList.remove('marked');

      this.audioQueue = this.audioQueue.filter(item => item !== n);
      if (this.currentPlayingNumber === n) {
        this.audio.pause();
        this.isPlaying = false;
        this.processAudioQueue();
      }
      this.updateHistoryUI();
    } else {
      this.markNumber(n, true);
      socket.emit('draw-number', n);
    }
  }

  updateLastNumberUI(n) {
    if (!this.lastNumberEl) return;
    this.lastNumberEl.textContent = n;
    this.lastNumberEl.classList.remove('pop');
    void this.lastNumberEl.offsetWidth;
    this.lastNumberEl.classList.add('pop');
  }

  updateHistoryUI() {
    if (!this.historyEl) return;
    const reversed = [...this.calledNumbers].reverse();
    const historyPool = reversed.slice(1, 6); // Los 5 anteriores

    const items = this.historyEl.querySelectorAll('.history-item');
    items.forEach((item, index) => {
      item.textContent = historyPool[index] || '-';
      item.style.opacity = historyPool[index] ? '1' : '0.3';
    });
  }

  playVoice(n) {
    this.audioQueue.push(n);
    if (!this.isPlaying) {
      this.processAudioQueue();
    }
  }

  processAudioQueue() {
    if (this.audioQueue.length === 0 || this.isPlaying) return;

    const n = this.audioQueue.shift();
    if (!this.calledNumbers.includes(n)) {
      this.processAudioQueue();
      return;
    }

    this.isPlaying = true;
    this.currentPlayingNumber = n;

    this.audio.src = `/assets/voces/${n}.mp3`;
    this.audio.play().catch(e => {
      console.error("Error audio:", e);
      this.isPlaying = false;
      this.processAudioQueue();
    });
  }

  resetGame() {
    if (!this.isAdmin) return;
    if (!confirm('¿Reiniciar todo el juego?')) return;

    // Pedir premios para la nueva partida
    const linea = prompt("Introduce el premio para la LÍNEA (ej: 150€):", " ");
    const bingo = prompt("Introduce el premio para el BINGO (ej: 500€):", " ");

    if (linea && bingo) {
      this.linePrize = linea;
      this.bingoPrize = bingo;
      socket.emit('set-prizes', { line: linea, bingo: bingo });
    }

    this.resetUI();
    socket.emit('reset-game');
  }

  resetUI() {
    this.calledNumbers = [];
    this.audioQueue = [];
    this.isPlaying = false;
    this.audio.pause();
    if (this.lastNumberEl) this.lastNumberEl.textContent = '-';
    Object.values(this.buttons).forEach(btn => btn.classList.remove('marked'));
    this.updateHistoryUI();
  }
}

new BingoEngine();
