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
let moveCount = 0;

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
  renderStats();
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
  cell.innerHTML = currentPlayer === 'X' ? SVG_X : SVG_O;
  cell.classList.add(currentPlayer.toLowerCase());
  moveCount++;
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
      if (currentPlayer === 'X') scoreX++; else scoreO++;
      localStorage.setItem('scoreX', scoreX);
      localStorage.setItem('scoreO', scoreO);
      updateScoreDisplay();
      updateStatsOnWin(currentPlayer);
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
    updateStatsOnDraw();
    saveGameHistory('Draw');
    return true;
  }
  return false;
}

function resetGame() {
  currentPlayer = 'X';
  gameState = ['', '', '', '', '', '', '', '', ''];
  gameActive = true;
  moveCount = 0;
  status.textContent = `${getPlayerName('X')}'s turn`;
  setNamesDisabled(false);
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

function getStats() {
  try {
    return JSON.parse(localStorage.getItem('stats'));
  } catch {
    return null;
  }
}

function defaultStats() {
  return { totalGames: 0, drawCount: 0, winStreakX: 0, bestStreakX: 0, winStreakO: 0, bestStreakO: 0, movesToWinX: 0, winsX: 0, gamesWonX: 0, movesToWinO: 0, winsO: 0, gamesWonO: 0 };
}

function saveStats(stats) {
  localStorage.setItem('stats', JSON.stringify(stats));
}

function updateStatsOnWin(winner) {
  let stats = getStats();
  if (!stats) stats = defaultStats();
  stats.totalGames++;
  if (winner === 'X') {
    stats.winsX++;
    stats.winStreakX++;
    stats.winStreakO = 0;
    if (stats.winStreakX > stats.bestStreakX) stats.bestStreakX = stats.winStreakX;
    stats.movesToWinX += moveCount;
    stats.gamesWonX++;
  } else {
    stats.winsO++;
    stats.winStreakO++;
    stats.winStreakX = 0;
    if (stats.winStreakO > stats.bestStreakO) stats.bestStreakO = stats.winStreakO;
    stats.movesToWinO += moveCount;
    stats.gamesWonO++;
  }
  saveStats(stats);
  renderStats();
}

function updateStatsOnDraw() {
  let stats = getStats();
  if (!stats) stats = defaultStats();
  stats.totalGames++;
  stats.drawCount++;
  stats.winStreakX = 0;
  stats.winStreakO = 0;
  saveStats(stats);
  renderStats();
}

function renderStats() {
  const stats = getStats();
  const body = document.getElementById('statsBody');
  if (!stats || stats.totalGames === 0) {
    body.innerHTML = '<div class="stats-empty">No stats yet. Play some games!</div>';
    return;
  }
  const total = stats.totalGames;
  const xPct = (stats.winsX / total * 100).toFixed(0);
  const oPct = (stats.winsO / total * 100).toFixed(0);
  const dPct = (stats.drawCount / total * 100).toFixed(0);
  const avgX = stats.gamesWonX > 0 ? (stats.movesToWinX / stats.gamesWonX).toFixed(1) : '-';
  const avgO = stats.gamesWonO > 0 ? (stats.movesToWinO / stats.gamesWonO).toFixed(1) : '-';

  body.innerHTML = `
    <div class="stat-total">Total Games: ${total}</div>
    <div class="win-rate-bar">
      <div class="win-rate-bar-seg win-rate-bar-x" style="width:${xPct}%"></div>
      <div class="win-rate-bar-seg win-rate-bar-d" style="width:${dPct}%"></div>
      <div class="win-rate-bar-seg win-rate-bar-o" style="width:${oPct}%"></div>
    </div>
    <div class="win-rate-labels">
      <span class="label-x">${getPlayerName('X')} ${xPct}%</span>
      <span class="label-d">Draw ${dPct}%</span>
      <span class="label-o">${getPlayerName('O')} ${oPct}%</span>
    </div>
    <div class="streaks">
      <div class="streak-entry">
        <div>${getPlayerName('X')}</div>
        <div class="streak-current">${stats.winStreakX}</div>
        <div class="streak-best">best: ${stats.bestStreakX}</div>
      </div>
      <div class="streak-entry">
        <div>${getPlayerName('O')}</div>
        <div class="streak-current">${stats.winStreakO}</div>
        <div class="streak-best">best: ${stats.bestStreakO}</div>
      </div>
    </div>
    <div class="avg-moves">Avg moves to win</div>
    <div class="avg-moves-values">
      <span class="label-x">${getPlayerName('X')}: ${avgX}</span>
      <span class="label-o">${getPlayerName('O')}: ${avgO}</span>
    </div>
    <button class="reset reset-stats" id="resetStats">Reset Stats</button>
  `;
  document.getElementById('resetStats').addEventListener('click', resetStats);
}

function resetStats() {
  localStorage.removeItem('stats');
  renderStats();
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

cells.forEach(cell => cell.addEventListener('click', handleCellClick));
resetBtn.addEventListener('click', resetGame);
resetScoreBtn.addEventListener('click', resetScore);
themeToggle.addEventListener('click', toggleTheme);
muteToggle.addEventListener('click', toggleMute);
clearHistoryBtn.addEventListener('click', clearHistory);

const statsToggle = document.getElementById('statsToggle');
statsToggle.addEventListener('click', () => {
  const body = document.getElementById('statsBody');
  body.classList.toggle('collapsed');
  statsToggle.classList.toggle('collapsed');
  localStorage.setItem('statsPanelOpen', !body.classList.contains('collapsed'));
});

const statsOpen = localStorage.getItem('statsPanelOpen') !== 'false';
if (!statsOpen) {
  document.getElementById('statsBody').classList.add('collapsed');
  statsToggle.classList.add('collapsed');
}

triggerBoardEnter();
renderHistory();
renderStats();
