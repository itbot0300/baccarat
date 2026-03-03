// 百家乐游戏逻辑 - 完整版
// 支持：用户管理、30秒倒计时、多人模式、修复5张牌bug、音效系统

// 音频上下文
let audioContext = null;
let bgMusic = null;
let clickSound = null;

// 初始化音频
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 创建点击音效（使用Web Audio API合成）
        clickSound = () => {
            if (!audioContext) return;
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        };
        
        // 创建背景音乐（使用Web Audio API合成简单的旋律）
        bgMusic = {
            isPlaying: false,
            oscillators: [],
            gainNode: null,
            
            play: function() {
                if (!audioContext || this.isPlaying) return;
                this.isPlaying = true;
                
                this.gainNode = audioContext.createGain();
                this.gainNode.connect(audioContext.destination);
                this.gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                
                // 简单的循环旋律
                const melody = [261.63, 293.66, 329.63, 349.23, 392.00, 349.23, 329.63, 293.66];
                let noteIndex = 0;
                
                const playNote = () => {
                    if (!this.isPlaying) return;
                    
                    const osc = audioContext.createOscillator();
                    osc.connect(this.gainNode);
                    osc.frequency.value = melody[noteIndex];
                    osc.type = 'sine';
                    
                    const noteGain = audioContext.createGain();
                    noteGain.connect(this.gainNode);
                    noteGain.gain.setValueAtTime(0.3, audioContext.currentTime);
                    noteGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
                    
                    osc.connect(noteGain);
                    osc.start(audioContext.currentTime);
                    osc.stop(audioContext.currentTime + 0.4);
                    
                    noteIndex = (noteIndex + 1) % melody.length;
                    setTimeout(playNote, 500);
                };
                
                playNote();
            },
            
            stop: function() {
                this.isPlaying = false;
                if (this.gainNode) {
                    this.gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
                }
            }
        };
    } catch (e) {
        console.log('Audio not supported:', e);
    }
}

// 播放点击音效
function playClickSound() {
    if (clickSound) clickSound();
}

// 播放背景音乐
function playBackgroundMusic() {
    if (bgMusic) bgMusic.play();
}

// 停止背景音乐
function stopBackgroundMusic() {
    if (bgMusic) bgMusic.stop();
}

// 游戏状态
const gameState = {
    userId: null,
    username: '',
    balance: 1000,
    currentBet: 0,
    selectedBetType: null,
    selectedChip: 10,
    isDealing: false,
    isLoggedIn: false,
    countdown: 30,
    isBettingOpen: true,
    countdownInterval: null,
    stats: {
        banker: 0,
        player: 0,
        tie: 0
    },
    history: []
};

// 百家乐牌组
const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// DOM 元素
const elements = {
    // 认证相关
    loginModal: document.getElementById('login-modal'),
    usernameInput: document.getElementById('username'),
    passwordInput: document.getElementById('password'),
    loginBtn: document.getElementById('login-btn'),
    registerBtn: document.getElementById('register-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    userInfo: document.getElementById('user-info'),
    usernameDisplay: document.getElementById('username-display'),
    
    // 游戏相关
    balance: document.getElementById('balance'),
    currentBet: document.getElementById('current-bet'),
    resultText: document.getElementById('result-text'),
    bankerCards: document.getElementById('banker-cards'),
    playerCards: document.getElementById('player-cards'),
    bankerScore: document.getElementById('banker-score'),
    playerScore: document.getElementById('player-score'),
    dealBtn: document.getElementById('deal-btn'),
    clearBtn: document.getElementById('clear-btn'),
    historyList: document.getElementById('history-list'),
    bankerWins: document.getElementById('banker-wins'),
    playerWins: document.getElementById('player-wins'),
    tieWins: document.getElementById('tie-wins'),
    
    // 倒计时
    countdownDisplay: document.getElementById('countdown'),
    bettingStatus: document.getElementById('betting-status')
};

// API 基础 URL
const API_BASE = 'http://localhost:5000/api';

// 初始化
function init() {
    initAudio();  // 初始化音频系统
    setupEventListeners();
    
    // 初始状态：禁用游戏控制
    enableGameControls(false);
    
    checkLoginStatus();
    startCountdown();
}

// 检查登录状态
function checkLoginStatus() {
    const savedUserId = localStorage.getItem('baccaratUserId');
    const savedUsername = localStorage.getItem('baccaratUsername');
    const savedBalance = localStorage.getItem('baccaratBalance');
    
    if (savedUserId) {
        gameState.userId = parseInt(savedUserId);
        gameState.username = savedUsername;
        gameState.balance = parseInt(savedBalance) || 1000;
        gameState.isLoggedIn = true;
        updateAuthUI();
        loadGameHistory();
    }
}

// 设置事件监听
function setupEventListeners() {
    // 登录/注册
    if (elements.loginBtn) {
        elements.loginBtn.addEventListener('click', () => {
            playClickSound();
            handleLogin();
        });
    }
    if (elements.registerBtn) {
        elements.registerBtn.addEventListener('click', () => {
            playClickSound();
            handleRegister();
        });
    }
    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', () => {
            playClickSound();
            handleLogout();
        });
    }
    
    // 下注按钮
    document.querySelectorAll('.bet-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            playClickSound();
            selectBetType(btn.dataset.bet);
        });
    });
    
    // 筹码按钮
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            playClickSound();
            selectChip(parseInt(btn.dataset.amount));
        });
    });
    
    // 操作按钮
    elements.dealBtn.addEventListener('click', () => {
        playClickSound();
        dealCards();
    });
    elements.clearBtn.addEventListener('click', () => {
        playClickSound();
        clearBet();
    });
}

