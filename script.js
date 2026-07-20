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

const DEFAULT_COLOR_X = '#00d4ff';
const DEFAULT_COLOR_O = '#ff6b6b';

const PRESETS_X = [
  '#00d4ff', '#3b82f6', '#6366f1', '#a855f7',
  '#ec4899', '#22c55e', '#14b8a6', '#f8fafc'
];

const PRESETS_O = [
  '#ff6b6b', '#f43f5e', '#f97316', '#f59e0b',
  '#84cc16', '#06b6d4', '#8b5cf6', '#1e293b'
];

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

const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const settingsClose = document.getElementById('settingsClose');
const colorPresetsX = document.getElementById('colorPresetsX');
const colorPresetsO = document.getElementById('colorPresetsO');
const colorPickerX = document.getElementById('colorPickerX');
const colorPickerO = document.getElementById('colorPickerO');
const resetColorsBtn = document.getElementById('resetColors');

let playerColors = {
  X: localStorage.getItem('colorX') || DEFAULT_COLOR_X,
  O: localStorage.getItem('colorO') || DEFAULT_COLOR_O,
};

function applyPlayerColors() {
  document.documentElement.style.setProperty('--color-x', playerColors.X);
  document.documentElement.style.setProperty('--color-o', playerColors.O);
}

function savePlayerColors() {
  localStorage.setItem('colorX', playerColors.X);
  localStorage.setItem('colorO', playerColors.O);
}

function normalizeColor(color) {
  return color.toLowerCase().trim();
}

function resolveColorConflict(player, desiredColor) {
  const other = player === 'X' ? 'O' : 'X';
  const normalizedDesired = normalizeColor(desiredColor);
  const normalizedOther = normalizeColor(playerColors[other]);
  if (normalizedDesired !== normalizedOther) {
    return { [player]: desiredColor, [other]: playerColors[other] };
  }

  const otherDefault = other === 'X' ? DEFAULT_COLOR_X : DEFAULT_COLOR_O;
  if (normalizeColor(otherDefault) !== normalizedDesired) {
    return { [player]: desiredColor, [other]: otherDefault };
  }

  const otherPresets = other === 'X' ? PRESETS_X : PRESETS_O;
  const fallback = otherPresets.find(c => normalizeColor(c) !== normalizedDesired);
  return { [player]: desiredColor, [other]: fallback || otherDefault };
}

function setPlayerColor(player, color) {
  const resolved = resolveColorConflict(player, color);
  playerColors.X = resolved.X;
  playerColors.O = resolved.O;
  applyPlayerColors();
  savePlayerColors();
  updateColorControls();
}

function createPresetSwatches(container, player, presets) {
  container.innerHTML = '';
  presets.forEach((color, index) => {
    const swatch = document.createElement('button');
    swatch.className = 'color-swatch';
    swatch.type = 'button';
    swatch.style.backgroundColor = color;
    swatch.dataset.color = color;
    swatch.setAttribute('aria-label', `Player ${player} color ${index + 1}`);
    swatch.addEventListener('click', () => setPlayerColor(player, color));
    container.appendChild(swatch);
  });
}

function updateColorControls() {
  colorPickerX.value = playerColors.X;
  colorPickerO.value = playerColors.O;

  colorPresetsX.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.classList.toggle('active', normalizeColor(swatch.dataset.color) === normalizeColor(playerColors.X));
  });
  colorPresetsO.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.classList.toggle('active', normalizeColor(swatch.dataset.color) === normalizeColor(playerColors.O));
  });
}

function openSettings() {
  settingsPanel.hidden = false;
  requestAnimationFrame(() => settingsPanel.classList.add('open'));
  settingsClose.focus();
}

function closeSettings() {
  settingsPanel.classList.remove('open');
  setTimeout(() => {
    settingsPanel.hidden = true;
    settingsToggle.focus();
  }, 300);
}

function resetColors() {
  playerColors.X = DEFAULT_COLOR_X;
  playerColors.O = DEFAULT_COLOR_O;
  applyPlayerColors();
  savePlayerColors();
  updateColorControls();
}

createPresetSwatches(colorPresetsX, 'X', PRESETS_X);
createPresetSwatches(colorPresetsO, 'O', PRESETS_O);

applyPlayerColors();
updateColorControls();

colorPickerX.addEventListener('input', (e) => setPlayerColor('X', e.target.value));
colorPickerO.addEventListener('input', (e) => setPlayerColor('O', e.target.value));
resetColorsBtn.addEventListener('click', resetColors);

settingsToggle.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsBackdrop.addEventListener('click', closeSettings);

settingsPanel.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSettings();
  }
});

cells.forEach(cell => cell.addEventListener('click', handleCellClick));
resetBtn.addEventListener('click', resetGame);
resetScoreBtn.addEventListener('click', resetScore);
themeToggle.addEventListener('click', toggleTheme);
muteToggle.addEventListener('click', toggleMute);
clearHistoryBtn.addEventListener('click', clearHistory);

triggerBoardEnter();
renderHistory();
