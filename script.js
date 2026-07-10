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

function resizeCanvas() {
  canvas.width = board.offsetWidth;
  canvas.height = board.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
let scoreX = parseInt(localStorage.getItem('scoreX') || '0');
let scoreO = parseInt(localStorage.getItem('scoreO') || '0');
let roundNumber = parseInt(localStorage.getItem('roundNumber') || '0');

let seriesMode = localStorage.getItem('seriesMode') || 'single';
let seriesWinsX = parseInt(localStorage.getItem('seriesWinsX') || '0');
let seriesWinsO = parseInt(localStorage.getItem('seriesWinsO') || '0');
let seriesDraws = parseInt(localStorage.getItem('seriesDraws') || '0');
let seriesActive = localStorage.getItem('seriesActive') === 'true';
let seriesOver = localStorage.getItem('seriesOver') === 'true';
let seriesResults = JSON.parse(localStorage.getItem('seriesResults') || '[]');
let seriesTimerId = null;

const nameXInput = document.getElementById('nameX');
const nameOInput = document.getElementById('nameO');
const seriesBtns = document.querySelectorAll('.series-btn');
const seriesProgress = document.getElementById('seriesProgress');
const rematchBtn = document.getElementById('rematchBtn');
const rematchFromOverBtn = document.getElementById('rematchFromOverBtn');
const matchOver = document.getElementById('matchOver');
const matchOverTitle = document.getElementById('matchOverTitle');
const matchOverWinner = document.getElementById('matchOverWinner');
const matchOverScore = document.getElementById('matchOverScore');

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
  let text = `${getPlayerName(currentPlayer)}'s turn`;
  if (seriesMode !== 'single') {
    text += ` (${seriesWinsX}-${seriesWinsO})`;
  }
  status.textContent = text;
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

function getSeriesLength() {
  if (seriesMode === 'bo3') return 3;
  if (seriesMode === 'bo5') return 5;
  if (seriesMode === 'bo7') return 7;
  return 1;
}

function getSeriesMajority() {
  return Math.ceil(getSeriesLength() / 2);
}

function saveSeriesState() {
  localStorage.setItem('seriesMode', seriesMode);
  localStorage.setItem('seriesWinsX', seriesWinsX);
  localStorage.setItem('seriesWinsO', seriesWinsO);
  localStorage.setItem('seriesDraws', seriesDraws);
  localStorage.setItem('seriesActive', seriesActive);
  localStorage.setItem('seriesOver', seriesOver);
  localStorage.setItem('seriesResults', JSON.stringify(seriesResults));
}

function renderSeriesProgress() {
  const length = getSeriesLength();
  if (seriesMode === 'single') {
    seriesProgress.innerHTML = '';
    return;
  }
  let html = '';
  for (let i = 0; i < length; i++) {
    let cls = 'series-dot';
    if (i < seriesResults.length) {
      const result = seriesResults[i];
      if (result === 'x') cls += ' win-x';
      else if (result === 'o') cls += ' win-o';
      else cls += ' draw';
    } else if (i === seriesResults.length && seriesActive && !seriesOver) {
      cls += ' active-dot';
    }
    html += `<span class="${cls}"></span>`;
  }
  seriesProgress.innerHTML = html;
}

function setSeriesMode(mode) {
  if (mode === seriesMode) return;
  seriesMode = mode;
  seriesWinsX = 0;
  seriesWinsO = 0;
  seriesDraws = 0;
  seriesActive = mode !== 'single';
  seriesOver = false;
  seriesResults = [];
  if (seriesTimerId) {
    clearTimeout(seriesTimerId);
    seriesTimerId = null;
  }
  saveSeriesState();
  resetBoard();
  setNamesDisabled(false);
  matchOver.classList.remove('visible');
  rematchBtn.style.display = 'none';
  updateSeriesUI();
}

function updateSeriesUI() {
  seriesBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === seriesMode);
  });
  renderSeriesProgress();
  if (seriesMode === 'single') {
    updateScoreDisplay();
  }
}

function handleSeriesAfterGame(winner) {
  if (seriesMode === 'single') return;

  if (winner === 'X') seriesWinsX++;
  else if (winner === 'O') seriesWinsO++;
  else seriesDraws++;

  seriesResults.push(winner === 'X' ? 'x' : winner === 'O' ? 'o' : 'draw');
  seriesActive = true;
  saveSeriesState();
  renderSeriesProgress();

  const majority = getSeriesMajority();
  const seriesText = ` (${seriesWinsX}-${seriesWinsO})`;

  const allPlayed = seriesResults.length >= getSeriesLength();

  if (seriesWinsX >= majority || seriesWinsO >= majority || allPlayed) {
    const matchWinner = seriesWinsX >= majority ? 'X' : seriesWinsO >= majority ? 'O' : null;
    seriesOver = true;
    seriesActive = false;
    saveSeriesState();
    if (matchWinner) {
      status.textContent = `${getPlayerName(matchWinner)} wins the match!${seriesText}`;
      showMatchOver(matchWinner);
    } else {
      status.textContent = `The series ended in a draw!${seriesText}`;
      matchOverTitle.textContent = 'Series Drawn!';
      matchOverWinner.textContent = `No winner — tied ${seriesWinsX}-${seriesWinsO}`;
      matchOverScore.textContent = `Final Score: ${getPlayerName('X')} ${seriesWinsX} – ${seriesWinsO} ${getPlayerName('O')}`;
      matchOver.classList.add('visible');
      rematchBtn.style.display = 'inline-block';
    }
  } else if (winner) {
    status.textContent = `${getPlayerName(winner)} wins!${seriesText}`;
    seriesTimerId = setTimeout(advanceToNextGame, 2000);
  } else {
    status.textContent = `It's a draw!${seriesText}`;
    seriesTimerId = setTimeout(advanceToNextGame, 2000);
  }
}

