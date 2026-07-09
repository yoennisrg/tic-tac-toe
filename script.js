if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    return this;
  };
}

const board = document.getElementById('board');
const cells = document.querySelectorAll('.cell');
const status = document.getElementById('status');
const resetBtn = document.getElementById('reset');
const resetScoreBtn = document.getElementById('resetScore');
const scoreDisplay = document.getElementById('score');
const themeToggle = document.getElementById('themeToggle');
const muteToggle = document.getElementById('muteToggle');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistory');
const shareBtn = document.getElementById('shareBtn');
const shareModal = document.getElementById('shareModal');
const shareBackdrop = document.getElementById('shareBackdrop');
const shareClose = document.getElementById('shareClose');
const shareCanvas = document.getElementById('shareCanvas');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const canvas = document.getElementById('winCanvas');
const ctx = canvas.getContext('2d');

const audio = {
  ctx: null,
  get muted() {
    return localStorage.getItem('muted') === 'true';
  },
  set muted(v) {
    localStorage.setItem('muted', v);
    muteToggle.textContent = v ? '\u{1F507}' : '\u{1F50A}';
  },
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  },
  playTone(freq, duration, startTime) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  },
  playMove() {
    if (this.muted) return;
    this.init();
    this.playTone(440, 0.08, this.ctx.currentTime);
  },
  playWin() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    this.playTone(523, 0.35, now);
    this.playTone(659, 0.35, now + 0.15);
    this.playTone(784, 0.35, now + 0.3);
  },
  playDraw() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    this.playTone(330, 0.3, now);
    this.playTone(262, 0.3, now + 0.2);
  },
};

const SVG_X = '<svg class="symbol" viewBox="0 0 100 100"><line class="x-line" x1="20" y1="20" x2="80" y2="80"/><line class="x-line" x1="80" y1="20" x2="20" y2="80"/></svg>';
const SVG_O = '<svg class="symbol" viewBox="0 0 100 100"><circle class="o-circle" cx="50" cy="50" r="30"/></svg>';

let currentPlayer = 'X';
let gameState = ['', '', '', '', '', '', '', '', ''];
let gameActive = true;
let winAnimId = null;
let moveHistory = [];

function initMoveHistory() {
  moveHistory = [[...gameState]];
}

function resizeCanvas() {
  canvas.width = board.offsetWidth;
  canvas.height = board.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
let scoreX = parseInt(localStorage.getItem('scoreX') || '0');
let scoreO = parseInt(localStorage.getItem('scoreO') || '0');
let roundNumber = parseInt(localStorage.getItem('roundNumber') || '0');

const nameXInput = document.getElementById('nameX');
const nameOInput = document.getElementById('nameO');

function getDefaultName(player) {
  return player === 'X' ? 'Player X' : 'Player O';
}

function loadName(player) {
  return localStorage.getItem('name' + player) || getDefaultName(player);
}

function saveName(player, value) {
  const trimmed = value.trim();
  localStorage.setItem('name' + player, trimmed || '');
}

function getPlayerName(player) {
  const saved = localStorage.getItem('name' + player);
  return saved && saved.trim() ? saved.trim() : getDefaultName(player);
}

nameXInput.value = loadName('X');
nameOInput.value = loadName('O');

function onNameInput(player, input) {
  saveName(player, input.value);
  updateStatus();
  updateScoreDisplay();
}

nameXInput.addEventListener('input', () => onNameInput('X', nameXInput));
nameOInput.addEventListener('input', () => onNameInput('O', nameOInput));

function updateStatus() {
  if (!gameActive) return;
  status.textContent = `${getPlayerName(currentPlayer)}'s turn`;
}

function setNamesDisabled(disabled) {
  nameXInput.disabled = disabled;
  nameOInput.disabled = disabled;
}

function updateScoreDisplay() {
  scoreDisplay.innerHTML = `
    <span class="score-badge score-badge--x">${getPlayerName('X')}: ${scoreX}</span>
    <span class="score-badge score-badge--o">${getPlayerName('O')}: ${scoreO}</span>
  `;
}
updateScoreDisplay();

const winPatterns = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function handleCellClick(e) {
  const cell = e.target;
  const index = cell.dataset.index;

  if (!gameActive || gameState[index] !== '') return;

  gameState[index] = currentPlayer;
  moveHistory.push([...gameState]);
  cell.innerHTML = currentPlayer === 'X' ? SVG_X : SVG_O;
  cell.classList.add(currentPlayer.toLowerCase());
  setNamesDisabled(true);

  audio.playMove();

  if (checkWin()) return;
  if (checkDraw()) return;

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  status.textContent = `${getPlayerName(currentPlayer)}'s turn`;
}

function getCellCenter(index) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const cellSize = (board.offsetWidth - 12) / 3;
  const gap = 6;
  return {
    x: col * (cellSize + gap) + cellSize / 2,
    y: row * (cellSize + gap) + cellSize / 2,
  };
}

