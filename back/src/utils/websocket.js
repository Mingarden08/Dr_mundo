const WebSocket = require('ws');
const { verifyToken } = require('./jwt'); // HEAD: JWT 인증 모듈
const { Room, RoomParticipant, Member } = require('../models'); // HEAD: DB 모델

// 맵 및 플레이어 크기 정의 (HEAD와 d25b3c6의 상수 통합)
const GAME_CONSTANTS = {
    // HEAD 상수
    MAP_WIDTH: 800,
    MAP_HEIGHT: 600,
    PLAYER_RADIUS: 25, 
    PLAYER_MAX_HP: 1000,
    
    // d25b3c6 상수
    BASE_HP: 1000, // PLAYER_MAX_HP와 통일
    BASE_HP_REGEN: 2.0, // 초당
    BASE_MOVE_SPEED: 355,
    GHOST_SPEED_BONUS: 0.24, // 24%
    GHOST_DURATION: 10000, // 10초
    GHOST_COOLDOWN: 15000, // 15초
    FLASH_COOLDOWN: 5000, // 5초
    FLASH_MIN_RANGE: 100,
    FLASH_MAX_RANGE: 400,
    
    Q_SKILL: {
        MIN_DAMAGE: 80,
        HP_PERCENT_DAMAGE: 0.20, // 20%
        SLOW_PERCENT: 0.40, // 40%
        SLOW_DURATION: 2000, // 2초
        HP_COST: 50,
        COOLDOWN: 3700, // 3.7초
        PROJECTILE_SPEED: 1200, // 투사체 속도
        PROJECTILE_RADIUS: 30, // 투사체 반경
        MAX_RANGE: 2000 // 최대 사거리
    }
};

// 게임 상태 관리 (HEAD 버전 유지)
const gameStates = new Map(); // roomId -> GameState 인스턴스
const playerSockets = new Map(); // userId -> WebSocket 소켓

class GameState {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = new Map(); // userId -> playerState
        this.projectiles = []; // d25b3c6의 projectiles을 GameState로 이동
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

