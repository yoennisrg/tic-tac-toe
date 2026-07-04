const board = document.getElementById('board');
const cells = document.querySelectorAll('.cell');
const turnSubtitle = document.getElementById('turnSubtitle');
const resetBtn = document.getElementById('reset');
const resetScoreBtn = document.getElementById('resetScore');
const scoreDisplay = document.getElementById('score');
const themeToggle = document.getElementById('themeToggle');
const muteToggle = document.getElementById('muteToggle');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistory');
const canvas = document.getElementById('winCanvas');
const ctx = canvas.getContext('2d');
const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose = document.getElementById('settingsClose');
const timerToggle = document.getElementById('timerToggle');
const timerDurationRow = document.getElementById('timerDurationRow');
const durationBtns = document.querySelectorAll('.duration-btn');

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
  playTimeout() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    this.playTone(220, 0.25, now);
    this.playTone(180, 0.35, now + 0.12);
  },
};

const SVG_X = '<svg class="symbol" viewBox="0 0 100 100"><line class="x-line" x1="20" y1="20" x2="80" y2="80"/><line class="x-line" x1="80" y1="20" x2="20" y2="80"/></svg>';
const SVG_O = '<svg class="symbol" viewBox="0 0 100 100"><circle class="o-circle" cx="50" cy="50" r="30"/></svg>';

let currentPlayer = 'X';
let gameState = ['', '', '', '', '', '', '', '', ''];
let gameActive = true;
let winAnimId = null;

let gameMode = 'pvp';
let difficulty = localStorage.getItem('difficulty') || 'hard';
let cpuThinking = false;
let cpuTimeoutId = null;

const TIMER_RING_RADIUS = 42;
const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * TIMER_RING_RADIUS;

