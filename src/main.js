import './style.css';
import { COUNTRIES, TOP_50_CODES } from './countries.js';
import { BattleRoyaleGame } from './game.js';
import { sound } from './audio.js';

// DOM Elements
const canvas = document.getElementById('arenaCanvas');
const aliveCountEl = document.getElementById('aliveCount');
const outCountEl = document.getElementById('outCount');
const gameTimerEl = document.getElementById('gameTimer');
const currentModeLabelEl = document.getElementById('currentModeLabel');
const eliminationListEl = document.getElementById('eliminationList');
const suspenseBannerEl = document.getElementById('suspenseBanner');
const speedIndicatorEl = document.getElementById('speedIndicator');

// Controls
const btnPlayPause = document.getElementById('btnPlayPause');
const btnRestart = document.getElementById('btnRestart');
const btnSound = document.getElementById('btnSound');
const soundIcon = document.getElementById('soundIcon');
const btnFullscreen = document.getElementById('btnFullscreen');
const btnStreamerMode = document.getElementById('btnStreamerMode');
const btnShowControls = document.getElementById('btnShowControls');
const streamerBar = document.getElementById('streamerBar');
const streamContainer = document.querySelector('.stream-container');

// Selectors
const modeSelect = document.getElementById('modeSelect');
const poolSelect = document.getElementById('poolSelect');
const speedBtns = document.querySelectorAll('.speed-btn');

// Modals
const customModal = document.getElementById('customModal');
const customNamesInput = document.getElementById('customNamesInput');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnSaveCustom = document.getElementById('btnSaveCustom');

const winnerModal = document.getElementById('winnerModal');
const winnerFlagImg = document.getElementById('winnerFlagImg');
const winnerNameEl = document.getElementById('winnerName');
const winnerStatsEl = document.getElementById('winnerStats');
const btnPlayAgain = document.getElementById('btnPlayAgain');

// Game Selection Hub Elements
const gameHubModal = document.getElementById('gameHubModal');
const btnSwitchGame = document.getElementById('btnSwitchGame');
const btnCloseHub = document.getElementById('btnCloseHub');
const btnLaunchFlagRoyale = document.getElementById('btnLaunchFlagRoyale');
const btnQuickStart = document.getElementById('btnQuickStart');
const chkShowHubOnStartup = document.getElementById('chkShowHubOnStartup');
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const feedCountBadge = document.getElementById('feedCountBadge');

// Start Match Overlay Elements
const startMatchOverlay = document.getElementById('startMatchOverlay');
const startMatchInfo = document.getElementById('startMatchInfo');
const btnStartRound = document.getElementById('btnStartRound');

// Preview Roadmap Modal Elements
const previewModal = document.getElementById('previewModal');
const previewTitle = document.getElementById('previewTitle');
const previewDesc = document.getElementById('previewDesc');
const previewFeatures = document.getElementById('previewFeatures');
const btnClosePreview = document.getElementById('btnClosePreview');
const btnVoteFeature = document.getElementById('btnVoteFeature');

// Upcoming Games Roadmap Content
const UPCOMING_GAMES = {
  plinko: {
    title: 'Plinko Flag Drop 🎰',
    desc: 'An unpredictable physics pegboard game! Watch flags tumble down hundreds of pegs into score multiplier slots, sudden elimination pits, and fan-voted bonus zones.',
    features: [
      '⚡ Multi-lane peg matrix with bouncy physics',
      '🔥 Danger lava slots & 10x jackpot multipliers',
      '💬 Chat integration for live viewer betting',
      '🔊 Satisfying mechanical chime sound effects'
    ]
  },
  'marble-race': {
    title: 'Flag Marble Track Race 🏁',
    desc: 'Downhill high-speed obstacle course! Contenders race through loop-de-loops, moving hammer obstacles, speed booster pads, and narrow funnel chicanes to crown the champion.',
    features: [
      '🏎️ 3D-styled downhill racetrack layout',
      '🔨 Dynamic rotating sweepers & catapult jumps',
      '🚀 Nitro speed boost zones & shortcut gates',
      '📸 Photo-finish slow motion camera at the line'
    ]
  },
  'sumo-ring': {
    title: 'Flag Sumo Ring 🥊',
    desc: 'Intense bumper combat arena! Contenders collide with extreme bouncy force to knock opponents out of an electrified shrinking perimeter.',
    features: [
      '💥 Hyper-restitution collision impulse physics',
      '⚠️ Electrified danger boundary ring',
      '⚡ Sudden Death Overdrive speed acceleration',
      '👑 Champion heavyweight belt celebrations'
    ]
  }
};

// Game State
let gameInstance = null;
let currentContenders = [];
let timerInterval = null;
let elapsedSeconds = 0;
let customViewerList = [];