        // d25b3c6의 상세 상태 추가
        const playerState = {
            socket,
            x: initialX, 
            y: initialY,
            targetX: initialX, // d25b3c6
            targetY: initialY, // d25b3c6
            hp: GAME_CONSTANTS.PLAYER_MAX_HP, 
            maxHp: GAME_CONSTANTS.PLAYER_MAX_HP,
            moveSpeed: GAME_CONSTANTS.BASE_MOVE_SPEED, // d25b3c6
            isGhost: false, // d25b3c6
            ghostEndTime: 0, // d25b3c6
            slowEndTime: 0, // d25b3c6
            slowPercent: 0, // d25b3c6
            isDead: false, // d25b3c6
            cooldowns: {
                attack: 0,
                flash: 0,
                ghost: 0,
                rune: 0
            },
            lastUpdateTime: Date.now() // d25b3c6
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

// d25b3c6 버전에서 가져온 헬퍼 함수들 (GameState에 맞게 수정)

// 투사체 생성 (d25b3c6)
function createProjectile(attackerId, fromX, fromY, toX, toY) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    return {
        id: `proj_${Date.now()}_${Math.random()}`,
        attackerId,
        x: fromX,
        y: fromY,
        vx: Math.cos(angle) * GAME_CONSTANTS.Q_SKILL.PROJECTILE_SPEED,
        vy: Math.sin(angle) * GAME_CONSTANTS.Q_SKILL.PROJECTILE_SPEED,
        startTime: Date.now(),
        startX: fromX,
        startY: fromY
    };
}

// HP 자연 회복 및 상태 업데이트 (d25b3c6)
function updatePlayerHP(player) {
    if (player.isDead) return;
    
    const now = Date.now();
    const deltaTime = (now - player.lastUpdateTime) / 1000;
    player.lastUpdateTime = now;
    
    player.hp = Math.min(player.maxHp, player.hp + GAME_CONSTANTS.BASE_HP_REGEN * deltaTime);
    
    // 버프/디버프 상태 체크
    if (player.ghostEndTime > 0 && now >= player.ghostEndTime) {
        player.isGhost = false;
        player.ghostEndTime = 0;
    }
    
    if (player.slowEndTime > 0 && now >= player.slowEndTime) {
        player.slowPercent = 0;
        player.slowEndTime = 0;
    }
}

// 현재 이동속도 계산 (d25b3c6)
function getCurrentMoveSpeed(player) {
    let speed = GAME_CONSTANTS.BASE_MOVE_SPEED;
    
    if (player.isGhost) {
        speed *= (1 + GAME_CONSTANTS.GHOST_SPEED_BONUS);
    }
    
    if (player.slowPercent > 0) {
        speed *= (1 - player.slowPercent);
    }
    
    return speed;
}

// 거리 계산 (d25b3c6)
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// 충돌 체크 (d25b3c6)
function checkCollision(projX, projY, playerX, playerY) {
    return distance(projX, projY, playerX, playerY) < GAME_CONSTANTS.Q_SKILL.PROJECTILE_RADIUS;
}


// 웹소켓 서버 초기화

function initWebSocket(server) {
    const wss = new WebSocket.Server({ server });
    
    // 플레이어 위치 업데이트 (d25b3c6) - GameState에 맞게 수정
    function updatePlayerPosition(player, deltaTime) {
        if (player.isDead) return false;
        
        const dx = player.targetX - player.x;
        const dy = player.targetY - player.y;
        const distToTarget = distance(player.x, player.y, player.targetX, player.targetY);
        
        if (distToTarget < 5) {
            if (player.x !== player.targetX || player.y !== player.targetY) {
                player.x = player.targetX;
                player.y = player.targetY;
                return true;
            }
            return false;
        }
        
        const currentSpeed = getCurrentMoveSpeed(player);
        const moveDistance = currentSpeed * deltaTime;
        
        if (moveDistance >= distToTarget) {
            player.x = player.targetX;
            player.y = player.targetY;
        } else {
            const ratio = moveDistance / distToTarget;
            player.x += dx * ratio;
            player.y += dy * ratio;
        }
        
        return true;
    }
    
    // 투사체 업데이트 및 충돌 체크 (d25b3c6) - GameState에 맞게 수정
    function updateProjectiles(gameState) {
        if (gameState.status !== 'playing' || !gameState.projectiles) return;

        const now = Date.now();
        const toRemove = [];

        gameState.projectiles.forEach((proj, index) => {
            const elapsed = (now - proj.startTime) / 1000;
            proj.x = proj.startX + proj.vx * elapsed;
            proj.y = proj.startY + proj.vy * elapsed;

            // 최대 사거리 체크
            const travelDist = distance(proj.startX, proj.startY, proj.x, proj.y);
            if (travelDist > GAME_CONSTANTS.Q_SKILL.MAX_RANGE) {
                toRemove.push(index);
                return;
            }

            // 충돌 체크
            gameState.players.forEach((target, targetUserId) => {
                if (targetUserId === proj.attackerId || target.isDead) return;
                
                if (checkCollision(proj.x, proj.y, target.x, target.y)) {
                    // 공격자 찾기
                    const attacker = gameState.getPlayer(proj.attackerId);

                    if (attacker) {
                        // 데미지 계산
                        const damage = Math.max(
                            GAME_CONSTANTS.Q_SKILL.MIN_DAMAGE,
                            attacker.hp * GAME_CONSTANTS.Q_SKILL.HP_PERCENT_DAMAGE
                        );
                        
                        target.hp -= damage;
                        
                        // 둔화 적용
                        target.slowPercent = GAME_CONSTANTS.Q_SKILL.SLOW_PERCENT;
                        target.slowEndTime = now + GAME_CONSTANTS.Q_SKILL.SLOW_DURATION;
                        
                        // HP 회복 (맞춘 플레이어)
                        attacker.hp = Math.min(attacker.maxHp, attacker.hp + GAME_CONSTANTS.Q_SKILL.HP_COST);
                        
                        // 피격 판정 브로드캐스트
                        gameState.broadcastToAll({
                            event: 'hit',
                            userId: targetUserId, // 피격자 ID
                            hp: Math.max(0, target.hp),
                            x: target.x,
                            y: target.y
                        });
                        
                        // 사망 체크
                        if (target.hp <= 0) {
                            target.hp = 0;
                            target.isDead = true;
                            
                            gameState.broadcastToAll({
                                event: 'finish',
                                winnerId: proj.attackerId,
                                roomId: gameState.roomId
                            });
                        }
                    }
                    
                    toRemove.push(index);
                }
            });
        });

        // 제거할 투사체 삭제
        for (let i = toRemove.length - 1; i >= 0; i--) {
            gameState.projectiles.splice(toRemove[i], 1);
        }
    }

    // 주기적 쿨타임 브로드캐스트 및 위치 업데이트 (d25b3c6) - GameState에 맞게 수정
    setInterval(() => {
        gameStates.forEach((gameState, roomId) => {
            if (gameState.status !== 'playing') return;
            
            const now = Date.now();
            const positionUpdates = [];
            
            gameState.players.forEach((player, userId) => {
                if (player.socket.readyState === WebSocket.OPEN) {
                    updatePlayerHP(player);
                    
                    // 플레이어 위치 업데이트
                    const moved = updatePlayerPosition(player, 0.05); // 50ms = 0.05초
                    if (moved) {
                        positionUpdates.push({
                            userId: userId,
                            x: player.x,
                            y: player.y
                        });
                    }
                    
                    // 쿨타임 정보 전송
                    player.socket.send(JSON.stringify({
                        event: 'coolTime',
                        attack: Math.max(0, Math.ceil((player.cooldowns.attack - now) / 1000)),
                        ghost: Math.max(0, Math.ceil((player.cooldowns.ghost - now) / 1000)),
                        flash: Math.max(0, Math.ceil((player.cooldowns.flash - now) / 1000))
                    }));
                }
            });
            
            // 위치 변경된 플레이어들 브로드캐스트
            if (positionUpdates.length > 0) {
                gameState.broadcastToAll({
                    event: 'positionUpdate',
                    players: positionUpdates
                });
            }
            
            // 투사체 업데이트
            updateProjectiles(gameState);
        });
    }, 50); // 20fps로 업데이트

    // wss.on('connection', 핸들러
    wss.on('connection', (ws, req) => {
        let userId = null;
        let currentRoomId = null; 

        ws.userId = null; 
        ws.roomId = null;

        ws.on('message', async (msg) => { // async 추가
            try {
                const data = JSON.parse(msg);

                switch (data.event) {
                    case 'auth':
                        await handleAuth(data);
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
                        console.log('Unknown event:', data.event);
                        break;
                }
            } catch (err) {
                console.error('WebSocket Error:', err);
                ws.send(JSON.stringify({ 
                    event: 'error', 
                    message: '서버 처리 중 에러가 발생했습니다.' 
                }));
            }
        });

        ws.on('close', async () => {
            // 연결 끊김 처리 (비정상 종료 시)
            if (ws.userId && ws.roomId) {
                await handleDisconnect(ws.userId, ws.roomId);
            }
            if (ws.userId) {
                playerSockets.delete(ws.userId);
            }
        });

        // ===================================
        // 핸들러 함수들
        // ===================================

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

        // 방 참가 (개선 버전)
        async function handleJoin(data) {
            const { roomId } = data;
            if (!userId) {
                return ws.send(JSON.stringify({ 
                    event: 'join', 
                    success: false, 
                    message: '인증되지 않은 사용자입니다.' 
                }));
            }

            try {
                // 1. DB에서 방 정보 확인
                const room = await Room.findByPk(roomId);
                if (!room) {
                    return ws.send(JSON.stringify({ 
                        event: 'join', 
                        success: false, 
                        message: '방을 찾을 수 없습니다.' 
                    }));
                }

                // 2. 게임이 이미 진행 중인지 확인
                if (room.status === 'playing') {
                    return ws.send(JSON.stringify({ 
                        event: 'join', 
                        success: false, 
                        message: '이미 게임이 진행 중입니다.' 
                    }));
                }

                // 3. 기존에 다른 방에 참여 중이라면 먼저 나가기
                if (ws.roomId && ws.roomId !== roomId) {
                    await handleLeave({ roomId: ws.roomId });
                }

                // 4. GameState 초기화
                if (!gameStates.has(roomId)) {
                    gameStates.set(roomId, new GameState(roomId));
                }
                const gameState = gameStates.get(roomId);

                // 5. 이미 이 방에 참여 중인지 확인 (재접속 케이스)
                const existingPlayer = gameState.getPlayer(userId);
                if (existingPlayer) {
                    // 재접속: 소켓만 업데이트
                    existingPlayer.socket = ws;
                    ws.roomId = roomId;
                    currentRoomId = roomId;

                    // 현재 방 상태 전송
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
                        reconnected: true
                    }));

                    return;
                }

                // 6. 방 인원 제한 확인
                if (gameState.players.size >= 2) {
                    return ws.send(JSON.stringify({ 
                        event: 'join', 
                        success: false, 
                        message: '방이 가득 찼습니다.' 
                    }));
                }

                // 7. DB에 참가자 추가
                const [participant, created] = await RoomParticipant.findOrCreate({
                    where: { roomId, memberId: userId },
                    defaults: { roomId, memberId: userId }
                });

                // 8. GameState에 플레이어 추가
                const newPlayerState = gameState.addPlayer(userId, ws);
                currentRoomId = roomId;
                ws.roomId = roomId;

                // 9. 자신에게 현재 방 상태 전송
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

                // 10. 다른 플레이어들에게 새 플레이어 참가 알림
                gameState.broadcastToRoom({
                    event: 'playerJoined',
                    userId: userId,
                    x: newPlayerState.x,
                    y: newPlayerState.y,
                    hp: newPlayerState.hp,
                    playerCount: gameState.players.size
                }, userId);

            } catch (error) {
                console.error('Join error:', error);
                ws.send(JSON.stringify({ 
                    event: 'join', 
                    success: false, 
                    message: '방 참가 중 오류가 발생했습니다.' 
                }));
            }
        }

