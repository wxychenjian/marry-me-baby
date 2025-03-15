// 建立与服务器的WebSocket连接
const socket = io();
console.log('WebSocket连接已初始化');

// 页面元素
const joinView = document.querySelector('.join-view');
const gameView = document.querySelector('.game-view');
const playingView = document.querySelector('.playing-view');
const resultView = document.querySelector('.result-view');
const nicknameInput = document.getElementById('nickname');
const joinButton = document.querySelector('.join-button');
const playerCountElements = document.querySelectorAll('.player-count');
const shakeCountElements = document.querySelectorAll('.shake-count');
const countdownElements = document.querySelectorAll('.countdown');
const rankNumberElement = document.querySelector('.rank-number');
const rankTextElement = document.querySelector('.rank-text');
const rankDiffElement = document.querySelector('.rank-diff');
const topPlayersContainer = document.querySelector('.top-players');

// 结果页面元素
const finalShakeCountElement = document.querySelector('.final-shake-count');
const finalRankElement = document.querySelector('.final-rank');
const topThreeContainer = document.querySelector('.top-three-container');
const rankingListContainer = document.querySelector('.ranking-list');
const resultMessageElement = document.querySelector('.result-message');

// 验证元素是否正确获取
console.log('按钮元素:', joinButton);

// 游戏状态
let gameStarted = false;
let shakeCount = 0;
let lastTime = 0;
let lastX = 0;
let lastY = 0;
let lastZ = 0;
const SHAKE_THRESHOLD = 15;
const MIN_TIME = 100;

let countdownTimer = null;
let syncTimer = null; // 添加同步定时器

// 从URL中获取房间ID
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
console.log('房间ID:', roomId);

// 如果URL中没有房间ID，跳转到错误页面或显示提示
if (!roomId) {
    alert('请扫描二维码进入游戏！');
    window.location.href = '/';
}

// Socket事件监听
socket.on('connect', () => {
    console.log('WebSocket连接成功');
    joinButton.disabled = false; // 连接成功后启用按钮
});

socket.on('connect_error', (error) => {
    console.error('WebSocket连接错误:', error);
    alert('连接服务器失败，请刷新页面重试');
    joinButton.disabled = true; // 连接失败时禁用按钮
});

socket.on('disconnect', () => {
    console.log('与服务器断开连接');
    alert('与服务器断开连接，请刷新页面重试');
    joinButton.disabled = true; // 断开连接时禁用按钮
});

socket.on('error', (message) => {
    console.error('服务器错误:', message);
    alert(message);
});

// 处理加入游戏按钮点击
joinButton.addEventListener('click', async () => {
    console.log('点击加入游戏按钮');
    
    // 检查WebSocket连接状态
    if (!socket.connected) {
        console.error('WebSocket未连接');
        alert('未连接到服务器，请刷新页面重试');
        return;
    }
    
    const nickname = nicknameInput.value.trim();
    console.log('输入的昵称:', nickname);
    
    if (!nickname) {
        alert('请输入昵称！');
        return;
    }
    
    // 禁用按钮防止重复点击
    joinButton.disabled = true;
    
    // 创建Promise来处理加入房间的结果
    const joinRoomPromise = new Promise((resolve, reject) => {
        // 设置超时
        const timeoutId = setTimeout(() => {
            reject(new Error('加入房间超时'));
        }, 5000);

        // 监听加入房间成功事件
        socket.once('joinedRoom', () => {
            clearTimeout(timeoutId);
            resolve();
        });

        // 监听错误事件
        socket.once('error', (message) => {
            clearTimeout(timeoutId);
            reject(new Error(message));
        });
    });
    
    try {
        // 检查设备运动权限
        if (typeof DeviceMotionEvent !== 'undefined' && 
            typeof DeviceMotionEvent.requestPermission === 'function') {
            console.log('iOS设备，请求运动权限');
            const permission = await DeviceMotionEvent.requestPermission();
            console.log('运动权限状态:', permission);
            
            if (permission !== 'granted') {
                throw new Error('需要允许访问设备运动传感器才能参与游戏！');
            }
        } else {
            console.log('非iOS设备，无需请求权限');
        }

        // 添加设备运动监听
        window.addEventListener('devicemotion', handleShake);
        
        // 发送加入房间请求
        console.log('发送加入房间请求');
        socket.emit('joinRoom', { roomId, nickname });
        
        // 等待加入房间结果
        await joinRoomPromise;
        
        // 加入成功，更新UI
        console.log('成功加入房间');
        joinView.classList.add('hidden');
        gameView.classList.remove('hidden');
        
    } catch (error) {
        console.error('加入游戏失败:', error.message);
        alert(error.message);
        // 移除设备运动监听（如果已添加）
        window.removeEventListener('devicemotion', handleShake);
    } finally {
        joinButton.disabled = false;
    }
});