// Format seconds into MM:SS
function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function startTimer() {
  stopTimer();
  elapsedSeconds = 0;
  gameTimerEl.textContent = '00:00';
  timerInterval = setInterval(() => {
    if (gameInstance && gameInstance.isRunning && !gameInstance.isPaused && !gameInstance.isGameOver) {
      elapsedSeconds++;
      gameTimerEl.textContent = formatTime(elapsedSeconds);
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Get Contenders based on pool selection
function getContenders(poolKey) {
  if (poolKey === 'top50') {
    return COUNTRIES.filter(c => TOP_50_CODES.includes(c.code));
  } else if (poolKey === 'all') {
    return [...COUNTRIES];
  } else if (['americas', 'europe', 'asia', 'africa'].includes(poolKey)) {
    return COUNTRIES.filter(c => c.continent.toLowerCase() === poolKey);
  } else if (poolKey === 'custom') {
    if (customViewerList.length > 0) {
      return customViewerList;
    }
    return COUNTRIES.slice(0, 30);
  }
  return COUNTRIES.filter(c => TOP_50_CODES.includes(c.code));
}

// Start or setup a fresh match (autoStart defaults to false so user clicks Start when ready)
function startMatch(autoStart = false) {
  stopTimer();
  elapsedSeconds = 0;
  gameTimerEl.textContent = '00:00';
  suspenseBannerEl.classList.add('hidden');
  winnerModal.classList.add('hidden');
  eliminationListEl.innerHTML = '';
  if (feedCountBadge) feedCountBadge.textContent = '0';

  const poolKey = poolSelect.value;
  currentContenders = getContenders(poolKey);

  const modeNames = {
    classic: 'ROTATING CIRCLE',
    dual: 'DUAL COUNTER-RINGS',
    shrinking: 'SHRINKING STORM',
    hexagon: 'SPINNING HEXAGON'
  };
  if (startMatchInfo) {
    startMatchInfo.textContent = `MODE: ${modeNames[modeSelect.value] || 'ROTATING CIRCLE'} • ${currentContenders.length} COUNTRIES`;
  }

  if (!gameInstance) {
    gameInstance = new BattleRoyaleGame(canvas, {
      gameMode: modeSelect.value,
      onElimination: handleElimination,
      onWinner: handleWinner,
      onCountChange: (alive, total) => {
        aliveCountEl.textContent = alive;
        outCountEl.textContent = total - alive;
      },
      onTop5Alert: () => {
        suspenseBannerEl.classList.remove('hidden');
      }
    });
  } else {
    gameInstance.setGameMode(modeSelect.value);
  }

  gameInstance.init(currentContenders, autoStart);

  if (autoStart) {
    if (btnStartRound) btnStartRound.classList.add('hidden');
    btnPlayPause.innerHTML = '<span class="btn-icon">⏸</span> <span class="btn-text">Pause</span>';
    btnPlayPause.classList.remove('btn-glow');
    startTimer();
  } else {
    if (btnStartRound) btnStartRound.classList.remove('hidden');
    btnPlayPause.innerHTML = '<span class="btn-icon">🚀</span> <span class="btn-text">Start Round</span>';
    btnPlayPause.classList.add('btn-glow');
  }
}

function launchRound() {
  if (!gameInstance) return;
  if (btnStartRound) btnStartRound.classList.add('hidden');
  gameInstance.startRound();
  startTimer();
  btnPlayPause.innerHTML = '<span class="btn-icon">⏸</span> <span class="btn-text">Pause</span>';
  btnPlayPause.classList.remove('btn-glow');
}

function handleElimination(record) {
  const card = document.createElement('div');
  card.className = 'elimination-card';

  const flagHtml = record.contender.code
    ? `<img src="https://flagcdn.com/w40/${record.contender.code}.png" alt="${record.contender.name}" class="card-flag" onerror="this.style.display='none'" />`
    : `<div class="card-flag-fallback">${record.contender.name.slice(0, 3).toUpperCase()}</div>`;

  card.innerHTML = `
    <span class="rank-badge">#${record.placement}</span>
    ${flagHtml}
    <span class="card-country-name">${record.contender.name}</span>
  `;

  eliminationListEl.prepend(card);

  if (feedCountBadge && gameInstance) {
    feedCountBadge.textContent = gameInstance.eliminated.length;
  }
}

function handleWinner(winnerData) {
  stopTimer();
  const c = winnerData.contender;
  winnerNameEl.textContent = c.name;
  winnerStatsEl.textContent = `Surviving Champion out of ${winnerData.totalContenders} contenders in ${formatTime(elapsedSeconds)}!`;

  if (c.code) {
    winnerFlagImg.src = `https://flagcdn.com/w160/${c.code}.png`;
    winnerFlagImg.style.display = 'block';
  } else {
    winnerFlagImg.style.display = 'none';
  }

  winnerModal.classList.remove('hidden');
}

// Event Listeners
btnPlayPause.addEventListener('click', () => {
  if (!gameInstance) return;
  if (gameInstance.isWaitingToStart) {
    launchRound();
    return;
  }
  const isPaused = gameInstance.togglePause();
  btnPlayPause.innerHTML = isPaused
    ? '<span class="btn-icon">▶</span> <span class="btn-text">Resume</span>'
    : '<span class="btn-icon">⏸</span> <span class="btn-text">Pause</span>';
});

if (btnStartRound) {
  btnStartRound.addEventListener('click', () => {
    launchRound();
  });
}

btnRestart.addEventListener('click', () => {
  startMatch(false);
});

btnPlayAgain.addEventListener('click', () => {
  startMatch(false);
});

// Speed Controls
speedBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    speedBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const spd = parseFloat(btn.dataset.speed);
    if (gameInstance) {
      gameInstance.setSpeed(spd);
    }
    speedIndicatorEl.textContent = `${spd.toFixed(1)}X`;
  });
});