        // 방 나가기 (개선 버전)
        async function handleLeave(data) {
            const { roomId } = data;
            
            try {
                const gameState = gameStates.get(roomId);
                
                // 1. GameState에서 플레이어 제거
                if (gameState) {
                    const player = gameState.getPlayer(userId);
                    
                    // 게임 진행 중이라면 나가기 불가
                    if (gameState.status === 'playing' && player) {
                        return ws.send(JSON.stringify({ 
                            event: 'leave', 
                            success: false, 
                            message: '게임 진행 중에는 나갈 수 없습니다.' 
                        }));
                    }

                    gameState.removePlayer(userId);
                }

                // 2. DB에서 참가자 제거
                await RoomParticipant.destroy({
                    where: { roomId, memberId: userId }
                });

                // 3. 소켓 상태 초기화
                currentRoomId = null;
                ws.roomId = null;

                // 4. 방이 비었으면 GameState 삭제
                if (gameState) {
                    if (gameState.players.size === 0) {
                        gameStates.delete(roomId);
                        
                        // DB에서도 방 삭제 (선택사항)
                        const remainingParticipants = await RoomParticipant.count({ where: { roomId } });
                        if (remainingParticipants === 0) {
                            await Room.destroy({ where: { id: roomId } });
                        }
                    } else {
                        // 다른 플레이어들에게 알림
                        gameState.broadcastToAll({
                            event: 'playerLeft',
                            userId: userId,
                            playerCount: gameState.players.size
                        });
                    }
                }

                ws.send(JSON.stringify({ event: 'leave', success: true }));

            } catch (error) {
                console.error('Leave error:', error);
                ws.send(JSON.stringify({ 
                    event: 'leave', 
                    success: false, 
                    message: '방 나가기 중 오류가 발생했습니다.' 
                }));
            }
        }

