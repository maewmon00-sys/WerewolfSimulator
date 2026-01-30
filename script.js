// Game Configuration
const ROLES = {
    werewolf: { name: "Werewolf", icon: "🐺", desc: "หมาป่า: ฆ่าชาวบ้านตอนกลางคืน", team: "werewolf" },
    villager: { name: "Villager", icon: "👱", desc: "ชาวบ้าน: ช่วยกันจับหมาป่า", team: "villager" },
    seer: { name: "Seer", icon: "🔮", desc: "ผู้หยั่งรู้: ขอดูบทบาทคนอื่นได้คืนละ 1 คน", team: "villager" },
    bodyguard: { name: "Bodyguard", icon: "🛡️", desc: "ผู้คุ้มกัน: เลือกปกป้องคนได้คืนละ 1 คน", team: "villager" },
    madman: { name: "Madman", icon: "🤪", desc: "คนบ้า: ทำยังไงก็ได้ให้ถูกโหวตออก เพื่อชนะแต่เพียงผู้เดียว", team: "werewolf" },
    silencer: { name: "Silencer", icon: "🤫", desc: "ใบ้: เลือกใบ้คนได้ 1 คน ทำให้เขาพูดไม่ได้", team: "werewolf" }
};

// Game State
const game = {
    players: [],
    roleCounts: {
        werewolf: 1,
        seer: 1,
        bodyguard: 1,
        madman: 0,
        silencer: 0,
        villager: 0
    },
    assignedRoles: [],
    deck: [],
    currentPlayerIndex: 0,
    round: 1,
    phase: 'night',
    playerStatus: {},      // { playerName: 'alive' | 'dead' }
    nightActions: {},      // { playerName: { protected: bool, silenced: bool } }
    deathCause: {}         // { playerName: 'voted' | 'killed' }
};

// DOM Elements
const screens = {
    intro: document.getElementById('intro-screen'),
    setup: document.getElementById('setup-screen'),
    config: document.getElementById('config-screen'),
    reveal: document.getElementById('reveal-screen'),
    timer: document.getElementById('timer-screen'),
    summary: document.getElementById('summary-screen'),
    victory: document.getElementById('victory-screen')
};

// ==================== Screen Navigation ====================
function switchScreen(screenName) {
    Object.values(screens).forEach(el => {
        if (el) el.classList.remove('active');
    });

    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    }

    if (screenName !== 'timer') {
        stopTimer();
    }

    if (screenName === 'timer') {
        updateDashboardUI();
    }
}

// ==================== Intro Screen ====================
document.getElementById('intro-start-btn').addEventListener('click', () => {
    switchScreen('setup');
});

// ==================== Setup Screen ====================
const playerCountInput = document.getElementById('player-count');
const playerInputsContainer = document.getElementById('player-inputs-container');

function renderPlayerInputs() {
    const count = parseInt(playerCountInput.value) || 0;
    playerInputsContainer.innerHTML = '';
    if (count < 6) return;
    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');
        div.className = 'input-group';
        div.innerHTML = `<input type="text" placeholder="ชื่อผู้เล่นคนที่ ${i + 1}" required class="player-name-input">`;
        playerInputsContainer.appendChild(div);
    }
}

playerCountInput.addEventListener('input', renderPlayerInputs);
renderPlayerInputs();

document.getElementById('to-config-btn').addEventListener('click', () => {
    const count = parseInt(playerCountInput.value);
    if (count < 6) {
        alert("ต้องมีผู้เล่นอย่างน้อย 6 คน");
        return;
    }
    const inputs = document.querySelectorAll('.player-name-input');
    game.players = Array.from(inputs).map((input, idx) => input.value.trim() || `Player ${idx + 1}`);
    updateConfigUI();
    switchScreen('config');
});