function advanceToNextGame() {
  seriesTimerId = null;
  resetBoard();
}

function showMatchOver(winner) {
  matchOverTitle.textContent = 'Match Over!';
  matchOverWinner.textContent = `${getPlayerName(winner)} wins the series!`;
  matchOverScore.textContent = `Final Score: ${getPlayerName('X')} ${seriesWinsX} – ${seriesWinsO} ${getPlayerName('O')}`;
  matchOver.classList.add('visible');
  rematchBtn.style.display = 'inline-block';
}

function handleCellClick(e) {
  const cell = e.target;
  const index = cell.dataset.index;

  if (!gameActive || gameState[index] !== '') return;

  gameState[index] = currentPlayer;
  cell.innerHTML = currentPlayer === 'X' ? SVG_X : SVG_O;
  cell.classList.add(currentPlayer.toLowerCase());
  setNamesDisabled(true);

  audio.playMove();

  if (checkWin()) {
    handleSeriesAfterGame(currentPlayer);
    return;
  }
  if (checkDraw()) {
    handleSeriesAfterGame(null);
    return;
  }

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  status.textContent = `${getPlayerName(currentPlayer)}'s turn`;
  if (seriesMode !== 'single') {
    status.textContent += ` (${seriesWinsX}-${seriesWinsO})`;
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

function resetBoard() {
  currentPlayer = 'X';
  gameState = ['', '', '', '', '', '', '', '', ''];
  gameActive = true;
  status.textContent = `${getPlayerName('X')}'s turn`;
  if (seriesMode !== 'single') {
    status.textContent += ` (${seriesWinsX}-${seriesWinsO})`;
  }
  cells.forEach(cell => {
    cell.textContent = '';
    cell.classList.remove('x', 'o', 'win');
  });
  if (winAnimId) cancelAnimationFrame(winAnimId);
  winAnimId = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  triggerBoardEnter();
}

function resetSeries() {
  seriesWinsX = 0;
  seriesWinsO = 0;
  seriesDraws = 0;
  seriesActive = seriesMode !== 'single';
  seriesOver = false;
  seriesResults = [];
  if (seriesTimerId) {
    clearTimeout(seriesTimerId);
    seriesTimerId = null;
  }
  saveSeriesState();
  renderSeriesProgress();
  updateScoreDisplay();
  rematchBtn.style.display = 'none';
  matchOver.classList.remove('visible');
  matchOverTitle.textContent = 'Match Over!';
}

function resetGame() {
  resetBoard();
  resetSeries();
  setNamesDisabled(false);
  matchOver.classList.remove('visible');
}

function triggerBoardEnter() {
  cells.forEach((cell, i) => {
    cell.style.animationDelay = `${i * 50}ms`;
  });
  board.classList.remove('entered');
  void board.offsetWidth;
  board.classList.add('entered');
}

function startRematch() {
  resetSeries();
  resetBoard();
  setNamesDisabled(false);
  matchOver.classList.remove('visible');
  rematchBtn.style.display = 'none';
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
  let label = winner === 'Draw' ? 'Draw' : `${getPlayerName(winner)} wins`;
  if (seriesMode !== 'single') {
    label += ` [${seriesMode.toUpperCase()}]`;
  }
  history.unshift({
    round: roundNumber,
    winner: label,
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

cells.forEach(cell => cell.addEventListener('click', handleCellClick));
resetBtn.addEventListener('click', resetGame);
resetScoreBtn.addEventListener('click', resetScore);
themeToggle.addEventListener('click', toggleTheme);
muteToggle.addEventListener('click', toggleMute);
clearHistoryBtn.addEventListener('click', clearHistory);

seriesBtns.forEach(btn => {
  btn.addEventListener('click', () => setSeriesMode(btn.dataset.mode));
});
rematchBtn.addEventListener('click', startRematch);
rematchFromOverBtn.addEventListener('click', startRematch);

updateSeriesUI();

if (seriesActive || seriesOver) {
  renderSeriesProgress();
  if (seriesMode !== 'single') {
    if (seriesOver) {
      if (seriesWinsX > seriesWinsO) {
        status.textContent = `${getPlayerName('X')} wins the match! (${seriesWinsX}-${seriesWinsO})`;
        showMatchOver('X');
      } else if (seriesWinsO > seriesWinsX) {
        status.textContent = `${getPlayerName('O')} wins the match! (${seriesWinsX}-${seriesWinsO})`;
        showMatchOver('O');
      } else {
        status.textContent = `The series ended in a draw! (${seriesWinsX}-${seriesWinsO})`;
        matchOverTitle.textContent = 'Series Drawn!';
        matchOverWinner.textContent = `No winner — tied ${seriesWinsX}-${seriesWinsO}`;
        matchOverScore.textContent = `Final Score: ${getPlayerName('X')} ${seriesWinsX} – ${seriesWinsO} ${getPlayerName('O')}`;
        matchOver.classList.add('visible');
        rematchBtn.style.display = 'inline-block';
      }
    } else if (seriesResults.length > 0) {
      status.textContent = `${getPlayerName('X')}'s turn (${seriesWinsX}-${seriesWinsO})`;
      setNamesDisabled(true);
    }
  }
}

triggerBoardEnter();
renderHistory();
