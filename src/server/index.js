const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 获取本机局域网IP
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // 只获取IPv4地址，且不是内部地址
            if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168')) {
                return iface.address;
            }
        }
    }
    return '192.168.1.6'; // 如果没找到，返回已知的IP地址
}

const localIP = getLocalIP();
console.log('服务器IP地址:', localIP); // 添加日志输出
const PORT = 3000;

// 游戏房间数据
const rooms = new Map();

// 静态文件服务
app.use(express.static('public'));
app.use(express.json());

// 创建新房间
app.post('/api/rooms', async (req, res) => {
    const roomId = Math.floor(Math.random() * 90000) + 10000; // 5位数字
    const room = {
        id: roomId,
        players: new Map(),
        gameStarted: false,
        countdown: 30
    };
    rooms.set(roomId.toString(), room);

    // 生成包含完整URL的二维码
    const qrUrl = `http://${localIP}:${PORT}/mobile.html?room=${roomId}`;
    try {
        const qrCodeDataUrl = await QRCode.toDataURL(qrUrl);
        res.json({
            roomId,
            qrCode: qrCodeDataUrl
        });
    } catch (error) {
        console.error('生成二维码失败:', error);
        res.status(500).json({ error: '生成二维码失败' });
    }
});

// WebSocket连接处理
io.on('connection', (socket) => {
    console.log('新的连接建立');

    // 处理主持人加入房间
    socket.on('hostJoinRoom', ({ roomId }) => {
        console.log(`主持人加入房间 ${roomId}`);
        const room = rooms.get(roomId.toString());
        if (!room) {
            socket.emit('error', '房间不存在');
            return;
        }

        // 加入socket.io房间
        socket.join(roomId.toString());

        // 如果房间已有玩家，立即发送更新
        const playersList = Array.from(room.players.values()).map(player => ({
            nickname: player.nickname,
            score: player.score
        }));
        
        console.log('发送参与者列表到主持人:', playersList);
        socket.emit('updateParticipants', playersList);
    });

    // 处理玩家加入房间
    socket.on('joinRoom', ({ roomId, nickname }) => {
        console.log(`玩家 ${nickname} 尝试加入房间 ${roomId}`);
        const room = rooms.get(roomId.toString());
        if (!room) {
            socket.emit('error', '房间不存在');
            return;
        }

        if (room.gameStarted) {
            socket.emit('error', '游戏已经开始');
            return;
        }

        // 将玩家添加到房间
        room.players.set(socket.id, {
            nickname,
            score: 0
        });

        // 加入socket.io房间
        socket.join(roomId.toString());
        socket.emit('joinedRoom');

        // 通知房间内所有玩家更新玩家列表
        const playersList = Array.from(room.players.values()).map(player => ({
            nickname: player.nickname,
            score: player.score
        }));
        
        console.log('广播参与者列表更新:', playersList);
        io.to(roomId.toString()).emit('updateParticipants', playersList);

        console.log(`房间 ${roomId} 当前玩家数：${playersList.length}`);
    });

    // 处理开始游戏
    socket.on('startGame', ({ roomId }) => {
        const room = rooms.get(roomId.toString());
        if (!room || room.gameStarted) return;

        room.gameStarted = true;
        room.countdown = 30;

        // 通知所有玩家游戏开始
        io.to(roomId.toString()).emit('gameStart');

        // 开始倒计时
        const timer = setInterval(() => {
            room.countdown--;
            io.to(roomId.toString()).emit('countdown', room.countdown);

            if (room.countdown <= 0) {
                clearInterval(timer);
                room.gameStarted = false;

                // 计算排名
                const rankings = Array.from(room.players.entries())
                    .map(([id, player]) => ({
                        nickname: player.nickname,
                        score: player.score
                    }))
                    .sort((a, b) => b.score - a.score);

                // 发送游戏结束事件和最终排名
                io.to(roomId.toString()).emit('gameEnd', rankings);
            }
        }, 1000);
    });

    // 处理摇动更新
    socket.on('shake', ({ roomId, count }) => {
        const room = rooms.get(roomId.toString());
        if (!room || !room.gameStarted) return;

        const player = room.players.get(socket.id);
        if (player) {
            player.score = count;
            
            // 计算实时排名
            const rankings = Array.from(room.players.entries())
                .map(([id, player]) => ({
                    nickname: player.nickname,
                    score: player.score
                }))
                .sort((a, b) => b.score - a.score);

            // 计算每个玩家的排名信息
            const playerRankings = rankings.map((player, index) => ({
                ...player,
                rank: index + 1
            }));

            // 找到当前玩家的排名信息
            const currentPlayerRanking = playerRankings.find(p => p.nickname === player.nickname);
            const firstPlace = playerRankings[0];
            
            // 发送个人排名更新到当前玩家
            socket.emit('updateRanking', {
                rank: currentPlayerRanking.rank,
                total: playerRankings.length,
                count: currentPlayerRanking.score,
                diffToFirst: firstPlace.score - currentPlayerRanking.score,
                topPlayers: playerRankings.slice(0, 3)
            });
            
            // 发送实时排行榜到主持人
            io.to(roomId.toString()).emit('updateRankings', rankings);
        }
    });

    // 处理断开连接
    socket.on('disconnect', () => {
        // 从所有房间中移除该玩家
        for (const [roomId, room] of rooms.entries()) {
            if (room.players.has(socket.id)) {
                room.players.delete(socket.id);
                // 统一使用updateParticipants事件
                const playersList = Array.from(room.players.values()).map(player => ({
                    nickname: player.nickname,
                    score: player.score
                }));
                console.log('断开连接后广播参与者列表更新:', playersList);
                io.to(roomId.toString()).emit('updateParticipants', playersList);
            }
        }
    });
});

// 启动服务器
server.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器运行在: http://${localIP}:${PORT}`);
}); 