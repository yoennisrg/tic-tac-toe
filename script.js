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
const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');
const timerEnabledInput = document.getElementById('timerEnabled');
const timerDurationInput = document.getElementById('timerDuration');
const turnIndicator = document.getElementById('turnIndicator');

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

const TOKEN_X = '<line class="x-line" x1="20" y1="20" x2="80" y2="80"/><line class="x-line" x1="80" y1="20" x2="20" y2="80"/>';
const TOKEN_O = '<circle class="o-circle" cx="50" cy="50" r="30"/>';
const SVG_X = `<svg class="symbol" viewBox="0 0 100 100">${TOKEN_X}</svg>`;
const SVG_O = `<svg class="symbol" viewBox="0 0 100 100">${TOKEN_O}</svg>`;

let currentPlayer = 'X';
let gameState = ['', '', '', '', '', '', '', '', ''];
let gameActive = true;
let winAnimId = null;

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
  renderTurnIndicator();
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
  setNamesDisabled(true);

  audio.playMove();

  if (checkWin()) return;
  if (checkDraw()) return;

  timerConsecutiveTimeouts[currentPlayer] = 0;
  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  timerConsecutiveTimeouts[currentPlayer] = 0;
  updateStatus();
  startTimer();
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
      stopTimer();
      renderTurnIndicator();
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
    stopTimer();
    renderTurnIndicator();
    audio.playDraw();
    status.textContent = "It's a draw!";
    saveGameHistory('Draw');
    return true;
  }
  return false;
}

function resetGame() {
  currentPlayer = 'X';
  gameState = ['', '', '', '', '', '', '', '', ''];
  gameActive = true;
  timerConsecutiveTimeouts = { X: 0, O: 0 };
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
  updateStatus();
  startTimer();
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

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 46;

let timerEnabled = localStorage.getItem('timerEnabled') === 'true';
let timerDuration = parseInt(localStorage.getItem('timerDuration') || '10', 10);
let timerRemaining = 0;
let timerInterval = null;
let timerPaused = false;
let timerConsecutiveTimeouts = { X: 0, O: 0 };

function saveTimerSettings() {
  localStorage.setItem('timerEnabled', timerEnabled);
  localStorage.setItem('timerDuration', timerDuration);
}

function renderSettings() {
  timerEnabledInput.checked = timerEnabled;
  timerDurationInput.value = String(timerDuration);
}

function toggleSettingsPanel() {
  const isHidden = settingsPanel.hasAttribute('hidden');
  if (isHidden) {
    settingsPanel.removeAttribute('hidden');
    settingsToggle.setAttribute('aria-expanded', 'true');
  } else {
    settingsPanel.setAttribute('hidden', '');
    settingsToggle.setAttribute('aria-expanded', 'false');
  }
}

function closeSettingsPanelOnOutsideClick(e) {
  if (!settingsPanel.contains(e.target) && !settingsToggle.contains(e.target)) {
    settingsPanel.setAttribute('hidden', '');
    settingsToggle.setAttribute('aria-expanded', 'false');
  }
}

function renderTurnIndicator() {
  if (!gameActive) {
    turnIndicator.innerHTML = '';
    return;
  }
  const color = currentPlayer === 'X' ? 'var(--color-x)' : 'var(--color-o)';
  const token = currentPlayer === 'X' ? TOKEN_X : TOKEN_O;
  const showRing = timerEnabled && !isCpuTurn();
  turnIndicator.innerHTML = `
    <svg class="turn-indicator__svg ${showRing ? '' : 'turn-indicator__svg--no-timer'}" viewBox="0 0 100 100" style="--turn-color: ${color};">
      <circle class="timer-ring-track" cx="50" cy="50" r="46" />
      <circle class="timer-ring-progress" cx="50" cy="50" r="46" style="--timer-progress: 1; --timer-circumference: ${TIMER_CIRCUMFERENCE.toFixed(2)};" />
      <g class="turn-indicator__token">${token}</g>
    </svg>
  `;
}

function isCpuTurn() {
  // Hook for issue #32: CPU mode can set window.cpuMode and window.cpuPlayer.
  return typeof window.cpuMode !== 'undefined' && window.cpuMode && currentPlayer === window.cpuPlayer;
}

function updateTimerVisual() {
  const ring = turnIndicator.querySelector('.timer-ring-progress');
  if (!ring) return;
  const progress = timerDuration > 0 ? timerRemaining / timerDuration : 0;
  ring.style.setProperty('--timer-progress', progress.toFixed(3));
  ring.classList.toggle('timer-ring--warning', timerRemaining <= 5 && timerRemaining > 3);
  ring.classList.toggle('timer-ring--danger', timerRemaining <= 3);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function pauseTimer() {
  timerPaused = true;
  const ring = turnIndicator.querySelector('.timer-ring-progress');
  if (ring) ring.classList.add('timer-ring--paused');
}

function resumeTimer() {
  timerPaused = false;
  const ring = turnIndicator.querySelector('.timer-ring-progress');
  if (ring) ring.classList.remove('timer-ring--paused');
}

function handleTimeout() {
  stopTimer();
  const player = currentPlayer;
  timerConsecutiveTimeouts[player]++;

  if (timerConsecutiveTimeouts[player] >= 3) {
    const opponent = player === 'X' ? 'O' : 'X';
    gameActive = false;
    status.textContent = `${getPlayerName(player)} timed out 3 times — ${getPlayerName(opponent)} wins!`;
    if (opponent === 'X') scoreX++; else scoreO++;
    localStorage.setItem('scoreX', scoreX);
    localStorage.setItem('scoreO', scoreO);
    updateScoreDisplay();
    saveGameHistory(opponent);
    renderTurnIndicator();
    return;
  }

  currentPlayer = player === 'X' ? 'O' : 'X';
  status.textContent = `${getPlayerName(player)} ran out of time — ${getPlayerName(currentPlayer)}'s turn`;
  renderTurnIndicator();
  startTimer();
}

function tickTimer() {
  if (!gameActive || !timerEnabled || timerPaused || isCpuTurn()) return;
  timerRemaining -= 0.1;
  if (timerRemaining <= 0) {
    timerRemaining = 0;
    updateTimerVisual();
    handleTimeout();
  } else {
    updateTimerVisual();
  }
}

function startTimer() {
  stopTimer();
  timerRemaining = timerDuration;
  timerPaused = false;
  renderTurnIndicator();
  if (!gameActive || !timerEnabled || isCpuTurn()) return;
  updateTimerVisual();
  timerInterval = setInterval(tickTimer, 100);
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
settingsToggle.addEventListener('click', toggleSettingsPanel);
document.addEventListener('click', closeSettingsPanelOnOutsideClick);

timerEnabledInput.addEventListener('change', () => {
  timerEnabled = timerEnabledInput.checked;
  saveTimerSettings();
  startTimer();
});

timerDurationInput.addEventListener('change', () => {
  timerDuration = parseInt(timerDurationInput.value, 10);
  saveTimerSettings();
  startTimer();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseTimer();
  } else {
    resumeTimer();
  }
});

triggerBoardEnter();
renderHistory();
renderSettings();
updateStatus();
startTimer();