function drawWinLine(pattern, color) {
  const start = getCellCenter(pattern[0]);
  const end = getCellCenter(pattern[2]);
  const duration = 400;
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(
      start.x + (end.x - start.x) * progress,
      start.y + (end.y - start.y) * progress,
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();

    if (progress < 1) {
      winAnimId = requestAnimationFrame(animate);
    }
  }

  winAnimId = requestAnimationFrame(animate);
}

function checkWin() {
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (gameState[a] && gameState[a] === gameState[b] && gameState[a] === gameState[c]) {
      gameActive = false;
      cells[a].classList.add('win');
      cells[b].classList.add('win');
      cells[c].classList.add('win');
      audio.playWin();
      status.textContent = `${getPlayerName(currentPlayer)} wins!`;
      shareBtn.classList.remove('hidden');
      if (currentPlayer === 'X') scoreX++; else scoreO++;
      localStorage.setItem('scoreX', scoreX);
      localStorage.setItem('scoreO', scoreO);
      updateScoreDisplay();
      saveGameHistory(currentPlayer);
      const style = getComputedStyle(document.documentElement);
      const winColor = style.getPropertyValue(currentPlayer === 'X' ? '--color-x' : '--color-o').trim();
      drawWinLine(pattern, winColor);
      return true;
    }
  }
  return false;
}

function checkDraw() {
  if (gameState.every(cell => cell !== '')) {
    gameActive = false;
    audio.playDraw();
    status.textContent = "It's a draw!";
    shareBtn.classList.remove('hidden');
    saveGameHistory('Draw');
    return true;
  }
  return false;
}

function resetGame() {
  currentPlayer = 'X';
  gameState = ['', '', '', '', '', '', '', '', ''];
  gameActive = true;
  status.textContent = `${getPlayerName('X')}'s turn`;
  setNamesDisabled(false);
  cells.forEach(cell => {
    cell.textContent = '';
    cell.classList.remove('x', 'o', 'win');
  });
  if (winAnimId) cancelAnimationFrame(winAnimId);
  winAnimId = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  shareBtn.classList.add('hidden');
  shareModal.classList.add('hidden');
  if (replayTimer) {
    clearTimeout(replayTimer);
    replayTimer = null;
  }
  initMoveHistory();
  triggerBoardEnter();
}

function triggerBoardEnter() {
  cells.forEach((cell, i) => {
    cell.style.animationDelay = `${i * 50}ms`;
  });
  board.classList.remove('entered');
  void board.offsetWidth;
  board.classList.add('entered');
}

function resetScore() {
  scoreX = 0;
  scoreO = 0;
  localStorage.setItem('scoreX', '0');
  localStorage.setItem('scoreO', '0');
  updateScoreDisplay();
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('gameHistory') || '[]');
  } catch {
    return [];
  }
}