// 认证相关函数
async function handleLogin() {
    const username = elements.usernameInput.value.trim();
    const password = elements.passwordInput.value.trim();
    
    if (!username || !password) {
        alert('请输入用户名和密码');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            gameState.userId = data.user.id;
            gameState.username = data.user.username;
            gameState.balance = data.user.balance;
            gameState.isLoggedIn = true;
            
            localStorage.setItem('baccaratUserId', data.user.id);
            localStorage.setItem('baccaratUsername', data.user.username);
            localStorage.setItem('baccaratBalance', data.user.balance);
            
            updateAuthUI();
            loadGameHistory();
            closeLoginModal();
        } else {
            alert(data.error || '登录失败');
        }
    } catch (error) {
        console.error('登录错误:', error);
        alert('连接服务器失败，请确保后端运行中');
    }
}

async function handleRegister() {
    const username = elements.usernameInput.value.trim();
    const password = elements.passwordInput.value.trim();
    
    if (!username || !password) {
        alert('请输入用户名和密码');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('注册成功，请登录');
        } else {
            alert(data.error || '注册失败');
        }
    } catch (error) {
        console.error('注册错误:', error);
        alert('连接服务器失败');
    }
}

function handleLogout() {
    gameState.userId = null;
    gameState.username = '';
    gameState.balance = 1000;
    gameState.isLoggedIn = false;
    gameState.history = [];
    gameState.stats = { banker: 0, player: 0, tie: 0 };
    
    localStorage.removeItem('baccaratUserId');
    localStorage.removeItem('baccaratUsername');
    localStorage.removeItem('baccaratBalance');
    
    updateAuthUI();
    renderHistory();
}

function updateAuthUI() {
    if (elements.loginModal && elements.userInfo && elements.logoutBtn) {
        if (gameState.isLoggedIn) {
            elements.loginModal.style.display = 'none';
            elements.userInfo.style.display = 'flex';
            elements.usernameDisplay.textContent = gameState.username;
            elements.balance.textContent = gameState.balance;
            
            // 启用游戏按钮
            enableGameControls(true);
            
            // 登录后播放背景音乐
            playBackgroundMusic();
        } else {
            elements.loginModal.style.display = 'flex';
            elements.userInfo.style.display = 'none';
            
            // 禁用游戏按钮
            enableGameControls(false);
            
            // 停止背景音乐
            stopBackgroundMusic();
        }
    }
}

// 启用/禁用游戏控制
function enableGameControls(enabled) {
    const betButtons = document.querySelectorAll('.bet-btn, .chip-btn');
    betButtons.forEach(btn => {
        btn.disabled = !enabled;
    });
    elements.dealBtn.disabled = !enabled;
    elements.clearBtn.disabled = !enabled;
}

function closeLoginModal() {
    if (elements.loginModal) {
        elements.loginModal.style.display = 'none';
    }
}

function showLoginModal() {
    if (elements.loginModal) {
        elements.loginModal.style.display = 'flex';
    }
}

// 倒计时功能
function startCountdown() {
    // 初始获取游戏状态
    fetchGameStatus();
    
    // 每秒更新倒计时
    gameState.countdownInterval = setInterval(() => {
        fetchGameStatus();
    }, 1000);
}

async function fetchGameStatus() {
    if (!gameState.isLoggedIn) return;
    
    try {
        const response = await fetch(`${API_BASE}/game/status`);
        const data = await response.json();
        
        gameState.countdown = data.countdown;
        gameState.isBettingOpen = data.is_betting_open;
        
        updateCountdownUI();
    } catch (error) {
        console.error('获取游戏状态失败:', error);
    }
}