// Mode Selection
modeSelect.addEventListener('change', (e) => {
  const modeNames = {
    classic: 'MODE: ROTATING CIRCLE',
    dual: 'MODE: DUAL COUNTER-RINGS',
    shrinking: 'MODE: SHRINKING STORM',
    hexagon: 'MODE: SPINNING HEXAGON'
  };
  currentModeLabelEl.textContent = modeNames[e.target.value] || 'MODE: CUSTOM';
  startMatch(false);
});

// Pool Selection
poolSelect.addEventListener('change', (e) => {
  if (e.target.value === 'custom') {
    customModal.classList.remove('hidden');
  } else {
    startMatch(false);
  }
});

// Custom Names Modal
btnCloseModal.addEventListener('click', () => {
  customModal.classList.add('hidden');
  poolSelect.value = 'top50';
});

btnSaveCustom.addEventListener('click', () => {
  const text = customNamesInput.value.trim();
  if (text) {
    const rawList = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (rawList.length > 0) {
      customViewerList = rawList.map((name, idx) => ({
        code: null,
        name: name,
        continent: 'Custom'
      }));
      customModal.classList.add('hidden');
      startMatch();
      return;
    }
  }
  alert('Please enter at least one name!');
});

// Sound Toggle
btnSound.addEventListener('click', () => {
  const isMuted = sound.toggleMute();
  soundIcon.textContent = isMuted ? '🔇' : '🔊';
});

// Fullscreen Toggle for mobile landscape streaming
btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// Streamer Mode (Clean Broadcast)
btnStreamerMode.addEventListener('click', () => {
  streamContainer.classList.add('clean-stream-mode');
  btnShowControls.classList.remove('hidden');
});

btnShowControls.addEventListener('click', () => {
  streamContainer.classList.remove('clean-stream-mode');
  btnShowControls.classList.add('hidden');
});

// Game Selection Hub Interactions
function openGameHub() {
  gameHubModal.classList.remove('hidden');
}

function closeGameHub() {
  gameHubModal.classList.add('hidden');
}

if (btnSwitchGame) {
  btnSwitchGame.addEventListener('click', () => {
    openGameHub();
  });
}

if (btnCloseHub) {
  btnCloseHub.addEventListener('click', () => {
    closeGameHub();
  });
}

if (btnLaunchFlagRoyale) {
  btnLaunchFlagRoyale.addEventListener('click', () => {
    closeGameHub();
    startMatch(false);
  });
}

if (btnQuickStart) {
  btnQuickStart.addEventListener('click', () => {
    closeGameHub();
    startMatch(false);
  });
}

// Remember startup preference
if (chkShowHubOnStartup) {
  const savedPref = localStorage.getItem('flag_royale_show_hub_on_startup');
  chkShowHubOnStartup.checked = savedPref !== 'false';

  chkShowHubOnStartup.addEventListener('change', (e) => {
    localStorage.setItem('flag_royale_show_hub_on_startup', e.target.checked ? 'true' : 'false');
  });
}

// Mobile Elimination Feed Toggle
if (btnToggleSidebar) {
  btnToggleSidebar.addEventListener('click', () => {
    streamContainer.classList.toggle('mobile-feed-open');
  });
}

// Upcoming Game Previews
document.querySelectorAll('.btn-preview-trigger, .upcoming-game').forEach(el => {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const gameKey = el.dataset.preview || el.dataset.game;
    const gameInfo = UPCOMING_GAMES[gameKey];
    if (!gameInfo) return;

    previewTitle.textContent = gameInfo.title;
    previewDesc.textContent = gameInfo.desc;
    previewFeatures.innerHTML = gameInfo.features.map(f => `<div class="preview-feature-item">${f}</div>`).join('');
    previewModal.classList.remove('hidden');
  });
});

if (btnClosePreview) {
  btnClosePreview.addEventListener('click', () => {
    previewModal.classList.add('hidden');
  });
}

if (btnVoteFeature) {
  btnVoteFeature.addEventListener('click', () => {
    btnVoteFeature.textContent = 'Voted! Thank You 💖';
    btnVoteFeature.classList.add('voted');
    setTimeout(() => {
      previewModal.classList.add('hidden');
      btnVoteFeature.textContent = 'Vote for this Game 👍';
      btnVoteFeature.classList.remove('voted');
    }, 1200);
  });
}

// Window resize handling
let resizeTimeout = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (gameInstance) {
      gameInstance.resize();
    }
  }, 100);
});

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
  const showHubOnStartup = localStorage.getItem('flag_royale_show_hub_on_startup') !== 'false';
  
  if (showHubOnStartup) {
    // Show game selector modal on startup as requested
    openGameHub();
    // Also prepare match underneath
    startMatch();
  } else {
    closeGameHub();
    startMatch();
  }
});
