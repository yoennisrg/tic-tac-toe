const board = document.getElementById('board');
const status = document.getElementById('status');
const resetBtn = document.getElementById('reset');
const resetScoreBtn = document.getElementById('resetScore');
const scoreDisplay = document.getElementById('score');
const themeToggle = document.getElementById('themeToggle');
const muteToggle = document.getElementById('muteToggle');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistory');
const canvas = document.getElementById('winCanvas');
const ctx = canvas.getContext('2d');
const sizeBtns = document.querySelectorAll('.size-btn');
const cpuCheckbox = document.getElementById('cpuCheckbox');

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

let boardSize = parseInt(localStorage.getItem('boardSize') || '3');
let currentPlayer = 'X';
let gameState = [];
let gameActive = true;
let winAnimId = null;
let winPatterns = [];
let isCpuMode = localStorage.getItem('cpuMode') === 'true';
let cpuThinking = false;

function getWinLen() {
  return boardSize === 3 ? 3 : 4;
}

function generateWinPatterns(size, winLen) {
  const patterns = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - winLen; c++) {
      const p = [];
      for (let i = 0; i < winLen; i++) p.push(r * size + c + i);
      patterns.push(p);
    }
  }
  for (let r = 0; r <= size - winLen; r++) {
    for (let c = 0; c < size; c++) {
      const p = [];
      for (let i = 0; i < winLen; i++) p.push((r + i) * size + c);
      patterns.push(p);
    }
  }
  for (let r = 0; r <= size - winLen; r++) {
    for (let c = 0; c <= size - winLen; c++) {
      const p = [];
      for (let i = 0; i < winLen; i++) p.push((r + i) * size + c + i);
      patterns.push(p);
    }
  }
  for (let r = 0; r <= size - winLen; r++) {
    for (let c = winLen - 1; c < size; c++) {
      const p = [];
      for (let i = 0; i < winLen; i++) p.push((r + i) * size + c - i);
      patterns.push(p);
    }
  }
  return patterns;
}

function resizeCanvas() {
  canvas.width = board.offsetWidth;
  canvas.height = board.offsetHeight;
}

function getCellCenter(index) {
  const size = boardSize;
  const col = index % size;
  const row = Math.floor(index / size);
  const boardWidth = board.offsetWidth;
  const gap = 6;
  const totalGaps = (size - 1) * gap;
  const cellSize = (boardWidth - totalGaps) / size;
  return {
    x: col * (cellSize + gap) + cellSize / 2,
    y: row * (cellSize + gap) + cellSize / 2,
  };
}