// ==================== Config Screen ====================
function updateConfigUI() {
    document.getElementById('total-players-display').innerText = game.players.length;
    for (const role in game.roleCounts) {
        if (role === 'villager') continue;
        document.getElementById(`role-${role}-count`).innerText = game.roleCounts[role];
    }
    const totalSpecial = game.roleCounts.werewolf + game.roleCounts.seer + game.roleCounts.bodyguard + game.roleCounts.madman + game.roleCounts.silencer;
    const villagerCount = game.players.length - totalSpecial;
    game.roleCounts.villager = villagerCount;

    const villagerEl = document.getElementById('role-villager-count');
    villagerEl.innerText = villagerCount;
    const errorEl = document.getElementById('config-error');
    if (villagerCount < 0) {
        villagerEl.style.color = 'var(--danger)';
        errorEl.innerText = "จำนวนบทบาทเกินจำนวนผู้เล่น!";
        document.getElementById('start-game-btn').disabled = true;
    } else {
        villagerEl.style.color = 'var(--text-secondary)';
        errorEl.innerText = "";
        document.getElementById('start-game-btn').disabled = false;
    }
    document.getElementById('current-roles-count').innerText = totalSpecial + Math.max(0, villagerCount);
}

window.adjustRole = (role, delta) => {
    if (game.roleCounts[role] + delta < 0) return;
    game.roleCounts[role] += delta;
    updateConfigUI();
};

document.getElementById('back-to-setup-btn').addEventListener('click', () => switchScreen('setup'));

document.getElementById('start-game-btn').addEventListener('click', () => {
    prepareDeck();
    game.currentPlayerIndex = 0;
    // Initialize player status and night actions
    game.playerStatus = {};
    game.nightActions = {};
    game.players.forEach(p => {
        game.playerStatus[p] = 'alive';
        game.nightActions[p] = { protected: false, silenced: false };
    });
    showPassScreen();
    switchScreen('reveal');
});

// ==================== Deck Preparation ====================
function prepareDeck() {
    let pool = [];
    for (const [key, count] of Object.entries(game.roleCounts)) {
        for (let i = 0; i < count; i++) {
            pool.push(key);
        }
    }
    // Fisher-Yates Shuffle
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    game.deck = pool;
    game.assignedRoles = [];
}

// ==================== Reveal Screen ====================
const passState = document.getElementById('pass-state');
const cardSelectState = document.getElementById('card-select-state');
const roleState = document.getElementById('role-state');

function showPassScreen() {
    passState.classList.add('active');
    cardSelectState.classList.remove('active');
    roleState.classList.remove('active');

    const player = game.players[game.currentPlayerIndex];
    document.getElementById('current-player-name').innerText = player;
}

document.getElementById('start-pick-btn').addEventListener('click', () => {
    passState.classList.remove('active');
    cardSelectState.classList.add('active');
    renderCardGrid();
});

function renderCardGrid() {
    const grid = document.getElementById('card-grid');
    grid.innerHTML = '';

    game.deck.forEach((role, index) => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
            <div class="card-inner">
                <div class="card-back">?</div>
                <div class="card-front">
                    <div class="card-role-icon">${ROLES[role].icon}</div>
                    <div class="card-role-name">${ROLES[role].name}</div>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            if (cardSelectState.classList.contains('locked')) return;
            cardSelectState.classList.add('locked');
            card.classList.add('flipped');
            setTimeout(() => {
                revealRole(role, index);
            }, 800);
        });

        grid.appendChild(card);
    });

    cardSelectState.classList.remove('locked');
}

function revealRole(role, deckIndex) {
    const player = game.players[game.currentPlayerIndex];
    game.assignedRoles.push({ player, role });
    game.deck.splice(deckIndex, 1);

    cardSelectState.classList.remove('active');
    roleState.classList.add('active');

    const roleData = ROLES[role];
    document.getElementById('revealed-role-icon').innerText = roleData.icon;
    document.getElementById('revealed-role-name').innerText = roleData.name;
    document.getElementById('revealed-role-desc').innerText = roleData.desc;
}

document.getElementById('next-player-btn').addEventListener('click', () => {
    game.currentPlayerIndex++;
    if (game.currentPlayerIndex >= game.players.length) {
        switchScreen('timer');
    } else {
        showPassScreen();
    }
});

// ==================== Timer Screen ====================
let timerInterval = null;
let timerSeconds = 0;
let isTimerRunning = false;

const timerDisplay = document.getElementById('timer-display');
const timerToggleBtn = document.getElementById('timer-toggle-btn');