        // 게임 시작 (개선 버전)
        async function handleStart(data) {
            const { roomId } = data;

            try {
                // 1. DB 방 정보 확인
                const room = await Room.findByPk(roomId);
                if (!room) {
                    return ws.send(JSON.stringify({ 
                        event: 'start', 
                        success: false, 
                        message: '방을 찾을 수 없습니다.' 
                    }));
                }

                // 2. 방장 권한 확인
                if (room.hostId !== userId) {
                    return ws.send(JSON.stringify({ 
                        event: 'start', 
                        success: false, 
                        message: '방장만 게임을 시작할 수 있습니다.' 
                    }));
                }

                // 3. GameState 확인
                const gameState = gameStates.get(roomId);
                if (!gameState) {
                    return ws.send(JSON.stringify({ 
                        event: 'start', 
                        success: false, 
                        message: '게임 상태를 찾을 수 없습니다.' 
                    }));
                }

                // 4. 이미 시작된 게임인지 확인
                if (gameState.status !== 'waiting') {
                    return ws.send(JSON.stringify({ 
                        event: 'start', 
                        success: false, 
                        message: '이미 게임이 시작되었거나 종료되었습니다.' 
                    }));
                }

                // 5. 플레이어 수 확인
                if (gameState.players.size < 2) {
                    return ws.send(JSON.stringify({ 
                        event: 'start', 
                        success: false, 
                        message: '플레이어가 2명 필요합니다.' 
                    }));
                }

                // 6. 모든 플레이어의 소켓이 연결되어 있는지 확인
                let allConnected = true;
                gameState.players.forEach((player) => {
                    if (player.socket.readyState !== WebSocket.OPEN) {
                        allConnected = false;
                    }
                });

                if (!allConnected) {
                    return ws.send(JSON.stringify({ 
                        event: 'start', 
                        success: false, 
                        message: '모든 플레이어가 연결되어 있지 않습니다.' 
                    }));
                }

                // 7. DB 및 GameState 업데이트
                await room.update({ status: 'playing' });
                gameState.status = 'playing';

                // 8. 모든 플레이어 상태 초기화
                const now = Date.now();
                gameState.players.forEach((player) => {
                    player.lastUpdateTime = now;
                    player.isDead = false;
                    player.isGhost = false;
                    player.ghostEndTime = 0;
                    player.slowEndTime = 0;
                    player.slowPercent = 0;
                    player.cooldowns = {
                        attack: 0,
                        flash: 0,
                        ghost: 0,
                        rune: 0
                    };
                });

                // 9. 게임 시작 알림
                const playersData = Array.from(gameState.players.entries()).map(([id, state]) => ({
                    userId: id,
                    x: state.x,
                    y: state.y,
                    hp: state.hp
                }));

                gameState.broadcastToAll({
                    event: 'gameStarted',
                    players: playersData
                });

                ws.send(JSON.stringify({ event: 'start', success: true }));

            } catch (error) {
                console.error('Start error:', error);
                ws.send(JSON.stringify({ 
                    event: 'start', 
                    success: false, 
                    message: '게임 시작 중 오류가 발생했습니다.' 
                }));
            }
        }

