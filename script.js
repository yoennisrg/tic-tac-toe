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
let gameState = [];
let gameActive = true;
let winAnimId = null;
let isCpuThinking = false;

let boardSize = parseInt(localStorage.getItem('boardSize')) || 3;
let winLength = boardSize === 3 ? 3 : 4;
let winPatterns = [];
let cells = [];

let scoreX = parseInt(localStorage.getItem('scoreX') || '0');
let scoreO = parseInt(localStorage.getItem('scoreO') || '0');
let roundNumber = parseInt(localStorage.getItem('roundNumber') || '0');

let gameMode = localStorage.getItem('gameMode') || 'pvp';
let difficulty = localStorage.getItem('difficulty') || 'medium';

const nameXInput = document.getElementById('nameX');
const nameOInput = document.getElementById('nameO');
const modeBtns = document.querySelectorAll('.mode-btn');
const diffSelector = document.getElementById('difficultySelector');
const diffBtns = document.querySelectorAll('.diff-btn');
const sizeBtns = document.querySelectorAll('.size-btn');

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

function buildWinPatterns(size, k) {
  const patterns = [];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col <= size - k; col++) {
      const pattern = [];
      for (let i = 0; i < k; i++) pattern.push(row * size + col + i);
      patterns.push(pattern);
    }
  }

  for (let col = 0; col < size; col++) {
    for (let row = 0; row <= size - k; row++) {
      const pattern = [];
      for (let i = 0; i < k; i++) pattern.push((row + i) * size + col);
      patterns.push(pattern);
    }
  }

  for (let row = 0; row <= size - k; row++) {
    for (let col = 0; col <= size - k; col++) {
      const pattern = [];
      for (let i = 0; i < k; i++) pattern.push((row + i) * size + (col + i));
      patterns.push(pattern);
    }
  }

  for (let row = 0; row <= size - k; row++) {
    for (let col = k - 1; col < size; col++) {
      const pattern = [];
      for (let i = 0; i < k; i++) pattern.push((row + i) * size + (col - i));
      patterns.push(pattern);
    }
  }

  return patterns;
}

function createBoard() {
  winPatterns = buildWinPatterns(boardSize, winLength);
  board.innerHTML = '';
  cells = [];
  gameState = new Array(boardSize * boardSize).fill('');

  for (let i = 0; i < boardSize * boardSize; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = i;
    cell.addEventListener('click', handleCellClick);
    board.appendChild(cell);
    cells.push(cell);
  }

  board.appendChild(canvas);
  canvas.width = board.offsetWidth;
  canvas.height = board.offsetHeight;

  board.style.setProperty('--board-size', boardSize);
  board.style.setProperty('--cell-size', `min(16vw, calc(360px / ${boardSize}))`);
  updateSizeButtons();
}

function resizeCanvas() {
  canvas.width = board.offsetWidth;
  canvas.height = board.offsetHeight;
}
window.addEventListener('resize', resizeCanvas);

function setBoardSize(size) {
  boardSize = size;
  winLength = size === 3 ? 3 : 4;
  localStorage.setItem('boardSize', size);
  createBoard();
  resetGame();
}

function updateSizeButtons() {
  sizeBtns.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.size) === boardSize);
  });
}

function setGameMode(mode) {
  gameMode = mode;
  localStorage.setItem('gameMode', mode);
  modeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  diffSelector.style.display = mode === 'cpu' ? 'flex' : 'none';
  if (mode === 'cpu') {
    nameOInput.value = 'CPU';
  } else {
    nameOInput.value = loadName('O');
  }
  setNamesDisabled(mode === 'cpu');
}

function setDifficulty(diff) {
  difficulty = diff;
  localStorage.setItem('difficulty', diff);
  diffBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  });
}

function handleCellClick(e) {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const index = cell.dataset.index;

  if (!gameActive || gameState[index] !== '' || isCpuThinking) return;
  if (gameMode === 'cpu' && currentPlayer === 'O') return;

  gameState[index] = currentPlayer;
  cell.innerHTML = currentPlayer === 'X' ? SVG_X : SVG_O;
  cell.classList.add(currentPlayer.toLowerCase());
  setNamesDisabled(true);

  audio.playMove();

  if (checkWin()) return;
  if (checkDraw()) return;

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  updateStatus();

  if (gameMode === 'cpu' && currentPlayer === 'O') {
    cpuTurn();
  }
}