function updateCountdownUI() {
    if (elements.countdownDisplay) {
        elements.countdownDisplay.textContent = gameState.countdown;
    }
    if (elements.bettingStatus) {
        elements.bettingStatus.textContent = gameState.isBettingOpen ? '可下注' : '等待发牌';
        elements.bettingStatus.className = gameState.isBettingOpen ? 'status open' : 'status closed';
    }
    
    // 禁止下注时禁用相关按钮
    const betButtons = document.querySelectorAll('.bet-btn, .chip-btn');
    betButtons.forEach(btn => {
        btn.disabled = !gameState.isBettingOpen || gameState.isDealing;
    });
    
    if (!gameState.isBettingOpen) {
        elements.dealBtn.disabled = true;
    }
}

// 加载游戏历史
async function loadGameHistory() {
    if (!gameState.userId) return;
    
    try {
        const response = await fetch(`${API_BASE}/game?user_id=${gameState.userId}`);
        const data = await response.json();
        
        if (response.ok) {
            gameState.balance = data.user.balance;
            gameState.stats = data.stats;
            
            // 处理历史记录
            gameState.history = data.history.map(h => h.result).slice(0, 20);
            
            localStorage.setItem('baccaratBalance', gameState.balance);
            
            updateUI();
            renderHistory();
        }
    } catch (error) {
        console.error('加载历史失败:', error);
    }
}

// 选择下注类型
function selectBetType(type) {
    if (gameState.isDealing || !gameState.isBettingOpen) return;
    
    // 切换选中状态
    document.querySelectorAll('.bet-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    const btn = document.querySelector(`.bet-btn.${type}`);
    if (gameState.selectedBetType === type) {
        gameState.selectedBetType = null;
    } else {
        btn.classList.add('selected');
        gameState.selectedBetType = type;
    }
    
    updateDealButton();
}

// 选择筹码
function selectChip(amount) {
    gameState.selectedChip = amount;
    
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.classList.remove('selected');
        if (parseInt(btn.dataset.amount) === amount) {
            btn.classList.add('selected');
        }
    });
}

// 下注（发送到后端）
async function placeBet() {
    if (!gameState.selectedBetType || gameState.isDealing || !gameState.isBettingOpen) return;
    if (!gameState.isLoggedIn) {
        showLoginModal();
        return;
    }
    if (gameState.balance < gameState.selectedChip) {
        showResult('余额不足!');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/bet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: gameState.userId,
                bet_type: gameState.selectedBetType,
                bet_amount: gameState.selectedChip
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            gameState.balance = data.balance;
            gameState.currentBet += gameState.selectedChip;
            
            updateUI();
            updateDealButton();
        } else {
            showResult(data.error || '下注失败');
        }
    } catch (error) {
        console.error('下注错误:', error);
        showResult('连接服务器失败');
    }
}

// 清除下注
function clearBet() {
    if (gameState.isDealing) return;
    
    gameState.balance += gameState.currentBet;
    gameState.currentBet = 0;
    
    gameState.selectedBetType = null;
    document.querySelectorAll('.bet-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    updateUI();
    updateDealButton();
}

// 更新发牌按钮状态
function updateDealButton() {
    elements.dealBtn.disabled = gameState.currentBet <= 0 || gameState.isDealing || !gameState.isBettingOpen;
}

// 创建一副牌
function createDeck() {
    const deck = [];
    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push({ suit, rank });
        }
    }
    return shuffleDeck(deck);
}

// 洗牌
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// 计算牌点
function calculatePoint(card) {
    const rank = card.rank;
    if (rank === 'A') return 1;
    if (['J', 'Q', 'K', '10'].includes(rank)) return 0;
    return parseInt(rank);
}

// 计算总点数
function calculateTotal(cards) {
    let total = cards.reduce((sum, card) => sum + calculatePoint(card), 0);
    return total % 10;
}