function saveGameHistory(winner) {
  roundNumber++;
  localStorage.setItem('roundNumber', roundNumber);
  const history = getHistory();
  history.unshift({
    round: roundNumber,
    winner,
    timestamp: new Date().toLocaleString()
  });
  if (history.length > 5) history.pop();
  localStorage.setItem('gameHistory', JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No games played yet</div>';
    return;
  }
  historyList.innerHTML = history.map(entry =>
    `<div class="history-entry">
      <span>#${entry.round} — ${entry.winner}</span>
      <span>${entry.timestamp}</span>
    </div>`
  ).join('');
}

function clearHistory() {
  localStorage.removeItem('gameHistory');
  roundNumber = 0;
  localStorage.setItem('roundNumber', '0');
  renderHistory();
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '\u{1F319}' : '\u{2600}\u{FE0F}';
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'light' ? 'dark' : 'light');
}

const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

muteToggle.textContent = audio.muted ? '\u{1F507}' : '\u{1F50A}';

function toggleMute() {
  audio.muted = !audio.muted;
}

let replayTimer = null;

function getResultText() {
  for (const p of winPatterns) {
    const [a, b, c] = p;
    if (gameState[a] && gameState[a] === gameState[b] && gameState[a] === gameState[c]) {
      return `${getPlayerName(gameState[a])} wins!`;
    }
  }
  return "It's a draw!";
}

function renderBoardState(ctx, w, h, state, isFinal) {
  const style = getComputedStyle(document.documentElement);
  const bg = style.getPropertyValue('--bg').trim();
  const text = style.getPropertyValue('--text').trim();
  const cx = style.getPropertyValue('--color-x').trim();
  const co = style.getPropertyValue('--color-o').trim();
  const cb = style.getPropertyValue('--cell-bg').trim();

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const bs = Math.min(w - 40, 300);
  const cs = bs / 3;
  const bx = (w - bs) / 2;
  const by = 50;

  ctx.fillStyle = text;
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${getPlayerName('X')} vs ${getPlayerName('O')}`, w / 2, 25);

  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = bx + col * cs;
    const y = by + row * cs;

    ctx.fillStyle = cb;
    ctx.beginPath();
    ctx.roundRect(x, y, cs, cs, 6);
    ctx.fill();

    ctx.strokeStyle = text;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, cs, cs, 6);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (state[i]) {
      const cx2 = x + cs / 2;
      const cy2 = y + cs / 2;
      const r = cs * 0.3;

      if (state[i] === 'X') {
        ctx.strokeStyle = cx;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx2 - r, cy2 - r);
        ctx.lineTo(cx2 + r, cy2 + r);
        ctx.moveTo(cx2 + r, cy2 - r);
        ctx.lineTo(cx2 - r, cy2 + r);
        ctx.stroke();
      } else {
        ctx.strokeStyle = co;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx2, cy2, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  if (isFinal) {
    ctx.fillStyle = text;
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(getResultText(), w / 2, by + bs + 28);

    ctx.font = '12px Inter, sans-serif';
    ctx.globalAlpha = 0.6;
    ctx.fillText(`Round #${roundNumber}`, w / 2, by + bs + 48);
    ctx.fillText(new Date().toLocaleString(), w / 2, by + bs + 64);
    ctx.globalAlpha = 1;
  }
}

function openShareModal() {
  shareModal.classList.remove('hidden');

  const dpr = window.devicePixelRatio || 1;
  const dw = 400;
  const dh = 460;
  shareCanvas.width = dw * dpr;
  shareCanvas.height = dh * dpr;
  shareCanvas.style.width = dw + 'px';
  shareCanvas.style.height = dh + 'px';
  const sctx = shareCanvas.getContext('2d');

  let step = 0;
  const total = moveHistory.length;

  function renderStep() {
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderBoardState(sctx, dw, dh, moveHistory[step], step === total - 1);
    if (step < total - 1) {
      step++;
      replayTimer = setTimeout(renderStep, 500);
    }
  }

  renderStep();
}