const timer = {
  enabled: false,
  duration: 10,
  remaining: 10,
  startedAt: null,
  animId: null,
  forfeitStreak: 0,
  paused: false,

  get ringCircles() {
    return document.querySelectorAll('.timer-ring');
  },

  get activeRing() {
    const ind = document.querySelector(`.player-indicator.active`);
    return ind ? ind.querySelector('.timer-ring') : null;
  },

  loadSettings() {
    this.enabled = localStorage.getItem('timerEnabled') === 'true';
    this.duration = parseInt(localStorage.getItem('timerDuration') || '10', 10);
    this.forfeitStreak = parseInt(localStorage.getItem('timerForfeitStreak') || '0', 10);
    timerToggle.checked = this.enabled;
    timerDurationRow.style.display = this.enabled ? 'flex' : 'none';
    durationBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.duration, 10) === this.duration);
    });
  },

  save() {
    localStorage.setItem('timerEnabled', this.enabled);
    localStorage.setItem('timerDuration', this.duration);
  },

  start() {
    if (!this.enabled || !gameActive) return;
    if (gameMode === 'pve' && currentPlayer === 'O') return;
    if (this.animId) this.stop();
    this.remaining = this.duration;
    this.startedAt = performance.now();
    this.paused = false;
    this.updateRing();
    this.animId = requestAnimationFrame(t => this.tick(t));
  },

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    this.startedAt = null;
    this.hideRings();
  },

  hideRings() {
    this.ringCircles.forEach(c => {
      c.style.stroke = 'var(--timer-neutral)';
      c.style.strokeDashoffset = TIMER_RING_CIRCUMFERENCE;
    });
  },

  reset() {
    this.stop();
    this.remaining = this.duration;
    if (this.enabled && gameActive) {
      if (!(gameMode === 'pve' && currentPlayer === 'O')) {
        this.start();
      }
    }
  },

  pause() {
    if (!this.animId) return;
    this.paused = true;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  },

  resume() {
    if (!this.paused || !this.enabled || !gameActive) return;
    if (gameMode === 'pve' && currentPlayer === 'O') return;
    this.paused = false;
    this.startedAt = performance.now() - (this.duration - this.remaining) * 1000;
    this.updateRing();
    this.animId = requestAnimationFrame(t => this.tick(t));
  },

  tick(now) {
    if (this.paused) return;
    if (!this.startedAt) {
      this.startedAt = now;
    }
    const elapsed = (now - this.startedAt) / 1000;
    this.remaining = Math.max(0, this.duration - elapsed);
    this.updateRing();

    if (this.remaining <= 0) {
      this.stop();
      this.onTimeout();
      return;
    }

    this.animId = requestAnimationFrame(t => this.tick(t));
  },

  updateRing() {
    const ring = this.activeRing;
    if (!ring) return;
    const pct = this.remaining / this.duration;
    const offset = TIMER_RING_CIRCUMFERENCE * (1 - pct);
    ring.style.strokeDasharray = TIMER_RING_CIRCUMFERENCE;
    ring.style.strokeDashoffset = offset;

    const remainingSec = this.remaining;
    let color;
    if (remainingSec <= 1) {
      color = 'var(--timer-red)';
    } else if (remainingSec <= 3) {
      color = 'var(--timer-yellow)';
    } else {
      color = 'var(--timer-neutral)';
    }
    ring.style.stroke = color;
  },

  onTimeout() {
    if (!gameActive) return;

    audio.playTimeout();
    this.forfeitStreak++;
    localStorage.setItem('timerForfeitStreak', this.forfeitStreak);

    if (this.forfeitStreak >= 3) {
      const loser = currentPlayer;
      gameActive = false;
      const winner = loser === 'X' ? 'O' : 'X';
      turnSubtitle.textContent = `${getPlayerName(loser)} forfeits the game! ${getPlayerName(winner)} wins!`;
      getIndicator(winner).classList.add('winner');
      getIndicator(winner).classList.remove('active');
      getIndicator(loser).classList.remove('active', 'inactive');
      if (winner === 'X') scoreX++; else scoreO++;
      localStorage.setItem('scoreX', scoreX);
      localStorage.setItem('scoreO', scoreO);
      updateScoreDisplay();
      saveGameHistory(winner);
      showModeUI(true);
      this.forfeitStreak = 0;
      localStorage.setItem('timerForfeitStreak', '0');
      return;
    }

    const oldPlayer = currentPlayer;
    turnSubtitle.textContent = `${getPlayerName(oldPlayer)} ran out of time!`;
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    updateTurnIndicator();
    this.start();
  },

  setEnabled(v) {
    this.enabled = v;
    timerToggle.checked = v;
    timerDurationRow.style.display = v ? 'flex' : 'none';
    if (!v) {
      this.stop();
      this.hideRings();
    } else if (gameActive) {
      this.start();
    }
    this.save();
  },

  setDuration(d) {
    this.duration = d;
    durationBtns.forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.duration, 10) === d));
    if (this.enabled && gameActive) this.reset();
    this.save();
  },
};

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
  if (gameMode === 'pve' && player === 'O') return 'CPU';
  const saved = localStorage.getItem('name' + player);
  return saved && saved.trim() ? saved.trim() : getDefaultName(player);
}

nameXInput.value = loadName('X');
nameOInput.value = loadName('O');

function onNameInput(player, input) {
  saveName(player, input.value);
  updateTurnIndicator();
  updateScoreDisplay();
}

nameXInput.addEventListener('input', () => onNameInput('X', nameXInput));
nameOInput.addEventListener('input', () => onNameInput('O', nameOInput));

function getIndicator(player) {
  return document.querySelector(`.player-indicator[data-player="${player}"]`);
}

function updateTurnIndicator() {
  document.getElementById('labelX').textContent = getPlayerName('X');
  document.getElementById('labelO').textContent = getPlayerName('O');

  const xInd = getIndicator('X');
  const oInd = getIndicator('O');
  xInd.classList.remove('winner');
  oInd.classList.remove('winner');

  if (!gameActive) {
    xInd.classList.remove('active', 'inactive');
    oInd.classList.remove('active', 'inactive');
    return;
  }

  xInd.classList.remove('active', 'inactive');
  oInd.classList.remove('active', 'inactive');

  if (currentPlayer === 'X') {
    xInd.classList.add('active');
    oInd.classList.add('inactive');
    turnSubtitle.textContent = `${getPlayerName('X')}'s turn`;
  } else {
    oInd.classList.add('active');
    xInd.classList.add('inactive');
    turnSubtitle.textContent = `${getPlayerName('O')}'s turn`;
  }
}