window.setTimer = (minutes) => {
    stopTimer();
    timerSeconds = minutes * 60;
    updateTimerDisplay();
    isTimerRunning = false;
    updateTimerBtnState();
};

document.getElementById('timer-toggle-btn').addEventListener('click', () => {
    if (isTimerRunning) {
        stopTimer();
    } else {
        startTimer();
    }
});

document.getElementById('timer-reset-btn').addEventListener('click', () => {
    stopTimer();
    timerSeconds = 0;
    updateTimerDisplay();
});

function startTimer() {
    if (timerSeconds <= 0) {
        timerSeconds = 180;
    }

    isTimerRunning = true;
    updateTimerBtnState();

    timerInterval = setInterval(() => {
        if (timerSeconds > 0) {
            timerSeconds--;
            updateTimerDisplay();
        } else {
            stopTimer();
            alert("⏰ หมดเวลาโหวต!");
        }
    }, 1000);
}

function stopTimer() {
    isTimerRunning = false;
    clearInterval(timerInterval);
    updateTimerBtnState();
}

function updateTimerDisplay() {
    const m = Math.floor(timerSeconds / 60);
    const s = timerSeconds % 60;
    timerDisplay.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    // Change color to red when 10 seconds or less
    if (timerSeconds <= 10 && timerSeconds > 0) {
        timerDisplay.classList.add('timer-danger');
    } else {
        timerDisplay.classList.remove('timer-danger');
    }
}

function updateTimerBtnState() {
    if (isTimerRunning) {
        timerToggleBtn.innerText = "หยุดชั่วคราว";
        timerToggleBtn.classList.replace('primary', 'warning');
    } else {
        timerToggleBtn.innerText = (timerSeconds > 0 && timerSeconds < 180) ? "ทำต่อ" : "เริ่มจับเวลา";
        timerToggleBtn.classList.replace('warning', 'primary');
    }
}

// ==================== Dashboard UI ====================
const phaseDisplay = document.getElementById('phase-display');

document.getElementById('next-phase-btn').addEventListener('click', () => {
    // Determine next phase
    let nextPhase;
    if (game.phase === 'night') {
        nextPhase = 'day';
    } else {
        nextPhase = 'night';
    }

    // Show transition then change phase
    showPhaseTransition(nextPhase, () => {
        if (nextPhase === 'day') {
            game.phase = 'day';
            clearNightAction('protected');
        } else {
            game.phase = 'night';
            game.round++;
            clearNightAction('silenced');
        }
        updateDashboardUI();
    });
});

// Phase Transition Animation
function showPhaseTransition(phase, callback) {
    const overlay = document.getElementById('phase-transition');
    const icon = document.getElementById('transition-icon');
    const title = document.getElementById('transition-title');
    const subtitle = document.getElementById('transition-subtitle');

    // Set content based on phase
    if (phase === 'night') {
        icon.innerText = '🌙';
        title.innerText = 'กลางคืน';
        subtitle.innerText = 'เวลาหมาป่าออกล่า...';
        overlay.className = 'phase-transition night active';
    } else {
        icon.innerText = '☀️';
        title.innerText = 'กลางวัน';
        subtitle.innerText = 'เวลาโหวตเพื่อหาหมาป่า!';
        overlay.className = 'phase-transition day active';
    }

    // Show for 1.5 seconds then hide
    setTimeout(() => {
        overlay.classList.remove('active');
        if (callback) callback();
    }, 1500);
}

function clearNightAction(actionType) {
    for (const player in game.nightActions) {
        if (game.nightActions[player]) {
            game.nightActions[player][actionType] = false;
        }
    }
}

function updateDashboardUI() {
    phaseDisplay.innerText = `${game.phase.charAt(0).toUpperCase() + game.phase.slice(1)} ${game.round}`;

    const nextPhaseBtn = document.getElementById('next-phase-btn');

    if (game.phase === 'night') {
        phaseDisplay.classList.add('night');
        phaseDisplay.style.color = '#818cf8';
        // Dark theme for night
        document.body.classList.remove('day-theme');
        document.body.classList.add('night-theme');
        if (nextPhaseBtn) nextPhaseBtn.innerText = 'Next Phase ☀️';
    } else {
        phaseDisplay.classList.remove('night');
        phaseDisplay.style.color = 'var(--warning)';
        // Light theme for day
        document.body.classList.remove('night-theme');
        document.body.classList.add('day-theme');
        if (nextPhaseBtn) nextPhaseBtn.innerText = 'Next Phase 🌙';
    }
}