// 监听玩家列表更新
socket.on('updateParticipants', (participants) => {
    console.log('玩家列表更新:', participants);
    const playerCount = participants.length;
    playerCountElements.forEach(el => {
        el.textContent = playerCount;
    });
});

// 定时同步摇动次数到服务器
function startSyncTimer() {
    if (syncTimer) {
        clearInterval(syncTimer);
    }
    syncTimer = setInterval(() => {
        if (gameStarted && roomId) {
            socket.emit('shake', { roomId, count: shakeCount });
        }
    }, 2000); // 每2秒同步一次
}

function stopSyncTimer() {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
}

// 监听游戏开始事件
socket.on('gameStart', (data = {}) => {
    console.log('游戏开始', data);
    gameStarted = true;
    shakeCount = 0;
    
    // 开始同步定时器
    startSyncTimer();
    
    // 切换到游戏界面
    gameView.classList.add('hidden');
    resultView.classList.add('hidden');
    playingView.classList.remove('hidden');
    
    // 清除之前的倒计时
    if (countdownTimer) {
        clearInterval(countdownTimer);
    }
    
    // 默认30秒游戏时间
    const defaultDuration = 30;
    let timeLeft = (data && typeof data.duration === 'number') ? data.duration : defaultDuration;
    console.log('游戏时长:', timeLeft, '秒');
    
    // 立即更新显示
    countdownElements.forEach(el => {
        el.textContent = timeLeft;
    });
    
    // 设置新的倒计时
    countdownTimer = setInterval(() => {
        timeLeft--;
        console.log('倒计时:', timeLeft);
        
        // 更新所有倒计时显示
        countdownElements.forEach(el => {
            el.textContent = timeLeft;
        });
        
        if (timeLeft <= 0) {
            clearInterval(countdownTimer);
            countdownTimer = null;
            gameStarted = false;
            showResultView();
        }
    }, 1000);
});

// 监听排名更新
socket.on('updateRanking', (data) => {
    console.log('排名更新:', data);
    const { rank, total, count, topPlayers, diffToFirst } = data;
    
    // 更新自己的摇动次数
    shakeCountElements.forEach(el => {
        el.textContent = count;
    });
    
    // 更新排名信息
    rankNumberElement.textContent = rank;
    rankTextElement.textContent = `当前排名：第${rank}名`;
    if (rank === 1) {
        rankDiffElement.textContent = '您当前排名第一！';
    } else {
        rankDiffElement.textContent = `距离第1名还差${diffToFirst}次`;
    }
    
    // 保存最新的排名数据用于结果页面
    window.latestRankData = data;
    
    // 更新前两名玩家信息
    updateTopPlayers(topPlayers);
});

// 更新前两名玩家显示
function updateTopPlayers(topPlayers) {
    if (!topPlayers || topPlayers.length === 0) return;
    
    topPlayersContainer.innerHTML = topPlayers.slice(0, 2).map((player, index) => `
        <div class="bg-white rounded-xl shadow-md p-3 backdrop-blur-sm bg-opacity-80 border border-pink-100">
            <div class="flex flex-col items-center">
                <div class="w-8 h-8 ${index === 0 ? 'bg-yellow-100' : 'bg-gray-100'} rounded-full flex items-center justify-center mb-1">
                    <span class="text-xs font-bold ${index === 0 ? 'text-yellow-600' : 'text-gray-600'}">${index + 1}</span>
                </div>
                <div class="text-sm font-medium">${player.nickname}</div>
                <div class="text-xs ${index === 0 ? 'text-yellow-600' : 'text-gray-600'} font-semibold">${player.count}次</div>
            </div>
        </div>
    `).join('');
}

// 监听游戏结束事件
socket.on('gameEnd', (rankings) => {
    gameStarted = false;
    stopSyncTimer(); // 停止同步定时器
    showResultView();
});

// 显示结果页面
function showResultView() {
    playingView.classList.add('hidden');
    resultView.classList.remove('hidden');
    
    if (window.latestRankData) {
        const { rank, count, topPlayers } = window.latestRankData;
        
        // 更新最终成绩
        finalShakeCountElement.textContent = count;
        finalRankElement.textContent = rank;
        
        // 生成前三名展示
        if (topPlayers && topPlayers.length > 0) {
            generateTopThree(topPlayers.slice(0, 3));
            generateRankingList(topPlayers);
            updateResultMessage(rank);
        }
    }
}

