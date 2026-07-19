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
const sharePanel = document.getElementById('sharePanel');
const replayCanvas = document.getElementById('replayCanvas');
const replayCtx = replayCanvas.getContext('2d');
const shareCopy = document.getElementById('shareCopy');
const shareDownload = document.getElementById('shareDownload');
const shareClose = document.getElementById('shareClose');
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
let moveHistory = [];
let gameActive = true;
let winAnimId = null;
let winningPattern = null;
let gameResult = null;
let replayAnimId = null;

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
      winningPattern = pattern;
      gameResult = currentPlayer;
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
      shareBtn.hidden = false;
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
    gameResult = 'Draw';
    audio.playDraw();
    status.textContent = "It's a draw!";
    saveGameHistory('Draw');
    shareBtn.hidden = false;
    return true;
  }
  return false;
}

function resetGame() {
  currentPlayer = 'X';
  gameState = ['', '', '', '', '', '', '', '', ''];
  moveHistory = [];
  gameActive = true;
  winningPattern = null;
  gameResult = null;
  shareBtn.hidden = true;
  hideSharePanel();
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

function getThemeColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    bg: style.getPropertyValue('--bg').trim(),
    text: style.getPropertyValue('--text').trim(),
    cellBg: style.getPropertyValue('--cell-bg').trim(),
    cellWin: style.getPropertyValue('--cell-win').trim(),
    colorX: style.getPropertyValue('--color-x').trim(),
    colorO: style.getPropertyValue('--color-o').trim(),
    glassBg: style.getPropertyValue('--glass-bg').trim(),
    glassBorder: style.getPropertyValue('--glass-border').trim(),
  };
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawAnnotatedBoard(ctx, W, H, state, result, highlightPattern) {
  const colors = getThemeColors();
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  const titleSize = Math.max(18, Math.floor(W * 0.06));
  const nameSize = Math.max(12, Math.floor(W * 0.035));
  const metaSize = Math.max(10, Math.floor(W * 0.028));
  const resultSize = Math.max(16, Math.floor(W * 0.045));

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = colors.text;
  ctx.font = `bold ${titleSize}px Inter, system-ui, sans-serif`;
  ctx.fillText('Tic-Tac-Toe', W / 2, W * 0.08);

  ctx.font = `${nameSize}px Inter, system-ui, sans-serif`;
  ctx.fillText(`${getPlayerName('X')} vs ${getPlayerName('O')}`, W / 2, W * 0.125);

  ctx.font = `${metaSize}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = '#888';
  ctx.fillText(`Round #${roundNumber}`, W / 2, W * 0.16);

  const now = new Date();
  ctx.fillText(`${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, W / 2, W * 0.19);

  const boardSize = W * 0.7;
  const gap = Math.max(3, Math.floor(boardSize * 0.02));
  const cellSize = (boardSize - 2 * gap) / 3;
  const boardLeft = (W - boardSize) / 2;
  const boardTop = W * 0.28;

  roundRect(ctx, boardLeft - gap, boardTop - gap, boardSize + 2 * gap, boardSize + 2 * gap, gap, colors.glassBg, colors.glassBorder);

  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = boardLeft + col * (cellSize + gap);
    const cy = boardTop + row * (cellSize + gap);
    const isWin = highlightPattern && highlightPattern.includes(i) && result !== 'Draw';
    roundRect(ctx, cx + 1, cy + 1, cellSize - 2, cellSize - 2, cellSize * 0.05, isWin ? colors.cellWin : colors.cellBg);
  }

  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = boardLeft + col * (cellSize + gap);
    const cy = boardTop + row * (cellSize + gap);
    const pad = cellSize * 0.22;
    const strokeW = Math.max(3, cellSize * 0.08);

    if (state[i] === 'X') {
      ctx.strokeStyle = colors.colorX;
      ctx.lineWidth = strokeW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + pad, cy + pad);
      ctx.lineTo(cx + cellSize - pad, cy + cellSize - pad);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + cellSize - pad, cy + pad);
      ctx.lineTo(cx + pad, cy + cellSize - pad);
      ctx.stroke();
    } else if (state[i] === 'O') {
      ctx.strokeStyle = colors.colorO;
      ctx.lineWidth = strokeW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx + cellSize / 2, cy + cellSize / 2, cellSize * 0.28, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (result) {
    ctx.font = `bold ${resultSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const resultY = boardTop + boardSize + W * 0.08;
    if (result === 'Draw') {
      ctx.fillStyle = '#888';
      ctx.fillText("It's a draw!", W / 2, resultY);
    } else if (result === 'X') {
      ctx.fillStyle = colors.colorX;
      ctx.fillText(`${getPlayerName('X')} wins!`, W / 2, resultY);
    } else {
      ctx.fillStyle = colors.colorO;
      ctx.fillText(`${getPlayerName('O')} wins!`, W / 2, resultY);
    }
  }
}

function hideSharePanel() {
  sharePanel.hidden = true;
  if (replayAnimId) {
    cancelAnimationFrame(replayAnimId);
    replayAnimId = null;
  }
}

function startReplay() {
  if (replayAnimId) {
    cancelAnimationFrame(replayAnimId);
  }
  const states = [Array(9).fill(''), ...moveHistory];
  const start = performance.now();
  const frameDuration = 700;

  function frame(now) {
    const elapsed = now - start;
    const i = Math.min(Math.floor(elapsed / frameDuration), states.length - 1);
    const isFinal = i === states.length - 1;
    drawAnnotatedBoard(replayCtx, replayCanvas.width, replayCanvas.height, states[i], isFinal ? gameResult : null, isFinal ? winningPattern : null);
    if (isFinal) {
      replayAnimId = null;
    } else {
      replayAnimId = requestAnimationFrame(frame);
    }
  }

  replayAnimId = requestAnimationFrame(frame);
}

function shareGame() {
  if (!gameResult) return;
  sharePanel.hidden = false;
  startReplay();
}

function createShareCanvas() {
  const cvs = document.createElement('canvas');
  cvs.width = 600;
  cvs.height = 760;
  const c = cvs.getContext('2d');
  drawAnnotatedBoard(c, cvs.width, cvs.height, gameState, gameResult, winningPattern);
  return cvs;
}

function copyShareImage() {
  const cvs = createShareCanvas();
  cvs.toBlob((blob) => {
    if (!blob) return;
    if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(() => showShareToast('Image copied to clipboard!'))
        .catch(() => showShareToast('Clipboard copy not supported. Try downloading instead.'));
    } else {
      showShareToast('Clipboard copy not supported. Try downloading instead.');
    }
  }, 'image/png');
}

function downloadShareImage() {
  const cvs = createShareCanvas();
  const link = document.createElement('a');
  link.download = `tic-tac-toe-round-${roundNumber}.png`;
  link.href = cvs.toDataURL('image/png');
  link.click();
}

function showShareToast(msg) {
  let toast = document.querySelector('.share-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'share-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
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
shareBtn.addEventListener('click', shareGame);
shareCopy.addEventListener('click', copyShareImage);
shareDownload.addEventListener('click', downloadShareImage);
shareClose.addEventListener('click', hideSharePanel);

triggerBoardEnter();
renderHistory();