function getCellCenter(index) {
  const col = index % boardSize;
  const row = Math.floor(index / boardSize);
  const gap = parseFloat(getComputedStyle(board).gap) || 6;
  const cellSize = (board.offsetWidth - gap * (boardSize - 1)) / boardSize;
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

function checkWin() {
  for (const pattern of winPatterns) {
    const first = pattern[0];
    if (!gameState[first]) continue;
    const winner = gameState[first];
    if (pattern.every(idx => gameState[idx] === winner)) {
      gameActive = false;
      pattern.forEach(idx => cells[idx].classList.add('win'));
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
  currentPlayer = 'X';
  gameState = new Array(boardSize * boardSize).fill('');
  gameActive = true;
  isCpuThinking = false;
  board.classList.remove('thinking');
  updateStatus();
  setNamesDisabled(gameMode === 'cpu');
  cells.forEach(cell => {
    cell.innerHTML = '';
    cell.classList.remove('x', 'o', 'win');
  });
  if (winAnimId) cancelAnimationFrame(winAnimId);
  winAnimId = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  triggerBoardEnter();
}

function triggerBoardEnter() {
  cells.forEach((cell, i) => {
    cell.style.animationDelay = `${i * 30}ms`;
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

resetBtn.addEventListener('click', resetGame);
resetScoreBtn.addEventListener('click', resetScore);
themeToggle.addEventListener('click', toggleTheme);
muteToggle.addEventListener('click', toggleMute);
clearHistoryBtn.addEventListener('click', clearHistory);

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    setGameMode(btn.dataset.mode);
    resetGame();
  });
});

diffBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    setDifficulty(btn.dataset.diff);
  });
});

sizeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    setBoardSize(parseInt(btn.dataset.size));
  });
});

function checkWinner(boardState, player) {
  for (const pattern of winPatterns) {
    if (pattern.every(idx => boardState[idx] === player)) return true;
  }
  return false;
}

function getEmptyIndices(boardState) {
  return boardState.reduce((acc, val, i) => val === '' ? [...acc, i] : acc, []);
}

function getMaxMinimaxDepth() {
  if (difficulty === 'easy') return 0;
  if (difficulty === 'medium') return Math.min(2, boardSize === 3 ? 9 : boardSize === 4 ? 4 : 3);
  if (boardSize === 3) return Infinity;
  if (boardSize === 4) return 4;
  return 3;
}

function minimax(boardState, depth, isMaximizing, alpha, beta, maxDepth) {
  if (checkWinner(boardState, 'O')) return 10 - depth;
  if (checkWinner(boardState, 'X')) return depth - 10;
  const empty = getEmptyIndices(boardState);
  if (empty.length === 0) return 0;
  if (maxDepth !== Infinity && depth >= maxDepth) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (const i of empty) {
      boardState[i] = 'O';
      best = Math.max(best, minimax(boardState, depth + 1, false, alpha, beta, maxDepth));
      boardState[i] = '';
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const i of empty) {
      boardState[i] = 'X';
      best = Math.min(best, minimax(boardState, depth + 1, true, alpha, beta, maxDepth));
      boardState[i] = '';
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getCpuMove() {
  const empty = getEmptyIndices(gameState);
  if (empty.length === 0) return -1;

  if (difficulty === 'easy') {
    return empty[Math.floor(Math.random() * empty.length)];
  }

  const maxDepth = getMaxMinimaxDepth();
  let bestScore = -Infinity;
  let bestMove = empty[0];

  for (const i of empty) {
    gameState[i] = 'O';
    const score = minimax(gameState, 0, false, -Infinity, Infinity, maxDepth);
    gameState[i] = '';
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
}

function cpuTurn() {
  if (!gameActive || currentPlayer !== 'O' || gameMode !== 'cpu') return;
  isCpuThinking = true;
  board.classList.add('thinking');

  setTimeout(() => {
    if (!gameActive) {
      isCpuThinking = false;
      board.classList.remove('thinking');
      return;
    }
    const move = getCpuMove();
    if (move === -1) {
      isCpuThinking = false;
      board.classList.remove('thinking');
      return;
    }
    const cell = cells[move];
    gameState[move] = 'O';
    cell.innerHTML = SVG_O;
    cell.classList.add('o');
    audio.playMove();
    isCpuThinking = false;
    board.classList.remove('thinking');
    if (checkWin()) return;
    if (checkDraw()) return;
    currentPlayer = 'X';
    updateStatus();
  }, 400);
}

setGameMode(gameMode);
setDifficulty(difficulty);
createBoard();
resetGame();
renderHistory();