// 生成前三名展示
function generateTopThree(top3Players) {
    if (!top3Players || top3Players.length === 0) return;
    
    const positions = [
        { order: 1, class: 'order-2', height: 'h-20', bgColor: 'bg-yellow-400', textColor: 'text-white', size: 'w-16 h-16' },
        { order: 0, class: 'order-1', height: 'h-16', bgColor: 'bg-gray-400', textColor: 'text-white', size: 'w-14 h-14' },
        { order: 2, class: 'order-3', height: 'h-14', bgColor: 'bg-orange-400', textColor: 'text-white', size: 'w-14 h-14' }
    ];
    
    topThreeContainer.innerHTML = top3Players.map((player, index) => `
        <div class="flex flex-col items-center ${positions[index].class} mx-2">
            <div class="${positions[index].size} rounded-full mb-2 overflow-hidden border-2 border-${index === 0 ? 'yellow' : index === 1 ? 'gray' : 'orange'}-300">
                <div class="w-full h-full ${positions[index].bgColor} flex items-center justify-center ${positions[index].textColor} text-lg font-bold">
                    ${player.nickname.charAt(0)}
                </div>
            </div>
            <div class="text-center">
                <div class="font-bold text-sm">${player.nickname}</div>
                <div class="text-xs ${index === 0 ? 'text-yellow-600' : index === 1 ? 'text-gray-600' : 'text-orange-600'}">${player.count}次</div>
            </div>
            <div class="mt-1 ${positions[index].bgColor} w-12 ${positions[index].height} flex items-center justify-center rounded-t-md ${positions[index].textColor} font-bold text-xl">
                ${index + 1}
            </div>
        </div>
    `).join('');
}

// 生成排行榜
function generateRankingList(players) {
    if (!players || players.length === 0) return;
    
    rankingListContainer.innerHTML = players.map((player, index) => `
        <div class="${index < 3 ? `bg-${index === 0 ? 'yellow' : index === 1 ? 'gray' : 'orange'}-50` : ''} p-2 rounded-lg flex items-center">
            <div class="w-6 h-6 ${index < 3 ? `bg-${index === 0 ? 'yellow' : index === 1 ? 'gray' : 'orange'}-400` : 'bg-gray-200'} rounded-full flex items-center justify-center text-white font-bold text-xs">
                ${index + 1}
            </div>
            <div class="ml-2 flex-1">
                <div class="text-sm font-medium">${player.nickname}${player.isCurrentPlayer ? '（您）' : ''}</div>
            </div>
            <div class="${index < 3 ? `text-${index === 0 ? 'yellow' : index === 1 ? 'gray' : 'orange'}-700` : 'text-gray-700'} font-semibold text-sm">${player.count}次</div>
        </div>
    `).join('');
}

// 更新结果信息
function updateResultMessage(rank) {
    let message = '';
    
    if (rank === 1) {
        message = `
            <h3 class="text-sm font-semibold text-gray-700 mb-1">恭喜您获得第一名！</h3>
            <p class="text-xs text-gray-500">请到新人处领取大红包</p>
        `;
    } else if (rank === 2) {
        message = `
            <h3 class="text-sm font-semibold text-gray-700 mb-1">恭喜您获得第二名！</h3>
            <p class="text-xs text-gray-500">请到新人处领取红包</p>
        `;
    } else if (rank === 3) {
        message = `
            <h3 class="text-sm font-semibold text-gray-700 mb-1">恭喜您获得第三名！</h3>
            <p class="text-xs text-gray-500">请到新人处领取红包</p>
        `;
    } else {
        message = `
            <h3 class="text-sm font-semibold text-gray-700 mb-1">游戏结束</h3>
            <p class="text-xs text-gray-500">感谢您的参与</p>
        `;
    }
    
    resultMessageElement.innerHTML = message;
}

// 处理设备摇动
function handleShake(event) {
    if (!gameStarted) return;

    const current = event.accelerationIncludingGravity;
    if (!current) return;

    const currentTime = new Date().getTime();
    const timeDiff = currentTime - lastTime;

    if (timeDiff < MIN_TIME) return;

    const deltaX = Math.abs(current.x - lastX);
    const deltaY = Math.abs(current.y - lastY);
    const deltaZ = Math.abs(current.z - lastZ);

    if (deltaX + deltaY + deltaZ > SHAKE_THRESHOLD) {
        shakeCount++;
        socket.emit('shake', { roomId, count: shakeCount });
        console.log('摇动次数:', shakeCount);
        lastTime = currentTime;
    }

    lastX = current.x;
    lastY = current.y;
    lastZ = current.z;
}

// 阻止页面滚动
document.body.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

// 优化移动端输入体验
nicknameInput.addEventListener('focus', () => {
    setTimeout(() => {
        nicknameInput.scrollIntoView({ behavior: 'smooth' });
    }, 300);
});

nicknameInput.addEventListener('blur', () => {
    window.scrollTo(0, 0);
}); 