        // 캐릭터 이동 (d25b3c6의 목표 지점 설정 로직 반영)
        async function handleMove(data) {
            const { x, y } = data;

            const gameState = gameStates.get(currentRoomId);
            if (!gameState || gameState.status !== 'playing') return;

            const player = gameState.getPlayer(userId);
            if (!player || player.isDead) return;

            // TODO: 맵 경계 제한 로직 추가 필요

            // d25b3c6 로직: 목표 지점만 설정 (실제 이동은 setInterval 루프에서 처리)
            player.targetX = x;
            player.targetY = y;
            
            // 다른 플레이어들에게 이동 목표 알림
            gameState.broadcastToRoom({
                event: 'playerMoveTarget',
                userId: userId,
                targetX: x, 
                targetY: y 
            }, userId);

            ws.send(JSON.stringify({ event: 'move', success: true }));
        }
        
        // 공격 스킬
        async function handleAttack(data) {
            const { x, y } = data; // 공격 목표 좌표
            const now = Date.now();

            const gameState = gameStates.get(currentRoomId);
            if (!gameState || gameState.status !== 'playing') return;

            const attacker = gameState.getPlayer(userId);
            if (!attacker || attacker.isDead || attacker.cooldowns.attack > now) {
                return ws.send(JSON.stringify({ event: 'attack', success: false, message: '쿨타임 중이거나 사망했습니다.' }));
            }

            // HP 소모
            attacker.hp -= GAME_CONSTANTS.Q_SKILL.HP_COST;
            if (attacker.hp <= 0) {
                 attacker.hp = 0;
                 attacker.isDead = true;
                 gameState.broadcastToAll({ event: 'finish', winnerId: 'suicide', roomId: currentRoomId });
                 return;
            }
            
            // 쿨타임 설정
            attacker.cooldowns.attack = now + GAME_CONSTANTS.Q_SKILL.COOLDOWN;
            
            // 투사체 생성 (서버에서 관리)
            const projectile = createProjectile(userId, attacker.x, attacker.y, x, y);
            gameState.projectiles.push(projectile);
            
            // 스킬 시전 알림
            gameState.broadcastToAll({
                event: 'attackCast',
                userId: userId,
                x: x, 
                y: y,
                fromX: attacker.x,
                fromY: attacker.y,
            });
            
            sendCooldowns(ws, attacker.cooldowns);
            ws.send(JSON.stringify({ event: 'attack', success: true, x: x, y: y }));
        }