// ==================== Summary Screen ====================
document.getElementById('to-summary-btn').addEventListener('click', () => {
    showSummary();
});

function showSummary() {
    stopTimer();
    switchScreen('summary');
    const list = document.getElementById('gm-role-list');

    list.style.display = 'none';
    document.getElementById('show-roles-btn').innerText = "แสดงสรุปบทบาท (สำหรับ GM)";

    list.innerHTML = '';
    game.assignedRoles.forEach(assignment => {
        const div = document.createElement('div');
        div.className = 'summary-item';
        div.innerHTML = `
            <span>${assignment.player}</span>
            <span class="summary-role">${ROLES[assignment.role].icon} ${ROLES[assignment.role].name}</span>
        `;
        list.appendChild(div);
    });
}

document.getElementById('show-roles-btn').addEventListener('click', (e) => {
    const list = document.getElementById('gm-role-list');
    const isHidden = window.getComputedStyle(list).display === 'none';

    if (isHidden) {
        list.style.display = 'block';
        e.target.innerText = "ซ่อนสรุปบทบาท";
    } else {
        list.style.display = 'none';
        e.target.innerText = "แสดงสรุปบทบาท (สำหรับ GM)";
    }
});

document.getElementById('restart-btn').addEventListener('click', () => {
    if (confirm("End current game and return to menu?")) {
        resetGame();
        stopTimer();
        switchScreen('intro');
    }
});

function resetGame() {
    game.round = 1;
    game.phase = 'night';
    game.playerStatus = {};
    game.nightActions = {};
    game.deathCause = {};
    game.assignedRoles = [];
    game.deck = [];

    // Reset theme to night
    document.body.classList.remove('day-theme');
    document.body.classList.remove('night-theme');
}

// ==================== GM Modal ====================
const gmModal = document.getElementById('gm-modal');
const gmModalList = document.getElementById('gm-modal-list');

document.getElementById('show-gm-modal-btn')?.addEventListener('click', () => {
    if (gmModal) {
        renderGMModal();
        gmModal.classList.add('active');
    }
});

document.getElementById('close-gm-modal-btn')?.addEventListener('click', () => {
    if (gmModal) gmModal.classList.remove('active');
});

window.addEventListener('click', (e) => {
    if (gmModal && e.target === gmModal) {
        gmModal.classList.remove('active');
    }
});

