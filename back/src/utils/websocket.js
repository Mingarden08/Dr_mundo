const WebSocket = require('ws');
const { verifyToken } = require('./jwt');
const { Room, RoomParticipant, Member } = require('../models');

// 상수 및 상태 관리 클래스

// 맵 및 플레이어 크기 정의
const GAME_CONSTANTS = {
    MAP_WIDTH: 800,
    MAP_HEIGHT: 600,
    PLAYER_RADIUS: 25, 
    PLAYER_MAX_HP: 1000,
};

// 게임 상태 관리
const gameStates = new Map(); // roomId -> GameState 인스턴스
const playerSockets = new Map(); // userId -> WebSocket 소켓

class GameState {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = new Map(); // userId -> playerState
        this.status = 'waiting'; // waiting, playing, finished
    }

    addPlayer(userId, socket) {
        // 현재 방에 몇 명의 플레이어가 있는지 확인하여 위치 분리
        const isSecondPlayer = this.players.size > 0;
        
        const radius = GAME_CONSTANTS.PLAYER_RADIUS;
        const initialX = isSecondPlayer ? 
            GAME_CONSTANTS.MAP_WIDTH - radius : 
            radius;                             
            
        const initialY = GAME_CONSTANTS.MAP_HEIGHT / 2; 

        const playerState = {
            socket,
            x: initialX, 
            y: initialY,
            hp: GAME_CONSTANTS.PLAYER_MAX_HP, 
            cooldowns: {
                attack: 0,
                flash: 0,
                ghost: 0,
                rune: 0
            }
        };

        this.players.set(userId, playerState);
        return playerState; 
    }

    removePlayer(userId) {
        this.players.delete(userId);
    }

    getPlayer(userId) {
        return this.players.get(userId);
    }

    broadcastToRoom(data, excludeUserId = null) {
        const dataStr = JSON.stringify(data);
        this.players.forEach((player, userId) => {
            if (userId !== excludeUserId && player.socket.readyState === WebSocket.OPEN) {
                player.socket.send(dataStr);
            }
        });
    }

    broadcastToAll(data) {
        const dataStr = JSON.stringify(data);
        this.players.forEach((player) => {
            if (player.socket.readyState === WebSocket.OPEN) {
                player.socket.send(dataStr);
            }
        });
    }
}

// 웹소켓 서버 초기화