function setNamesDisabled(disabled) {
  nameXInput.disabled = disabled;
  nameOInput.disabled = disabled || gameMode === 'pve';
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

  if (!gameActive || gameState[index] !== '' || cpuThinking) return;
  if (gameMode === 'pve' && currentPlayer === 'O') return;

  if (gameState.every(cell => cell === '')) {
    showModeUI(false);
  }

  gameState[index] = currentPlayer;
  cell.innerHTML = currentPlayer === 'X' ? SVG_X : SVG_O;
  cell.classList.add(currentPlayer.toLowerCase());
  setNamesDisabled(true);

  audio.playMove();

  if (checkWin()) return;
  if (checkDraw()) return;

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  updateTurnIndicator();
  timer.reset();

  if (gameMode === 'pve' && currentPlayer === 'O') {
    triggerCPUMove();
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

function getAvailableMoves(board) {
  return board.reduce((moves, cell, i) => {
    if (cell === '') moves.push(i);
    return moves;
  }, []);
}

function checkWinner(board) {
  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function isBoardFull(board) {
  return board.every(cell => cell !== '');
}

function minimax(board, depth, isMaximizing, alpha, beta, maxDepth) {
  const winner = checkWinner(board);
  if (winner === 'O') return 10 - depth;
  if (winner === 'X') return depth - 10;
  if (isBoardFull(board)) return 0;
  if (maxDepth !== undefined && depth >= maxDepth) return 0;

  const moves = getAvailableMoves(board);

  if (isMaximizing) {
    let best = -Infinity;
    for (const i of moves) {
      board[i] = 'O';
      const score = minimax(board, depth + 1, false, alpha, beta, maxDepth);
      board[i] = '';
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const i of moves) {
      board[i] = 'X';
      const score = minimax(board, depth + 1, true, alpha, beta, maxDepth);
      board[i] = '';
      best = Math.min(best, score);
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getBestMove(board, difficulty) {
  const moves = getAvailableMoves(board);

  if (difficulty === 'easy') {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const maxDepth = difficulty === 'medium' ? 3 : undefined;
  let bestScore = -Infinity;
  let bestMove = moves[0];

  for (const i of moves) {
    board[i] = 'O';
    const score = minimax(board, 0, false, -Infinity, Infinity, maxDepth);
    board[i] = '';
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }

  return bestMove;
}

function triggerCPUMove() {
  cpuThinking = true;
  cpuTimeoutId = setTimeout(() => {
    const index = getBestMove([...gameState], difficulty);
    if (!gameActive || index === undefined) {
      cpuThinking = false;
      return;
    }

    gameState[index] = 'O';
    const cell = cells[index];
    cell.innerHTML = SVG_O;
    cell.classList.add('o');
    setNamesDisabled(true);

    audio.playMove();

    if (checkWin()) {
      cpuThinking = false;
      return;
    }
    if (checkDraw()) {
      cpuThinking = false;
      return;
    }

    currentPlayer = 'X';
    turnSubtitle.textContent = `${getPlayerName('X')}'s turn`;
    cpuThinking = false;
    updateTurnIndicator();
    timer.reset();
  }, 400);
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
      timer.stop();
      cells[a].classList.add('win');
      cells[b].classList.add('win');
      cells[c].classList.add('win');
      audio.playWin();
      turnSubtitle.textContent = `${getPlayerName(currentPlayer)} wins!`;
      getIndicator(currentPlayer).classList.add('winner');
      getIndicator(currentPlayer).classList.remove('active');
      getIndicator(currentPlayer === 'X' ? 'O' : 'X').classList.remove('active', 'inactive');
      if (currentPlayer === 'X') scoreX++; else scoreO++;
      localStorage.setItem('scoreX', scoreX);
      localStorage.setItem('scoreO', scoreO);
      updateScoreDisplay();
      saveGameHistory(currentPlayer);
      const style = getComputedStyle(document.documentElement);
      const winColor = style.getPropertyValue(currentPlayer === 'X' ? '--color-x' : '--color-o').trim();
      drawWinLine(pattern, winColor);
      showModeUI(true);
      timer.forfeitStreak = 0;
      localStorage.setItem('timerForfeitStreak', '0');
      return true;
    }
  }
  return false;
}

function checkDraw() {
  if (gameState.every(cell => cell !== '')) {
    gameActive = false;
    timer.stop();
    audio.playDraw();
    turnSubtitle.textContent = "It's a draw!";
    getIndicator('X').classList.remove('active', 'inactive');
    getIndicator('O').classList.remove('active', 'inactive');
    saveGameHistory('Draw');
    showModeUI(true);
    timer.forfeitStreak = 0;
    localStorage.setItem('timerForfeitStreak', '0');
    return true;
  }
  return false;
}

function resetGame() {
  currentPlayer = 'X';
  gameState = ['', '', '', '', '', '', '', '', ''];
  gameActive = true;
  cpuThinking = false;
  if (cpuTimeoutId) {
    clearTimeout(cpuTimeoutId);
    cpuTimeoutId = null;
  }
  setNamesDisabled(false);
  updateTurnIndicator();
  timer.forfeitStreak = 0;
  localStorage.setItem('timerForfeitStreak', '0');
  cells.forEach(cell => {
    cell.textContent = '';
    cell.classList.remove('x', 'o', 'win');
  });
  if (winAnimId) cancelAnimationFrame(winAnimId);
  winAnimId = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  triggerBoardEnter();
  showModeUI(true);
  timer.reset();
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

function showModeUI(show) {
  modeSelector.style.display = show ? 'flex' : 'none';
  if (gameMode === 'pve') {
    difficultySelector.style.display = show ? 'flex' : 'none';
  } else {
    difficultySelector.style.display = 'none';
  }
}

function setMode(mode) {
  gameMode = mode;
  modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
  if (mode === 'pve') {
    difficultySelector.style.display = 'flex';
    nameOInput.value = 'CPU';
    nameOInput.disabled = true;
  } else {
    difficultySelector.style.display = 'none';
    nameOInput.value = loadName('O');
    nameOInput.disabled = false;
  }
  if (!gameActive) resetGame();
}

function setDifficulty(diff) {
  difficulty = diff;
  localStorage.setItem('difficulty', diff);
  diffBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.diff === diff));
}

function openSettings() {
  settingsPanel.classList.add('open');
  settingsOverlay.classList.add('open');
}

function closeSettings() {
  settingsPanel.classList.remove('open');
  settingsOverlay.classList.remove('open');
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

function handleVisibilityChange() {
  if (document.hidden) {
    timer.pause();
  } else {
    timer.resume();
  }
}

const modeSelector = document.getElementById('modeSelector');
const difficultySelector = document.getElementById('difficultySelector');
const modeBtns = document.querySelectorAll('.mode-btn');
const diffBtns = document.querySelectorAll('.diff-btn');

cells.forEach(cell => cell.addEventListener('click', handleCellClick));
resetBtn.addEventListener('click', resetGame);
resetScoreBtn.addEventListener('click', resetScore);
themeToggle.addEventListener('click', toggleTheme);
muteToggle.addEventListener('click', toggleMute);
clearHistoryBtn.addEventListener('click', clearHistory);
settingsToggle.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', closeSettings);
document.addEventListener('visibilitychange', handleVisibilityChange);

timerToggle.addEventListener('change', () => {
  timer.setEnabled(timerToggle.checked);
});

durationBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    timer.setDuration(parseInt(btn.dataset.duration, 10));
  });
});

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    setMode(btn.dataset.mode);
    resetGame();
  });
});

diffBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    setDifficulty(btn.dataset.diff);
  });
});

showModeUI(true);
setMode('pvp');
setDifficulty(difficulty);
timer.loadSettings();
timer.reset();
updateTurnIndicator();
renderHistory();
triggerBoardEnter();