function renderGMModal() {
    const modalList = document.getElementById('gm-modal-list');
    if (!modalList) return;
    modalList.innerHTML = '';

    const sourceArr = (game.assignedRoles.length > 0) ? game.assignedRoles : game.players.map(p => ({ player: p, role: '?' }));

    sourceArr.forEach(item => {
        const name = item.player || item;
        const assignment = game.assignedRoles.find(a => a.player === name);
        const role = assignment ? assignment.role : '?';
        const roleData = (role !== '?') ? ROLES[role] : { icon: '❓', name: 'Unknown' };

        const status = game.playerStatus[name] || 'alive';
        const deathCause = game.deathCause ? game.deathCause[name] : null;
        const isDead = status !== 'alive';
        const actions = game.nightActions[name] || { protected: false, silenced: false };

        const div = document.createElement('div');
        div.className = `gm-role-item ${isDead ? 'dead' : ''}`;

        // Build night action badges
        let badgesHtml = '';
        if (actions.protected) badgesHtml += '<span class="action-badge protected">🛡️ Protected</span>';
        if (actions.silenced) badgesHtml += '<span class="action-badge silenced">🤫 Silenced</span>';

        // Death cause badge
        let deathBadge = '';
        if (isDead && deathCause) {
            if (deathCause === 'voted') {
                deathBadge = '<span class="action-badge voted">🗳️ ถูกโหวต</span>';
            } else if (deathCause === 'killed') {
                deathBadge = '<span class="action-badge killed">🐺 ถูกฆ่า</span>';
            }
        }

        div.innerHTML = `
            <div class="gm-player-info">
                <span class="gm-player-name">${name}</span>
                <span class="gm-player-role" style="color: var(--accent); font-weight: bold;">
                    ${roleData.icon} ${roleData.name}
                </span>
                <div class="night-action-badges">
                    ${badgesHtml}
                    ${deathBadge}
                </div>
            </div>
            <div class="gm-status-actions">
                ${isDead ? `
                    <button class="btn-status btn-revive-player" onclick="revivePlayer('${name}')">
                        ✨ ชุบชีวิต
                    </button>
                ` : `
                    <div class="death-buttons">
                        <button class="btn-action btn-vote" onclick="killPlayer('${name}', 'voted')" title="ถูกโหวตออก">
                            🗳️ โหวต
                        </button>
                        ${role !== 'werewolf' ? `
                            <button class="btn-action btn-kill" onclick="killPlayer('${name}', 'killed')" title="ถูกหมาป่าฆ่า">
                                🐺 ฆ่า
                            </button>
                        ` : ''}
                    </div>
                `}
                <div class="gm-action-buttons">
                    <button class="btn-action btn-protect ${actions.protected ? 'active' : ''}" onclick="toggleNightAction('${name}', 'protected')" title="Toggle Protection">
                        🛡️
                    </button>
                    <button class="btn-action btn-silence ${actions.silenced ? 'active' : ''}" onclick="toggleNightAction('${name}', 'silenced')" title="Toggle Silence">
                        🤫
                    </button>
                </div>
            </div>
        `;
        modalList.appendChild(div);
    });

    // Add Win Buttons at the bottom
    const winButtonsDiv = document.createElement('div');
    winButtonsDiv.className = 'win-buttons';
    winButtonsDiv.innerHTML = `
        <button class="btn-win btn-win-villager" onclick="showVictory('villager')">👱 ชาวบ้านชนะ</button>
        <button class="btn-win btn-win-werewolf" onclick="showVictory('werewolf')">🐺 หมาป่าชนะ</button>
    `;
    modalList.appendChild(winButtonsDiv);
}

// Kill player with cause (voted/killed)
window.killPlayer = (playerName, cause) => {
    game.playerStatus[playerName] = 'dead';
    if (!game.deathCause) game.deathCause = {};
    game.deathCause[playerName] = cause;
    renderGMModal();

    // Check if Madman was voted out - Madman wins!
    if (cause === 'voted') {
        const assignment = game.assignedRoles.find(a => a.player === playerName);
        if (assignment && assignment.role === 'madman') {
            setTimeout(() => showVictory('madman'), 500);
            return;
        }
    }

    checkWinCondition();
};

// Revive player
window.revivePlayer = (playerName) => {
    game.playerStatus[playerName] = 'alive';
    if (game.deathCause) {
        delete game.deathCause[playerName];
    }
    renderGMModal();
};

// Toggle night action (protected/silenced)
window.toggleNightAction = (playerName, actionType) => {
    if (!game.nightActions[playerName]) {
        game.nightActions[playerName] = { protected: false, silenced: false };
    }
    game.nightActions[playerName][actionType] = !game.nightActions[playerName][actionType];
    renderGMModal();
};

// ==================== Win Condition Check ====================
function checkWinCondition() {
    const alivePlayers = game.assignedRoles.filter(a => game.playerStatus[a.player] === 'alive');

    const aliveWerewolves = alivePlayers.filter(a => a.role === 'werewolf').length;
    const aliveVillagers = alivePlayers.filter(a =>
        a.role !== 'werewolf' && a.role !== 'madman'
    ).length;

    // Werewolves win if they equal or outnumber villagers
    if (aliveWerewolves >= aliveVillagers && aliveWerewolves > 0) {
        setTimeout(() => showVictory('werewolf'), 500);
        return;
    }

    // Villagers win if all werewolves are dead
    if (aliveWerewolves === 0) {
        setTimeout(() => showVictory('villager'), 500);
        return;
    }
}

