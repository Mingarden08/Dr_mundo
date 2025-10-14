const WebSocket = require('ws');
const { verifyToken } = require('./jwt');
const { Room, RoomParticipant, Member } = require('../models');

// 게임 상태 관리
const gameStates = new Map(); // roomId -> gameState
const playerSockets = new Map(); // userId -> WebSocket

class GameState {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = new Map(); // userId -> playerState
        this.status = 'waiting'; // waiting, playing, finished
    }

    addPlayer(userId, socket) {
        this.players.set(userId, {
            socket,
            x: Math.random() * 800,
            y: Math.random() * 600,
            hp: 1000,
            cooldowns: {
                attack: 0,
                flash: 0,
                ghost: 0,
                rune: 0
            }
        });
    }

    removePlayer(userId) {
        this.players.delete(userId);
    }

    getPlayer(userId) {
        return this.players.get(userId);
    }

    broadcastToRoom(data, excludeUserId = null) {
        this.players.forEach((player, userId) => {
            if (userId !== excludeUserId && player.socket.readyState === WebSocket.OPEN) {
                player.socket.send(JSON.stringify(data));
            }
        });
    }

    broadcastToAll(data) {
        this.players.forEach((player) => {
            if (player.socket.readyState === WebSocket.OPEN) {
                player.socket.send(JSON.stringify(data));
            }
        });
    }
}

