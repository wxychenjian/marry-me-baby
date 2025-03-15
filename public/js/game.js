// 建立WebSocket连接
const socket = io();

// 页面元素
const gameView = document.querySelector('.game-view');
const resultView = document.querySelector('.result-view');
const playerList = document.querySelector('.player-list');
const playerCount = document.querySelectorAll('.player-count');
const rankings = document.querySelector('.rankings');
const startButton = document.querySelector('.start-button');
const createRoomButton = document.querySelector('.create-room-button');
const qrCodeImg = document.querySelector('.qr-code img');
const gameStatus = document.querySelector('.game-status');
const roomIdDisplay = document.querySelector('.room-id-display'); // 添加房间号显示元素

let currentRoomId = null; // 当前房间ID
let gameStarted = false; // 游戏是否已经开始

// 创建新房间
async function createRoom() {
    try {
        const response = await fetch('/api/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        console.log('创建房间响应:', data);
        
        // 验证响应数据
        if (!data.roomId) {
            throw new Error('创建房间失败：无效的房间ID');
        }
        
        // 更新二维码
        qrCodeImg.src = data.qrCode;
        
        // 保存并显示房间号
        currentRoomId = data.roomId;
        updateRoomIdDisplay(currentRoomId);
        
        // 保存房间信息到localStorage
        localStorage.setItem('gameRoom', JSON.stringify({
            roomId: currentRoomId,
            qrCode: data.qrCode
        }));
        
        // 加入房间（确保发送数字类型的房间ID）
        socket.emit('hostJoinRoom', { roomId: parseInt(currentRoomId, 10) });
        
        // 显示游戏视图
        gameView.classList.remove('hidden');
        resultView.classList.add('hidden');
        
        // 重置游戏状态
        updatePlayerCount(0);
        playerList.innerHTML = '';
        rankings.innerHTML = '';
        gameStatus.textContent = '等待玩家加入...';
        
    } catch (error) {
        console.error('创建房间失败:', error);
        alert('创建房间失败，请重试');
    }
}

// 更新房间号显示
function updateRoomIdDisplay(roomId) {
    if (roomIdDisplay) {
        roomIdDisplay.textContent = `房间号：${roomId}`;
    }
}

// 检查是否有保存的房间
function checkSavedRoom() {
    const savedRoom = localStorage.getItem('gameRoom');
    if (savedRoom) {
        try {
            const { roomId, qrCode } = JSON.parse(savedRoom);
            console.log('恢复房间信息:', { roomId, qrCode });
            
            // 验证房间ID
            if (!roomId) {
                console.error('保存的房间ID无效');
                localStorage.removeItem('gameRoom');
                return false;
            }
            
            // 恢复房间状态
            currentRoomId = roomId;
            qrCodeImg.src = qrCode;
            updateRoomIdDisplay(roomId);
            
            // 确保发送数字类型的房间ID
            socket.emit('hostJoinRoom', { roomId: parseInt(roomId, 10) });
            
            // 显示游戏视图
            gameView.classList.remove('hidden');
            resultView.classList.add('hidden');
            gameStatus.textContent = '等待玩家加入...';
            return true;
        } catch (error) {
            console.error('恢复房间状态失败:', error);
            localStorage.removeItem('gameRoom');
        }
    }
    return false;
}

// 更新玩家数量显示
function updatePlayerCount(count) {
    playerCount.forEach(el => {
        el.textContent = count + '人';
    });
}

// 更新参与者列表
function updateParticipantsList(participants) {
    playerList.innerHTML = participants.map(player => `
        <div class="flex items-center p-3 bg-white/50 backdrop-blur-sm rounded-xl mb-2 border border-rose-100">
            <div class="w-10 h-10 bg-gradient-to-r from-rose-400 to-rose-500 rounded-full flex items-center justify-center text-white font-bold">
                ${player.nickname.charAt(0)}
            </div>
            <div class="ml-3 flex-1">
                <div class="font-medium text-gray-900">${player.nickname}</div>
                <div class="text-sm text-gray-500">得分：${player.score}</div>
            </div>
        </div>
    `).join('');
    
    // 更新玩家数量
    updatePlayerCount(participants.length);
}

// 更新排行榜
function updateRankings(rankings) {
    const rankingsList = document.querySelector('.rankings');
    if (!rankingsList) return;

    rankingsList.innerHTML = rankings.map((player, index) => `
        <div class="flex items-center p-3 ${index < 3 ? 'bg-rose-50' : 'bg-white/50'} backdrop-blur-sm rounded-xl mb-2 border border-rose-100">
            <div class="w-10 h-10 ${getRankingStyle(index)} rounded-full flex items-center justify-center text-white font-bold">
                ${index + 1}
            </div>
            <div class="ml-3 flex-1">
                <div class="font-medium text-gray-900">${player.nickname}</div>
                <div class="text-sm text-gray-500">
                    <span class="font-semibold">${player.score || 0}</span>
                    <span class="text-rose-500">次</span>
                    ${index === 0 ? '<span class="ml-2 text-yellow-500">🏆 领先</span>' : ''}
                </div>
            </div>
            ${gameStarted ? `
            <div class="ml-2 px-3 py-1 bg-rose-100 rounded-full">
                <span class="text-sm font-medium text-rose-600">实时</span>
            </div>
            ` : ''}
        </div>
    `).join('');
}

// 获取排名样式
function getRankingStyle(index) {
    switch (index) {
        case 0:
            return 'bg-gradient-to-r from-yellow-400 to-yellow-500';
        case 1:
            return 'bg-gradient-to-r from-gray-400 to-gray-500';
        case 2:
            return 'bg-gradient-to-r from-orange-400 to-orange-500';
        default:
            return 'bg-gradient-to-r from-rose-400 to-rose-500';
    }
}

// 事件监听
document.addEventListener('DOMContentLoaded', () => {
    // 只在没有保存的房间时创建新房间
    if (!checkSavedRoom()) {
        createRoom();
    }
});

createRoomButton.addEventListener('click', () => {
    // 清除旧房间信息
    localStorage.removeItem('gameRoom');
    createRoom();
});

startButton.addEventListener('click', () => {
    if (currentRoomId) {
        socket.emit('startGame', { roomId: currentRoomId });
    }
});

// Socket事件处理
socket.on('updateParticipants', (participants) => {
    console.log('收到参与者列表更新:', participants);
    if (!Array.isArray(participants)) {
        console.error('参与者列表格式错误:', participants);
        return;
    }
    updateParticipantsList(participants);
});

socket.on('updateRankings', (rankings) => {
    console.log('收到排名更新:', rankings);
    if (gameStarted) {
        // 添加动画效果
        const rankingsList = document.querySelector('.rankings');
        if (rankingsList) {
            rankingsList.style.transition = 'opacity 0.3s';
            rankingsList.style.opacity = '0.6';
            setTimeout(() => {
                updateRankings(rankings);
                rankingsList.style.opacity = '1';
            }, 100);
        } else {
            updateRankings(rankings);
        }
    }
});

socket.on('gameStart', () => {
    gameStatus.textContent = '游戏进行中';
    startButton.disabled = true;
    startButton.classList.add('opacity-50', 'cursor-not-allowed');
    gameStarted = true;
});

socket.on('countdown', (seconds) => {
    gameStatus.textContent = `游戏进行中 (${seconds}秒)`;
});

// 更新结果页面的排行榜
function updateResultRankings(rankings) {
    if (!rankings || !rankings.length) return;

    // 更新前三名
    const updateTopPlayer = (position, player) => {
        if (!player) return;
        const container = document.querySelector(`.${position}`);
        if (!container) return;

        container.querySelector('.player-initial').textContent = player.nickname.charAt(0);
        container.querySelector('.player-name').textContent = player.nickname;
        container.querySelector('.player-score').textContent = `${player.score}次`;
    };

    // 更新冠亚季军
    updateTopPlayer('first-place', rankings[0]);
    updateTopPlayer('second-place', rankings[1]);
    updateTopPlayer('third-place', rankings[2]);

    // 更新其他排名
    const otherRankings = document.querySelector('.other-rankings');
    if (otherRankings && rankings.length > 3) {
        otherRankings.innerHTML = rankings.slice(3).map((player, index) => `
            <div class="bg-white rounded-lg shadow-lg p-4 flex items-center border border-rose-100">
                <div class="flex-shrink-0 w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-700 text-lg">
                    ${index + 4}
                </div>
                <div class="ml-4 flex-1">
                    <div class="font-semibold text-lg">${player.nickname}</div>
                    <div class="text-gray-600">${player.score}次摇动</div>
                </div>
            </div>
        `).join('');
    }
}

socket.on('gameEnd', (rankings) => {
    gameStatus.textContent = '游戏结束';
    startButton.disabled = false;
    startButton.classList.remove('opacity-50', 'cursor-not-allowed');
    gameStarted = false;
    
    // 显示最终排名
    gameView.classList.add('hidden');
    resultView.classList.remove('hidden');
    
    // 更新结果页面
    updateResultRankings(rankings);
    
    // 添加动画效果
    const containers = document.querySelectorAll('.first-place, .second-place, .third-place');
    containers.forEach((container, index) => {
        setTimeout(() => {
            container.style.opacity = '0';
            container.style.transform = 'translateY(20px)';
            container.style.transition = 'all 0.5s ease-out';
            
            setTimeout(() => {
                container.style.opacity = '1';
                container.style.transform = 'translateY(0)';
            }, 100);
        }, index * 200);
    });
});

// 结果页面的"再来一局"按钮事件监听
document.querySelector('.result-view .create-room-button').addEventListener('click', () => {
    // 清除旧房间信息
    localStorage.removeItem('gameRoom');
    createRoom();
}); 