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
const canvas = document.getElementById('winCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('startScreen');
const gameArea = document.getElementById('gameArea');
const startGameBtn = document.getElementById('startGame');
const modeBtns = document.querySelectorAll('.mode-btn');
const difficultyRow = document.getElementById('difficultyRow');
const difficultySelect = document.getElementById('difficulty');

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
let gameActive = false;
let winAnimId = null;
let cpuThinking = false;
let cpuMoveTimeout = null;
let gameMode = localStorage.getItem('gameMode') || '2p';
let difficulty = localStorage.getItem('difficulty') || 'hard';

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

function isCpuMode() {
  return gameMode === 'cpu';
}

function getPlayerName(player) {
  if (isCpuMode() && player === 'O') return 'CPU';
  const saved = localStorage.getItem('name' + player);
  return saved && saved.trim() ? saved.trim() : getDefaultName(player);
}

nameXInput.value = loadName('X');

function onNameInput(player, input) {
  saveName(player, input.value);
  updateStatus();
  updateScoreDisplay();
}

nameXInput.addEventListener('input', () => onNameInput('X', nameXInput));
nameOInput.addEventListener('input', () => onNameInput('O', nameOInput));

function updateStatus() {
  if (cpuThinking) {
    status.textContent = "CPU is thinking...";
    return;
  }
  if (!gameActive) return;
  status.textContent = `${getPlayerName(currentPlayer)}'s turn`;
}

function setNamesDisabled(disabled) {
  nameXInput.disabled = disabled;
  nameOInput.disabled = disabled || isCpuMode();
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

function evaluate(state, depth) {
  for (const [a, b, c] of winPatterns) {
    if (state[a] && state[a] === state[b] && state[a] === state[c]) {
      return state[a] === 'O' ? 10 - depth : -10 + depth;
    }
  }
  return 0;
}

function minimax(state, depth, alpha, beta, isMaximizing, maxDepth) {
  const score = evaluate(state, depth);
  if (score !== 0) return score;
  if (state.every(cell => cell !== '') || depth === maxDepth) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (state[i] === '') {
        state[i] = 'O';
        best = Math.max(best, minimax(state, depth + 1, alpha, beta, false, maxDepth));
        state[i] = '';
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (state[i] === '') {
        state[i] = 'X';
        best = Math.min(best, minimax(state, depth + 1, alpha, beta, true, maxDepth));
        state[i] = '';
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  }
}

function getBestMove(maxDepth) {
  let bestScore = -Infinity;
  const bestMoves = [];
  for (let i = 0; i < 9; i++) {
    if (gameState[i] === '') {
      gameState[i] = 'O';
      const score = minimax(gameState, 0, -Infinity, Infinity, false, maxDepth);
      gameState[i] = '';
      if (score > bestScore) {
        bestScore = score;
        bestMoves.length = 0;
        bestMoves.push(i);
      } else if (score === bestScore) {
        bestMoves.push(i);
      }
    }
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

function getCpuMove() {
  if (difficulty === 'easy') {
    const empty = gameState.map((v, i) => v === '' ? i : null).filter(i => i !== null);
    return empty[Math.floor(Math.random() * empty.length)];
  }
  const maxDepth = difficulty === 'medium' ? 3 : Infinity;
  return getBestMove(maxDepth);
}

function cpuMove() {
  if (!gameActive || !isCpuMode() || currentPlayer !== 'O') return;

  cpuThinking = true;
  board.classList.add('cpu-thinking');
  updateStatus();

  const moveIndex = getCpuMove();

  cpuMoveTimeout = setTimeout(() => {
    cpuMoveTimeout = null;
    makeMove(moveIndex, 'O');
    board.classList.remove('cpu-thinking');
    cpuThinking = false;
  }, 400);
}

function makeMove(index, player) {
  gameState[index] = player;
  const cell = cells[index];
  cell.innerHTML = player === 'X' ? SVG_X : SVG_O;
  cell.classList.add(player.toLowerCase());
  setNamesDisabled(true);

  audio.playMove();

  if (checkWin()) return;
  if (checkDraw()) return;

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  updateStatus();
}

function handleCellClick(e) {
  const cell = e.target;
  const index = cell.dataset.index;

  if (cpuThinking || !gameActive || gameState[index] !== '') return;

  makeMove(index, currentPlayer);

  if (gameActive && isCpuMode() && currentPlayer === 'O') {
    cpuMove();
  }
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

function resetGame() {
  if (cpuMoveTimeout) {
    clearTimeout(cpuMoveTimeout);
    cpuMoveTimeout = null;
  }
  cpuThinking = false;
  board.classList.remove('cpu-thinking');
  currentPlayer = 'X';
  gameState = ['', '', '', '', '', '', '', '', ''];
  gameActive = true;
  status.textContent = `${getPlayerName('X')}'s turn`;
  setNamesDisabled(true);
  cells.forEach(cell => {
    cell.textContent = '';
    cell.classList.remove('x', 'o', 'win');
  });
  if (winAnimId) cancelAnimationFrame(winAnimId);
  winAnimId = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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

function updateModeUI() {
  modeBtns.forEach(btn => {
    const selected = btn.dataset.mode === gameMode;
    btn.classList.toggle('selected', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });

  if (isCpuMode()) {
    difficultyRow.classList.remove('hidden');
    nameOInput.value = 'CPU';
    difficultySelect.value = difficulty;
  } else {
    difficultyRow.classList.add('hidden');
    nameOInput.value = loadName('O');
  }

  setNamesDisabled(false);
  updateScoreDisplay();
}

function setGameMode(mode) {
  gameMode = mode;
  localStorage.setItem('gameMode', mode);
  updateModeUI();
}

function setDifficulty(value) {
  difficulty = value;
  localStorage.setItem('difficulty', value);
}

function showStartScreen() {
  if (cpuMoveTimeout) {
    clearTimeout(cpuMoveTimeout);
    cpuMoveTimeout = null;
  }
  cpuThinking = false;
  board.classList.remove('cpu-thinking');
  gameActive = false;

  startScreen.classList.remove('hidden');
  gameArea.classList.add('hidden');

  currentPlayer = 'X';
  gameState = ['', '', '', '', '', '', '', '', ''];
  cells.forEach(cell => {
    cell.textContent = '';
    cell.classList.remove('x', 'o', 'win');
  });
  if (winAnimId) cancelAnimationFrame(winAnimId);
  winAnimId = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  updateModeUI();
}

function startGame() {
  startScreen.classList.add('hidden');
  gameArea.classList.remove('hidden');
  resizeCanvas();
  resetGame();
}

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => setGameMode(btn.dataset.mode));
});

difficultySelect.addEventListener('change', () => setDifficulty(difficultySelect.value));

startGameBtn.addEventListener('click', startGame);
cells.forEach(cell => cell.addEventListener('click', handleCellClick));
resetBtn.addEventListener('click', showStartScreen);
resetScoreBtn.addEventListener('click', resetScore);
themeToggle.addEventListener('click', toggleTheme);
muteToggle.addEventListener('click', toggleMute);
clearHistoryBtn.addEventListener('click', clearHistory);

updateModeUI();
renderHistory();
showStartScreen();