// ==================== Victory Screen ====================
window.showVictory = (winningTeam) => {
    stopTimer();
    if (gmModal) gmModal.classList.remove('active');

    const victoryIcon = document.getElementById('victory-icon');
    const victoryTitle = document.getElementById('victory-title');
    const victoryMessage = document.getElementById('victory-message');
    const victoryRound = document.getElementById('victory-round');
    const victorySurvivors = document.getElementById('victory-survivors');
    const victoryRoleList = document.getElementById('victory-role-list');

    // Set victory info
    if (winningTeam === 'villager') {
        victoryIcon.innerText = '🏆';
        victoryTitle.innerText = 'ชาวบ้านชนะ!';
        victoryTitle.className = 'victory-title villagers';
        victoryMessage.innerText = 'หมาป่าถูกกำจัดหมดแล้ว ชาวบ้านปลอดภัย!';
    } else if (winningTeam === 'madman') {
        victoryIcon.innerText = '🤪';
        victoryTitle.innerText = 'คนบ้าชนะ!';
        victoryTitle.className = 'victory-title madman';
        victoryMessage.innerText = 'คนบ้าถูกโหวตออก! เป้าหมายสำเร็จ!';
    } else {
        victoryIcon.innerText = '🐺';
        victoryTitle.innerText = 'หมาป่าชนะ!';
        victoryTitle.className = 'victory-title werewolves';
        victoryMessage.innerText = 'หมาป่ากินชาวบ้านจนหมดหมู่บ้าน!';
    }

    // Stats
    victoryRound.innerText = game.round;
    const survivors = Object.values(game.playerStatus).filter(s => s === 'alive').length;
    victorySurvivors.innerText = survivors;

    // Role list
    victoryRoleList.innerHTML = '';
    game.assignedRoles.forEach(assignment => {
        const status = game.playerStatus[assignment.player] || 'alive';
        const isDead = status !== 'alive';
        const roleData = ROLES[assignment.role];

        const div = document.createElement('div');
        div.className = `victory-role-item ${isDead ? 'dead' : ''}`;
        div.innerHTML = `
            <span class="player-name">${assignment.player} ${isDead ? '💀' : ''}</span>
            <span class="role-badge">${roleData.icon} ${roleData.name}</span>
        `;
        victoryRoleList.appendChild(div);
    });

    switchScreen('victory');
};

// Victory screen buttons
document.getElementById('play-again-btn')?.addEventListener('click', () => {
    resetGame();
    switchScreen('intro');
});

document.getElementById('back-to-menu-btn')?.addEventListener('click', () => {
    resetGame();
    switchScreen('intro');
});

// ==================== Keyboard Support (Enter Key) ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        // Get current active screen
        const activeScreen = document.querySelector('.screen.active');
        if (!activeScreen) return;

        const screenId = activeScreen.id;

        switch (screenId) {
            case 'intro-screen':
                // Start game
                document.getElementById('intro-start-btn')?.click();
                break;

            case 'setup-screen':
                // Go to config
                document.getElementById('to-config-btn')?.click();
                break;

            case 'config-screen':
                // Start game if button is not disabled
                const startBtn = document.getElementById('start-game-btn');
                if (startBtn && !startBtn.disabled) {
                    startBtn.click();
                }
                break;

            case 'reveal-screen':
                // Check which state is active
                if (document.getElementById('pass-state')?.classList.contains('active')) {
                    document.getElementById('start-pick-btn')?.click();
                } else if (document.getElementById('role-state')?.classList.contains('active')) {
                    document.getElementById('next-player-btn')?.click();
                }
                break;

            case 'timer-screen':
                // Toggle next phase
                document.getElementById('next-phase-btn')?.click();
                break;

            case 'summary-screen':
                // Restart game
                document.getElementById('restart-btn')?.click();
                break;

            case 'victory-screen':
                // Play again
                document.getElementById('play-again-btn')?.click();
                break;
        }
    }

    // ESC key to close GM Modal
    if (e.key === 'Escape') {
        if (gmModal?.classList.contains('active')) {
            gmModal.classList.remove('active');
        }
    }
});