function drawWinLine(pattern, color) {
  const start = getCellCenter(pattern[0]);
  const end = getCellCenter(pattern[pattern.length - 1]);
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

function setNamesDisabled(disabled) {
  nameXInput.disabled = disabled;
  nameOInput.disabled = disabled;
}

function updateStatus() {
  if (!gameActive) return;
  status.textContent = `${getPlayerName(currentPlayer)}'s turn`;
}

function updateScoreDisplay() {
  scoreDisplay.innerHTML = `
    <span class="score-badge score-badge--x">${getPlayerName('X')}: ${scoreX}</span>
    <span class="score-badge score-badge--o">${getPlayerName('O')}: ${scoreO}</span>
  `;
}

function resetGame() {
  const total = boardSize * boardSize;
  currentPlayer = 'X';
  gameState = new Array(total).fill('');
  gameActive = true;
  cpuThinking = false;
  winPatterns = generateWinPatterns(boardSize, getWinLen());
  status.textContent = `${getPlayerName('X')}'s turn`;
  setNamesDisabled(false);
  document.querySelectorAll('.cell').forEach(cell => {
    cell.textContent = '';
    cell.classList.remove('x', 'o', 'win');
  });
  if (winAnimId) cancelAnimationFrame(winAnimId);
  winAnimId = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  triggerBoardEnter();
  if (isCpuMode && currentPlayer === 'O') {
    setTimeout(() => cpuMove(), 400);
  }
}

function buildBoard() {
  const oldCells = board.querySelectorAll('.cell');
  oldCells.forEach(el => el.remove());

  const size = boardSize;
  board.style.setProperty('--board-size', size);
  winPatterns = generateWinPatterns(size, getWinLen());
  gameState = new Array(size * size).fill('');
  gameActive = true;
  cpuThinking = false;
  currentPlayer = 'X';

  for (let i = 0; i < size * size; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = i;
    cell.addEventListener('click', handleCellClick);
    board.appendChild(cell);
  }

  resizeCanvas();
  setNamesDisabled(false);
  status.textContent = `${getPlayerName('X')}'s turn`;
  if (winAnimId) cancelAnimationFrame(winAnimId);
  winAnimId = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  triggerBoardEnter();

  if (isCpuMode && currentPlayer === 'O') {
    setTimeout(() => cpuMove(), 400);
  }
}

function handleCellClick(e) {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const index = parseInt(cell.dataset.index);

  if (!gameActive || gameState[index] !== '' || cpuThinking) return;
  if (isCpuMode && currentPlayer === 'O') return;

  makeMove(index);

  if (gameActive && isCpuMode) {
    cpuThinking = true;
    setTimeout(() => {
      cpuMove();
      cpuThinking = false;
    }, 300);
  }
}

function makeMove(index) {
  gameState[index] = currentPlayer;
  const cell = board.querySelector(`.cell[data-index="${index}"]`);
  cell.innerHTML = currentPlayer === 'X' ? SVG_X : SVG_O;
  cell.classList.add(currentPlayer.toLowerCase());
  setNamesDisabled(true);

  audio.playMove();

  if (checkWin()) return;
  if (checkDraw()) return;

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  status.textContent = `${getPlayerName(currentPlayer)}'s turn`;
}

function checkWin() {
  for (const pattern of winPatterns) {
    if (gameState[pattern[0]] && pattern.every(i => gameState[i] === gameState[pattern[0]])) {
      gameActive = false;
      pattern.forEach(i => {
        const cell = board.querySelector(`.cell[data-index="${i}"]`);
        if (cell) cell.classList.add('win');
      });
      audio.playWin();
      status.textContent = `${getPlayerName(currentPlayer)} wins!`;
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
    saveGameHistory('Draw');
    return true;
  }
  return false;
}

function triggerBoardEnter() {
  const cells = board.querySelectorAll('.cell');
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

function toggleMute() {
  audio.muted = !audio.muted;
}

function getMaxDepth() {
  if (boardSize === 3) return Infinity;
  return boardSize === 4 ? 4 : 3;
}

function getAvailableMoves(state) {
  const moves = [];
  for (let i = 0; i < state.length; i++) {
    if (state[i] === '') moves.push(i);
  }
  return moves;
}

function evaluateBoard(state, patterns, aiPlayer) {
  const human = aiPlayer === 'X' ? 'O' : 'X';
  for (const pattern of patterns) {
    const vals = pattern.map(i => state[i]);
    if (vals.every(v => v === aiPlayer)) return 10;
    if (vals.every(v => v === human)) return -10;
  }
  return 0;
}

function minimax(state, depth, alpha, beta, isMaximizing, patterns, aiPlayer, maxDepth) {
  const score = evaluateBoard(state, patterns, aiPlayer);
  if (score === 10) return score - depth;
  if (score === -10) return score + depth;
  if (getAvailableMoves(state).length === 0) return 0;
  if (depth >= maxDepth) return 0;

  const human = aiPlayer === 'X' ? 'O' : 'X';

  if (isMaximizing) {
    let best = -Infinity;
    for (const i of getAvailableMoves(state)) {
      state[i] = aiPlayer;
      best = Math.max(best, minimax(state, depth + 1, alpha, beta, false, patterns, aiPlayer, maxDepth));
      state[i] = '';
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const i of getAvailableMoves(state)) {
      state[i] = human;
      best = Math.min(best, minimax(state, depth + 1, alpha, beta, true, patterns, aiPlayer, maxDepth));
      state[i] = '';
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function cpuMove() {
  if (!gameActive) return;
  if (currentPlayer !== 'O') return;

  const aiPlayer = 'O';
  const human = 'X';
  const maxDepth = getMaxDepth();
  let bestScore = -Infinity;
  let bestMove = -1;

  const state = [...gameState];
  const moves = getAvailableMoves(state);

  if (moves.length === 0) return;

  for (const i of moves) {
    state[i] = aiPlayer;
    const score = (maxDepth === Infinity)
      ? minimax(state, 0, -Infinity, Infinity, false, winPatterns, aiPlayer, Infinity)
      : minimax(state, 0, -Infinity, Infinity, false, winPatterns, aiPlayer, maxDepth - 1);
    state[i] = '';
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }

  if (bestMove !== -1) {
    makeMove(bestMove);
  }
}

function setBoardSize(size) {
  if (size === boardSize) return;
  boardSize = size;
  localStorage.setItem('boardSize', size);
  sizeBtns.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.size) === size);
  });
  buildBoard();
}

sizeBtns.forEach(btn => {
  btn.addEventListener('click', () => setBoardSize(parseInt(btn.dataset.size)));
});

function setCpuMode(enabled) {
  isCpuMode = enabled;
  localStorage.setItem('cpuMode', enabled);
  if (enabled && gameActive && currentPlayer === 'O') {
    setTimeout(() => cpuMove(), 400);
  }
}

cpuCheckbox.addEventListener('change', () => {
  setCpuMode(cpuCheckbox.checked);
});

const savedTheme = localStorage.getItem('theme') || 'dark';
setTheme(savedTheme);

muteToggle.textContent = audio.muted ? '\u{1F507}' : '\u{1F50A}';

sizeBtns.forEach(btn => {
  btn.classList.toggle('active', parseInt(btn.dataset.size) === boardSize);
});
cpuCheckbox.checked = isCpuMode;

window.addEventListener('resize', resizeCanvas);
resetBtn.addEventListener('click', resetGame);
resetScoreBtn.addEventListener('click', resetScore);
themeToggle.addEventListener('click', toggleTheme);
muteToggle.addEventListener('click', toggleMute);
clearHistoryBtn.addEventListener('click', clearHistory);

buildBoard();
updateScoreDisplay();
renderHistory();