        // 플래시 스킬 (d25b3c6의 상세 로직 반영)
        async function handleFlash(data) {
            const { x, y } = data;
            const gameState = gameStates.get(currentRoomId);
            const now = Date.now();
            
            if (!gameState || gameState.status !== 'playing') return;
            const player = gameState.getPlayer(userId);
            
            if (!player || player.isDead || player.cooldowns.flash > now) {
                return ws.send(JSON.stringify({ event: 'flash', success: false, message: '쿨타임 중입니다.' }));
            }

            // 거리 검증
            const dist = distance(player.x, player.y, x, y);
            
            if (dist >= GAME_CONSTANTS.FLASH_MIN_RANGE && dist <= GAME_CONSTANTS.FLASH_MAX_RANGE) {
                player.x = x;
                player.y = y;
                player.targetX = x; // 플래시 후 이동 목표도 재설정
                player.targetY = y;
                player.cooldowns.flash = now + GAME_CONSTANTS.FLASH_COOLDOWN;
                
                gameState.broadcastToAll({
                    event: 'playerFlashed',
                    userId: userId,
                    x: x,
                    y: y
                });
                
                sendCooldowns(ws, player.cooldowns);
                ws.send(JSON.stringify({ event: 'flash', success: true, x: x, y: y }));
            } else {
                 return ws.send(JSON.stringify({ event: 'flash', success: false, message: '유효하지 않은 플래시 거리입니다.' }));
            }
        }

        // 유체화 스킬 (d25b3c6의 상세 로직 반영)
        async function handleGhost(data) {
            const gameState = gameStates.get(currentRoomId);
            const now = Date.now();
            
            if (!gameState || gameState.status !== 'playing') return;
            const player = gameState.getPlayer(userId);
            
            if (!player || player.isDead || player.cooldowns.ghost > now) {
                return ws.send(JSON.stringify({ event: 'ghost', success: false, message: '쿨타임 중입니다.' }));
            }

            player.isGhost = true;
            player.ghostEndTime = now + GAME_CONSTANTS.GHOST_DURATION;
            player.cooldowns.ghost = now + GAME_CONSTANTS.GHOST_COOLDOWN;
            
            const newSpeed = getCurrentMoveSpeed(player);
            const timeInSeconds = Math.ceil(GAME_CONSTANTS.GHOST_DURATION / 1000);
            
            gameState.broadcastToAll({
                event: 'ghostActivated',
                userId: userId,
                speed: newSpeed
            });
            
            sendCooldowns(ws, player.cooldowns);
            ws.send(JSON.stringify({
                event: 'ghost', 
                success: true, 
                time: timeInSeconds, 
                speed: newSpeed 
            }));
        }

        // 연결 끊김 처리 (개선 버전)
        async function handleDisconnect(userId, roomId) {
            try {
                const gameState = gameStates.get(roomId);
                if (!gameState) return;

                const player = gameState.getPlayer(userId);
                if (!player) return;

                // 게임 진행 중이라면
                if (gameState.status === 'playing') {
                    // 플레이어를 사망 처리
                    player.isDead = true;
                    player.hp = 0;

                    // 상대방 승리 처리
                    const otherPlayers = Array.from(gameState.players.entries())
                        .filter(([id]) => id !== userId);
                    
                    if (otherPlayers.length > 0) {
                        const [winnerId] = otherPlayers[0];
                        gameState.broadcastToAll({
                            event: 'finish',
                            winnerId: winnerId,
                            reason: 'disconnect',
                            roomId: roomId
                        });
                    }

                    // DB 상태 업데이트
                    await Room.update(
                        { status: 'finished' },
                        { where: { id: roomId } }
                    );

                    // GameState 정리
                    gameState.status = 'finished';
                }

                // 플레이어 제거
                gameState.removePlayer(userId);

                // DB에서 참가자 제거
                await RoomParticipant.destroy({
                    where: { roomId, memberId: userId }
                });

                // 방이 비었으면 정리
                if (gameState.players.size === 0) {
                    gameStates.delete(roomId);
                } else {
                    gameState.broadcastToAll({
                        event: 'playerLeft',
                        userId: userId,
                        reason: 'disconnect',
                        playerCount: gameState.players.size
                    });
                }

            } catch (error) {
                console.error('Disconnect handling error:', error);
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

    return { wss, gameStates };
}

module.exports = { initWebSocket, gameStates, playerSockets };
            