function initWebSocket(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        console.log('🔌 새로운 WebSocket 연결');

        let userId = null;
        let currentRoomId = null;

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                const { event } = data;

                // 인증 확인
                if (!userId && event !== 'auth') {
                    ws.send(JSON.stringify({ 
                        event: 'error', 
                        message: '인증이 필요합니다.' 
                    }));
                    return;
                }

                switch (event) {
                    case 'auth':
                        handleAuth(data);
                        break;
                    case 'join':
                        await handleJoin(data);
                        break;
                    case 'leave':
                        await handleLeave(data);
                        break;
                    case 'start':
                        await handleStart(data);
                        break;
                    case 'move':
                        await handleMove(data);
                        break;
                    case 'attack':
                        await handleAttack(data);
                        break;
                    case 'flash':
                        await handleFlash(data);
                        break;
                    case 'ghost':
                        await handleGhost(data);
                        break;
                    default:
                        ws.send(JSON.stringify({ 
                            event: 'error', 
                            message: '알 수 없는 이벤트입니다.' 
                        }));
                }
            } catch (err) {
                console.error('❌ WebSocket 메시지 처리 에러:', err);
                ws.send(JSON.stringify({ 
                    event: 'error', 
                    message: '서버 에러가 발생했습니다.' 
                }));
            }
        });

        ws.on('close', () => {
            console.log('❌ WebSocket 연결 종료');
            if (userId && currentRoomId) {
                handleDisconnect(userId, currentRoomId);
            }
            if (userId) {
                playerSockets.delete(userId);
            }
        });

        // 인증
        function handleAuth(data) {
            const { token } = data;
            if (!token) {
                ws.send(JSON.stringify({ 
                    event: 'auth', 
                    success: false, 
                    message: '토큰이 필요합니다.' 
                }));
                return;
            }

            const decoded = verifyToken(token);
            if (!decoded) {
                ws.send(JSON.stringify({ 
                    event: 'auth', 
                    success: false, 
                    message: '유효하지 않은 토큰입니다.' 
                }));
                return;
            }

            userId = decoded.id;
            playerSockets.set(userId, ws);

            ws.send(JSON.stringify({ 
                event: 'auth', 
                success: true 
            }));
        }

        // 방 참가
        async function handleJoin(data) {
            const { roomId } = data;

            const room = await Room.findByPk(roomId);
            if (!room) {
                ws.send(JSON.stringify({ 
                    event: 'join', 
                    success: false, 
                    message: '방을 찾을 수 없습니다.' 
                }));
                return;
            }

            if (!gameStates.has(roomId)) {
                gameStates.set(roomId, new GameState(roomId));
            }

            const gameState = gameStates.get(roomId);
            gameState.addPlayer(userId, ws);
            currentRoomId = roomId;

            gameState.broadcastToAll({
                event: 'playerJoined',
                userId: userId,
                playerCount: gameState.players.size
            });

            ws.send(JSON.stringify({ 
                event: 'join', 
                success: true 
            }));
        }

        // 방 나가기
        async function handleLeave(data) {
            const { roomId } = data;

            const gameState = gameStates.get(roomId);
            if (!gameState) {
                ws.send(JSON.stringify({ 
                    event: 'leave', 
                    success: false, 
                    message: '방을 찾을 수 없습니다.' 
                }));
                return;
            }

            gameState.removePlayer(userId);
            currentRoomId = null;

            if (gameState.players.size === 0) {
                gameStates.delete(roomId);
            } else {
                gameState.broadcastToAll({
                    event: 'playerLeft',
                    userId: userId,
                    playerCount: gameState.players.size
                });
            }

            ws.send(JSON.stringify({ 
                event: 'leave', 
                success: true 
            }));
        }

        // 게임 시작
        async function handleStart(data) {
            const { roomId } = data;

            const room = await Room.findByPk(roomId);
            if (!room) {
                ws.send(JSON.stringify({ 
                    event: 'start', 
                    success: false, 
                    message: '방을 찾을 수 없습니다.' 
                }));
                return;
            }

            if (room.hostId !== userId) {
                ws.send(JSON.stringify({ 
                    event: 'start', 
                    success: false, 
                    message: '방장만 게임을 시작할 수 있습니다.' 
                }));
                return;
            }

            const gameState = gameStates.get(roomId);
            if (!gameState || gameState.players.size < 2) {
                ws.send(JSON.stringify({ 
                    event: 'start', 
                    success: false, 
                    message: '플레이어가 2명 필요합니다.' 
                }));
                return;
            }

            await room.update({ status: 'playing' });
            gameState.status = 'playing';

            gameState.broadcastToAll({
                event: 'gameStarted',
                players: Array.from(gameState.players.entries()).map(([id, state]) => ({
                    userId: id,
                    x: state.x,
                    y: state.y,
                    hp: state.hp
                }))
            });

            ws.send(JSON.stringify({ 
                event: 'start', 
                success: true 
            }));
        }

        // 캐릭터 이동
        async function handleMove(data) {
            const { x, y } = data;

            const gameState = gameStates.get(currentRoomId);
            if (!gameState) return;

            const player = gameState.getPlayer(userId);
            if (!player) return;

            player.x = x;
            player.y = y;

            gameState.broadcastToRoom({
                event: 'playerMoved',
                userId: userId,
                x: x,
                y: y
            }, userId);

            ws.send(JSON.stringify({ 
                event: 'move', 
                success: true 
            }));
        }

        // 공격 스킬
        async function handleAttack(data) {
            const { x, y, damage } = data;

            const gameState = gameStates.get(currentRoomId);
            if (!gameState) return;

            const attacker = gameState.getPlayer(userId);
            if (!attacker) return;

            if (attacker.cooldowns.attack > Date.now()) {
                ws.send(JSON.stringify({ 
                    event: 'attack', 
                    success: false, 
                    message: '쿨타임 중입니다.' 
                }));
                return;
            }

            attacker.cooldowns.attack = Date.now() + 5000;

            gameState.broadcastToAll({
                event: 'playerAttacked',
                userId: userId,
                x: x,
                y: y,
                damage: damage
            });

            sendCooldowns(ws, attacker.cooldowns);

            ws.send(JSON.stringify({ 
                event: 'attack', 
                x: x, 
                y: y 
            }));
        }

        // 플래시 스킬
        async function handleFlash(data) {
            const { x, y } = data;

            const gameState = gameStates.get(currentRoomId);
            if (!gameState) return;

            const player = gameState.getPlayer(userId);
            if (!player) return;

            if (player.cooldowns.flash > Date.now()) {
                ws.send(JSON.stringify({ 
                    event: 'flash', 
                    success: false, 
                    message: '쿨타임 중입니다.' 
                }));
                return;
            }

            player.cooldowns.flash = Date.now() + 300000;
            player.x = x;
            player.y = y;

            gameState.broadcastToRoom({
                event: 'playerFlashed',
                userId: userId,
                x: x,
                y: y
            }, userId);

            sendCooldowns(ws, player.cooldowns);

            ws.send(JSON.stringify({ 
                event: 'flash', 
                x: x, 
                y: y 
            }));
        }

        // 유체화 스킬
        async function handleGhost(data) {
            const { speed } = data;

            const gameState = gameStates.get(currentRoomId);
            if (!gameState) return;

            const player = gameState.getPlayer(userId);
            if (!player) return;

            if (player.cooldowns.ghost > Date.now()) {
                ws.send(JSON.stringify({ 
                    event: 'ghost', 
                    success: false, 
                    message: '쿨타임 중입니다.' 
                }));
                return;
            }

            player.cooldowns.ghost = Date.now() + 210000;

            gameState.broadcastToRoom({
                event: 'playerGhosted',
                userId: userId,
                speed: 400,
                time: 4
            }, userId);

            sendCooldowns(ws, player.cooldowns);

            ws.send(JSON.stringify({ 
                event: 'ghost', 
                time: 4, 
                speed: 400 
            }));
        }

        // 연결 끊김 처리
        function handleDisconnect(userId, roomId) {
            const gameState = gameStates.get(roomId);
            if (!gameState) return;

            gameState.removePlayer(userId);

            if (gameState.players.size === 0) {
                gameStates.delete(roomId);
            } else {
                gameState.broadcastToAll({
                    event: 'playerDisconnected',
                    userId: userId
                });
            }
        }

        // 쿨타임 정보 전송
        function sendCooldowns(ws, cooldowns) {
            const now = Date.now();
            ws.send(JSON.stringify({
                event: 'coolTime',
                rune: Math.max(0, Math.ceil((cooldowns.rune - now) / 1000)),
                attack: Math.max(0, Math.ceil((cooldowns.attack - now) / 1000)),
                ghost: Math.max(0, Math.ceil((cooldowns.ghost - now) / 1000)),
                flash: Math.max(0, Math.ceil((cooldowns.flash - now) / 1000))
            }));
        }
    });

    // 피격 판정 처리
    function checkHit(roomId, targetUserId, damage, attackerX, attackerY) {
        const gameState = gameStates.get(roomId);
        if (!gameState) return;

        const target = gameState.getPlayer(targetUserId);
        if (!target) return;

        const distance = Math.sqrt(
            Math.pow(target.x - attackerX, 2) + 
            Math.pow(target.y - attackerY, 2)
        );

        if (distance < 50) {
            target.hp -= damage;

            gameState.broadcastToAll({
                event: 'hit',
                userId: targetUserId,
                x: target.x,
                y: target.y,
                hp: target.hp
            });

            if (target.hp <= 0) {
                gameState.status = 'finished';
                
                const winner = Array.from(gameState.players.keys()).find(id => id !== targetUserId);
                
                gameState.broadcastToAll({
                    event: 'finish',
                    winnerId: winner,
                    loserId: targetUserId,
                    roomId: roomId
                });

                setTimeout(() => {
                    gameStates.delete(roomId);
                }, 5000);
            }
        }
    }

    return { wss, checkHit, gameStates };
}

module.exports = initWebSocket;