// 发牌（发送到后端）
async function dealCards() {
    if (gameState.currentBet <= 0 || gameState.isDealing) return;
    if (!gameState.selectedBetType) {
        showResult('请选择下注区域!');
        return;
    }
    
    // 发牌音效
    const dealSound = () => {
        if (!audioContext) return;
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.frequency.value = 200 + i * 100;
                osc.type = 'triangle';
                gain.gain.setValueAtTime(0.2, audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
                osc.start(audioContext.currentTime);
                osc.stop(audioContext.currentTime + 0.15);
            }, i * 150);
        }
    };
    dealSound();
    
    gameState.isDealing = true;
    updateDealButton();
    
    // 清空之前的牌
    elements.bankerCards.innerHTML = '';
    elements.playerCards.innerHTML = '';
    elements.resultText.textContent = '发牌中...';
    elements.resultText.className = 'result';
    
    // 发送发牌请求到后端
    try {
        const response = await fetch(`${API_BASE}/deal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: gameState.userId,
                game_id: 0  // 后端会根据用户ID查找最新的下注记录
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // 显示手牌
            displayCards(data.player_cards, elements.playerCards);
            displayCards(data.banker_cards, elements.bankerCards);
            
            elements.playerScore.textContent = `点数: ${data.player_score}`;
            elements.bankerScore.textContent = `点数: ${data.banker_score}`;
            
            // 结算结果
            setTimeout(() => {
                settleResult(data);
            }, 1500);
        } else {
            showResult(data.error || '发牌失败');
            gameState.isDealing = false;
            updateDealButton();
        }
    } catch (error) {
        console.error('发牌错误:', error);
        showResult('连接服务器失败');
        gameState.isDealing = false;
        updateDealButton();
    }
}

// 显示牌（从后端返回的字符串数组）
function displayCards(cards, container) {
    container.innerHTML = '';
    
    cards.forEach((cardStr, index) => {
        const cardEl = document.createElement('div');
        const suit = cardStr.includes('♥') || cardStr.includes('♦') ? '♥' : 
                     cardStr.includes('♠') ? '♠' : 
                     cardStr.includes('♣') ? '♣' : '♦';
        const isRed = suit === '♥' || suit === '♦';
        const rank = cardStr.replace(suit, '');
        
        cardEl.className = `card ${isRed ? 'red' : 'black'}`;
        cardEl.style.animationDelay = `${index * 0.15}s`;
        
        cardEl.innerHTML = `
            <span class="suit">${suit}</span>
            <span class="rank">${rank}</span>
            <span class="suit-bottom">${suit}</span>
        `;
        
        container.appendChild(cardEl);
    });
}

// 结算结果
function settleResult(data) {
    const result = data.result;
    let resultText = '';
    let resultClass = '';
    
    // 播放结果音效
    const winSound = () => {
        if (!audioContext) return;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        if (result === 'tie') {
            osc.frequency.value = 400;
            gain.gain.setValueAtTime(0.2, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        } else {
            osc.frequency.value = 600;
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        }
        
        osc.start(audioContext.currentTime);
        osc.stop(audioContext.currentTime + 0.5);
    };
    winSound();
    
    if (result === 'banker') {
        resultText = '庄家胜!';
        resultClass = 'banker-win';
        gameState.stats.banker++;
    } else if (result === 'player') {
        resultText = '闲家胜!';
        resultClass = 'player-win';
        gameState.stats.player++;
    } else {
        resultText = '和局!';
        resultClass = 'tie';
        gameState.stats.tie++;
    }
    
    // 显示结果
    elements.resultText.textContent = resultText;
    elements.resultText.className = `result ${resultClass}`;
    
    // 添加到历史记录
    gameState.history.unshift(result);
    if (gameState.history.length > 20) {
        gameState.history.pop();
    }
    
    // 更新余额
    gameState.balance = data.new_balance;
    localStorage.setItem('baccaratBalance', gameState.balance);
    
    // 更新UI
    setTimeout(() => {
        updateUI();
        renderHistory();
        
        gameState.isDealing = false;
        gameState.currentBet = 0;
        gameState.selectedBetType = null;
        
        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        updateDealButton();
    }, 1500);
}

// 显示结果消息
function showResult(text) {
    elements.resultText.textContent = text;
    setTimeout(() => {
        elements.resultText.textContent = gameState.isBettingOpen ? '等待下注' : '等待发牌';
    }, 1500);
}

// 更新UI
function updateUI() {
    elements.balance.textContent = gameState.balance;
    elements.currentBet.textContent = gameState.currentBet;
    elements.bankerWins.textContent = gameState.stats.banker;
    elements.playerWins.textContent = gameState.stats.player;
    elements.tieWins.textContent = gameState.stats.tie;
}

// 渲染历史记录
function renderHistory() {
    elements.historyList.innerHTML = '';
    
    gameState.history.forEach(result => {
        const item = document.createElement('div');
        item.className = `history-item ${result}`;
        
        if (result === 'banker') {
            item.textContent = '庄';
            item.title = '庄家胜';
        } else if (result === 'player') {
            item.textContent = '闲';
            item.title = '闲家胜';
        } else {
            item.textContent = '和';
            item.title = '和局';
        }
        
        elements.historyList.appendChild(item);
    });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 自动下注
let lastSelectedBetType = null;
setInterval(() => {
    if (gameState.selectedBetType && gameState.selectedBetType !== lastSelectedBetType) {
        lastSelectedBetType = gameState.selectedBetType;
    }
    if (gameState.selectedBetType && !gameState.isDealing && gameState.isBettingOpen) {
        placeBet();
    }
}, 100);