function closeShareModal() {
  shareModal.classList.add('hidden');
  if (replayTimer) {
    clearTimeout(replayTimer);
    replayTimer = null;
  }
}

function createExportCanvas() {
  const c = document.createElement('canvas');
  const dpr = 2;
  const w = 500;
  const h = 580;
  c.width = w * dpr;
  c.height = h * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);

  const style = getComputedStyle(document.documentElement);
  const bg = style.getPropertyValue('--bg').trim();
  const text = style.getPropertyValue('--text').trim();
  const cx = style.getPropertyValue('--color-x').trim();
  const co = style.getPropertyValue('--color-o').trim();
  const cb = style.getPropertyValue('--cell-bg').trim();

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const bs = 360;
  const cs = bs / 3;
  const bx = (w - bs) / 2;
  const by = 70;

  ctx.fillStyle = text;
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${getPlayerName('X')} vs ${getPlayerName('O')}`, w / 2, 30);

  ctx.font = '12px Inter, sans-serif';
  ctx.globalAlpha = 0.5;
  ctx.fillText('Tic-Tac-Toe', w / 2, 48);
  ctx.globalAlpha = 1;

  const finalState = moveHistory[moveHistory.length - 1];

  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = bx + col * cs;
    const y = by + row * cs;

    ctx.fillStyle = cb;
    ctx.beginPath();
    ctx.roundRect(x, y, cs, cs, 8);
    ctx.fill();

    ctx.strokeStyle = text;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, cs, cs, 8);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (finalState[i]) {
      const cx2 = x + cs / 2;
      const cy2 = y + cs / 2;
      const r = cs * 0.32;

      if (finalState[i] === 'X') {
        ctx.strokeStyle = cx;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx2 - r, cy2 - r);
        ctx.lineTo(cx2 + r, cy2 + r);
        ctx.moveTo(cx2 + r, cy2 - r);
        ctx.lineTo(cx2 - r, cy2 + r);
        ctx.stroke();
      } else {
        ctx.strokeStyle = co;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx2, cy2, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = text;
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(getResultText(), w / 2, by + bs + 38);

  ctx.font = '14px Inter, sans-serif';
  ctx.globalAlpha = 0.6;
  ctx.fillText(`Round #${roundNumber}`, w / 2, by + bs + 60);
  ctx.fillText(new Date().toLocaleString(), w / 2, by + bs + 82);
  ctx.globalAlpha = 1;

  return c;
}

async function copyImageToClipboard() {
  const canvas = createExportCanvas();
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    status.textContent = 'Image copied to clipboard!';
    setTimeout(() => updateStatus(), 2000);
  } catch {
    try {
      await navigator.clipboard.writeText(
        `Tic-Tac-Toe: ${getPlayerName('X')} vs ${getPlayerName('O')} — ${getResultText()} (Round #${roundNumber})`
      );
      status.textContent = 'Game result copied to clipboard!';
      setTimeout(() => updateStatus(), 2000);
    } catch {
      status.textContent = 'Clipboard not supported. Try downloading instead.';
    }
  }
}

function downloadGameImage() {
  const canvas = createExportCanvas();
  const link = document.createElement('a');
  link.download = `tic-tac-toe-round-${roundNumber}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

cells.forEach(cell => cell.addEventListener('click', handleCellClick));
resetBtn.addEventListener('click', resetGame);
resetScoreBtn.addEventListener('click', resetScore);
themeToggle.addEventListener('click', toggleTheme);
muteToggle.addEventListener('click', toggleMute);
clearHistoryBtn.addEventListener('click', clearHistory);
shareBtn.addEventListener('click', openShareModal);
shareBackdrop.addEventListener('click', closeShareModal);
shareClose.addEventListener('click', closeShareModal);
copyBtn.addEventListener('click', copyImageToClipboard);
downloadBtn.addEventListener('click', downloadGameImage);

initMoveHistory();
triggerBoardEnter();
renderHistory();