function initWebSocket(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        let userId = null;
        let currentRoomId = null; 

        ws.userId = null; 
        ws.roomId = null;

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
                ws.send(JSON.stringify({ 
                    event: 'error', 
                    message: '서버 에러가 발생했습니다.' 
                }));
            }
        });

        ws.on('close', () => {
            // 연결 끊김 처리 (비정상 종료 시)
            if (ws.userId && ws.roomId) {
                handleDisconnect(ws.userId, ws.roomId);
            }
            if (ws.userId) {
                playerSockets.delete(ws.userId);
            }
        });

        // 핸들러 함수

        // 인증 처리
        function handleAuth(data) {
            const { token } = data;
            const decoded = verifyToken(token);
            
            if (!decoded) {
                ws.send(JSON.stringify({ event: 'auth', success: false, message: '유효하지 않은 토큰입니다.' }));
                return;
            }

            userId = decoded.id;
            ws.userId = userId; 
            playerSockets.set(userId, ws);

            ws.send(JSON.stringify({ 
                event: 'auth', 
                success: true, 
                playerId: userId 
            })); 
        }

        // 방 참가
        async function handleJoin(data) {
            const { roomId } = data;
            if (!userId) return ws.send(JSON.stringify({ event: 'join', success: false, message: '인증되지 않은 사용자입니다.' }));

            const room = await Room.findByPk(roomId);
            if (!room) {
                return ws.send(JSON.stringify({ event: 'join', success: false, message: '방을 찾을 수 없습니다.' }));
            }

            if (!gameStates.has(roomId)) {
                gameStates.set(roomId, new GameState(roomId));
            }

            const gameState = gameStates.get(roomId);
            
            // 2명 게임 제한
            if (gameState.players.size >= 2) {
                return ws.send(JSON.stringify({ event: 'join', success: false, message: '방이 가득 찼습니다.' }));
            }
            // 이미 다른 방에 참여 중이라면
            if (ws.roomId && ws.roomId !== roomId) {
                 return ws.send(JSON.stringify({ event: 'join', success: false, message: '이미 다른 방에 참여 중입니다.' }));
            }
            if (gameState.getPlayer(userId)) {
                 return ws.send(JSON.stringify({ event: 'join', success: false, message: '이미 방에 참여했습니다.' }));
            }

            // 플레이어 추가 및 초기 위치 설정 적용
            const newPlayerState = gameState.addPlayer(userId, ws);
            currentRoomId = roomId;
            ws.roomId = roomId; 

            // 자신에게 현재 방 상태 및 자신의 초기 위치 전송
            const allPlayersData = Array.from(gameState.players.entries()).map(([id, state]) => ({
                userId: id,
                x: state.x,
                y: state.y,
                hp: state.hp,
            }));
            
            ws.send(JSON.stringify({ 
                event: 'joined', 
                success: true,
                currentPlayers: allPlayersData, 
            }));
            
            // 다른 플레이어들에게 새 플레이어 참가 알림
            gameState.broadcastToRoom({
                event: 'playerJoined',
                userId: userId,
                x: newPlayerState.x, 
                y: newPlayerState.y,
                hp: newPlayerState.hp,
                playerCount: gameState.players.size
            }, userId);
        }

        // 방 나가기
        async function handleLeave(data) {
            const { roomId } = data;
            
            const gameState = gameStates.get(roomId);
            if (!gameState || !gameState.getPlayer(userId)) {
                return ws.send(JSON.stringify({ event: 'leave', success: false, message: '방에 참여 중이 아닙니다.' }));
            }

            gameState.removePlayer(userId);
            currentRoomId = null;
            ws.roomId = null;

            if (gameState.players.size === 0) {
                gameStates.delete(roomId);
            } else {
                gameState.broadcastToAll({
                    event: 'playerLeft',
                    userId: userId,
                    playerCount: gameState.players.size
                });
            }

            ws.send(JSON.stringify({ event: 'leave', success: true }));
        }

        // 게임 시작
        async function handleStart(data) {
            const { roomId } = data;

            const room = await Room.findByPk(roomId);
            if (!room) {
                return ws.send(JSON.stringify({ event: 'start', success: false, message: '방을 찾을 수 없습니다.' }));
            }

            if (room.hostId !== userId) {
                return ws.send(JSON.stringify({ event: 'start', success: false, message: '방장만 게임을 시작할 수 있습니다.' }));
            }

            const gameState = gameStates.get(roomId);
            if (!gameState || gameState.status !== 'waiting') {
                return ws.send(JSON.stringify({ event: 'start', success: false, message: '이미 게임이 시작되었거나 종료되었습니다.' }));
            }
            if (gameState.players.size < 2) {
                return ws.send(JSON.stringify({ event: 'start', success: false, message: '플레이어가 2명 필요합니다.' }));
            }

            // DB 및 상태 업데이트
            await room.update({ status: 'playing' });
            gameState.status = 'playing';

            // 모든 플레이어에게 초기 상태와 함께 게임 시작 알림
            gameState.broadcastToAll({
                event: 'gameStarted',
                players: Array.from(gameState.players.entries()).map(([id, state]) => ({
                    userId: id,
                    x: state.x,
                    y: state.y,
                    hp: state.hp
                }))
            });

            ws.send(JSON.stringify({ event: 'start', success: true }));
            // TODO: 여기서 게임 루프(Game Loop) 시작 함수를 호출해야 함
        }

        // 캐릭터 이동
        async function handleMove(data) {
            const { x, y } = data;

            const gameState = gameStates.get(currentRoomId);
            if (!gameState || gameState.status !== 'playing') return;

            const player = gameState.getPlayer(userId);
            if (!player) return;

            // TODO: 맵 경계 제한 로직 추가 필요

            player.x = x;
            player.y = y;

            gameState.broadcastToRoom({
                event: 'playerMoved',
                userId: userId,
                x: x,
                y: y
            }, userId);
            
            ws.send(JSON.stringify({ event: 'move', success: true }));
        }
        
        // 공격 스킬
        async function handleAttack(data) {
            const { x, y, damage } = data;

            const gameState = gameStates.get(currentRoomId);
            if (!gameState || gameState.status !== 'playing') return;

            const attacker = gameState.getPlayer(userId);
            if (!attacker || attacker.cooldowns.attack > Date.now()) {
                return ws.send(JSON.stringify({ event: 'attack', success: false, message: '쿨타임 중입니다.' }));
            }

            attacker.cooldowns.attack = Date.now() + 5000;

            gameState.broadcastToAll({
                event: 'playerAttacked',
                userId: userId,
                x: x, // 공격 목표 좌표
                y: y,
                damage: damage
            });
            
            // TODO: 실제 피격 판정 로직 호출 (checkHit)

            sendCooldowns(ws, attacker.cooldowns);
            ws.send(JSON.stringify({ event: 'attack', success: true, x: x, y: y }));
        }

        // 플래시 스킬
        async function handleFlash(data) {
            const { x, y } = data;
            const gameState = gameStates.get(currentRoomId);
            if (!gameState || gameState.status !== 'playing') return;
            const player = gameState.getPlayer(userId);
            
            if (!player || player.cooldowns.flash > Date.now()) {
                return ws.send(JSON.stringify({ event: 'flash', success: false, message: '쿨타임 중입니다.' }));
            }

            player.cooldowns.flash = Date.now() + 300000;
            player.x = x;
            player.y = y;

            gameState.broadcastToAll({
                event: 'playerFlashed',
                userId: userId,
                x: x,
                y: y
            });

            sendCooldowns(ws, player.cooldowns);
            ws.send(JSON.stringify({ event: 'flash', success: true, x: x, y: y }));
        }

        // 유체화 스킬
        async function handleGhost(data) {
            const { speed } = data;
            const gameState = gameStates.get(currentRoomId);
            if (!gameState || gameState.status !== 'playing') return;
            const player = gameState.getPlayer(userId);
            
            if (!player || player.cooldowns.ghost > Date.now()) {
                return ws.send(JSON.stringify({ event: 'ghost', success: false, message: '쿨타임 중입니다.' }));
            }

            player.cooldowns.ghost = Date.now() + 210000;
            
            gameState.broadcastToAll({
                event: 'playerGhosted',
                userId: userId,
                speed: 400,
                time: 4
            });

            sendCooldowns(ws, player.cooldowns);
            ws.send(JSON.stringify({ event: 'ghost', success: true, time: 4, speed: 400 }));
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
                    event: 'playerLeft', 
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

    // 게임 로직 함수 (피격 판정)

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

                // 게임 종료 후 방 삭제 (5초 후)
                setTimeout(() => {
                    gameStates.delete(roomId);
                }, 5000);
            }
        }
    }

    return { wss, checkHit, gameStates };
}

module.exports = initWebSocket;