// D:\Dr_mundo\back\src\utils\websocket.js

const WebSocket = require('ws');
const { verifyToken } = require('./jwt'); // './jwt' 파일에 verifyToken 함수 구현 필요
const { Room, RoomParticipant, Member } = require('../models'); // DB 모델 (models 폴더에 정의 필요)

// 맵 및 플레이어 크기 정의
const GAME_CONSTANTS = {
    MAP_WIDTH: 800,
    MAP_HEIGHT: 600,
    PLAYER_RADIUS: 25, 
    PLAYER_MAX_HP: 1000,
    
    BASE_HP: 1000, 
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

// 게임 상태 관리
const gameStates = new Map(); // roomId -> GameState 인스턴스
const playerSockets = new Map(); // userId -> WebSocket 소켓 (선택적)

class GameState {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = new Map(); // userId -> playerState
        this.projectiles = []; 
        this.status = 'waiting'; // waiting, playing, finished
    }

    addPlayer(userId, socket) {
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
            targetX: initialX, 
            targetY: initialY, 
            hp: GAME_CONSTANTS.PLAYER_MAX_HP, 
            maxHp: GAME_CONSTANTS.PLAYER_MAX_HP,
            moveSpeed: GAME_CONSTANTS.BASE_MOVE_SPEED, 
            isGhost: false, 
            ghostEndTime: 0, 
            slowEndTime: 0, 
            slowPercent: 0, 
            isDead: false, 
            cooldowns: {
                attack: 0,
                flash: 0,
                ghost: 0,
                rune: 0
            },
            lastUpdateTime: Date.now()
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

// 헬퍼 함수들 ------------------------------------------------------------------

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

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function checkCollision(projX, projY, playerX, playerY) {
    return distance(projX, projY, playerX, playerY) < GAME_CONSTANTS.Q_SKILL.PROJECTILE_RADIUS;
}

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


// 웹소켓 서버 초기화 함수 -------------------------------------------------------

function initWebSocket(server) {
    const wss = new WebSocket.Server({ server });
    
    // 플레이어 위치 업데이트 (내부 함수)
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
    
    // 투사체 업데이트 및 충돌 체크 (내부 함수)
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

    // 주기적 쿨타임 브로드캐스트 및 위치 업데이트
    setInterval(() => {
        gameStates.forEach((gameState) => {
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
                    sendCooldowns(player.socket, player.cooldowns);
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
    // 웹소켓 연결 핸들러 -------------------------------------------------------

    wss.on('connection', (ws, req) => {
        // ws.userId와 ws.roomId는 연결 시점에 null로 시작
        ws.userId = null; 
        ws.roomId = null;

        ws.on('message', async (msg) => { 
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
            // 연결 끊김 처리
            if (ws.userId && ws.roomId) {
                await handleDisconnect(ws.userId, ws.roomId); // handleDisconnect는 정의되지 않았으므로 아래 handleLeave 로직을 대체함
            }
            if (ws.userId) {
                playerSockets.delete(ws.userId);
            }
            
            // 연결 끊김 시 방 나가기 로직을 handleDisconnect 대신 직접 처리
            if (ws.roomId && ws.userId) {
                const roomId = ws.roomId;
                const gameState = gameStates.get(roomId);
                
                if (gameState) {
                    gameState.removePlayer(ws.userId);

                    if (gameState.players.size === 0) {
                        gameStates.delete(roomId);
                        // DB 방 삭제 로직은 handleLeave에 맡김 (선택 사항)
                    } else {
                        // 다른 플레이어들에게 알림
                        gameState.broadcastToAll({
                            event: 'playerLeft',
                            userId: ws.userId,
                            playerCount: gameState.players.size
                        });
                    }
                }
                ws.roomId = null;
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

            ws.userId = decoded.id; // ws.userId에 할당
            playerSockets.set(ws.userId, ws);

            ws.send(JSON.stringify({ 
                event: 'auth', 
                success: true, 
                playerId: ws.userId 
            })); 
        }

        // 방 참가 
        async function handleJoin(data) {
            const { roomId } = data;
            const userId = ws.userId;
            
            if (!userId) {
                return ws.send(JSON.stringify({ event: 'join', success: false, message: '인증되지 않은 사용자입니다.' }));
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

                // 3. GameState 초기화 및 가져오기
                if (!gameStates.has(roomId)) {
                    gameStates.set(roomId, new GameState(roomId));
                }
                const gameState = gameStates.get(roomId);

                // 4. 이미 이 방에 참여 중인지 확인 (재접속 케이스)
                const existingPlayer = gameState.getPlayer(userId);
                if (existingPlayer) {
                    // 재접속: 소켓만 업데이트
                    existingPlayer.socket = ws;
                    ws.roomId = roomId;

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
                
                // 5. 방 인원 제한 확인 (재접속이 아닌 경우)
                if (gameState.players.size >= 2) {
                    return ws.send(JSON.stringify({ 
                        event: 'join', 
                        success: false, 
                        message: '방이 가득 찼습니다.' 
                    }));
                }
                
                // 6. 이전 방 나가기 (선택적)
                if (ws.roomId && ws.roomId !== roomId) {
                    await handleLeave({ roomId: ws.roomId });
                }

                // 7. DB에 참가자 추가
                await RoomParticipant.findOrCreate({
                    where: { roomId, memberId: userId },
                    defaults: { roomId, memberId: userId }
                });

                // 8. GameState에 플레이어 추가
                const newPlayerState = gameState.addPlayer(userId, ws);
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

        // 방 나가기
        async function handleLeave(data) {
            const { roomId } = data;
            const userId = ws.userId;
            
            if (!userId || !roomId) return;
            
            const gameState = gameStates.get(roomId);

            try {
                if (gameState) {
                    // 게임 진행 중일 때 나가기 방지
                    if (gameState.status === 'playing' && gameState.getPlayer(userId)) {
                        return ws.send(JSON.stringify({ 
                            event: 'leave', 
                            success: false, 
                            message: '게임 진행 중에는 나갈 수 없습니다.' 
                        }));
                    }
                    // GameState에서 플레이어 제거
                    gameState.removePlayer(userId);
                }

                // DB에서 참가자 제거
                await RoomParticipant.destroy({
                    where: { roomId, memberId: userId }
                });

                // 소켓 상태 초기화
                ws.roomId = null;

                // 방 정리 및 알림
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

        // 게임 시작
        async function handleStart(data) {
            const { roomId } = data;
            const userId = ws.userId;

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

        // 캐릭터 이동 
        async function handleMove(data) {
            const { x, y } = data;

            const gameState = gameStates.get(ws.roomId);
            if (!gameState || gameState.status !== 'playing') return;

            const player = gameState.getPlayer(ws.userId);
            if (!player || player.isDead) return;

            // d25b3c6 로직: 목표 지점만 설정 (실제 이동은 setInterval 루프에서 처리)
            player.targetX = x;
            player.targetY = y;
            
            // 다른 플레이어들에게 이동 목표 알림
            gameState.broadcastToRoom({
                event: 'playerMoveTarget',
                userId: ws.userId,
                targetX: x, 
                targetY: y 
            }, ws.userId);

            ws.send(JSON.stringify({ event: 'move', success: true }));
        }
        
        // 공격 스킬
        async function handleAttack(data) {
            const { x, y } = data; // 공격 목표 좌표
            const now = Date.now();

            const gameState = gameStates.get(ws.roomId);
            if (!gameState || gameState.status !== 'playing') return;

            const attacker = gameState.getPlayer(ws.userId);
            if (!attacker || attacker.isDead || attacker.cooldowns.attack > now) {
                return ws.send(JSON.stringify({ event: 'attack', success: false, message: '쿨타임 중이거나 사망했습니다.' }));
            }

            // HP 소모
            attacker.hp -= GAME_CONSTANTS.Q_SKILL.HP_COST;
            
            // HP가 0 이하로 떨어지면 자살 처리
            if (attacker.hp <= 0) {
                 attacker.hp = 0;
                 attacker.isDead = true;
                 gameState.broadcastToAll({ event: 'finish', winnerId: 'suicide', roomId: ws.roomId });
                 return;
            }
            
            // 쿨타임 설정
            attacker.cooldowns.attack = now + GAME_CONSTANTS.Q_SKILL.COOLDOWN;
            
            // 투사체 생성 (서버에서 관리)
            const projectile = createProjectile(ws.userId, attacker.x, attacker.y, x, y);
            gameState.projectiles.push(projectile);
            
            // 스킬 시전 알림
            gameState.broadcastToAll({
                event: 'attackCast',
                userId: ws.userId,
                x: x, 
                y: y,
                fromX: attacker.x,
                fromY: attacker.y,
            });
            
            sendCooldowns(ws, attacker.cooldowns);
            ws.send(JSON.stringify({ event: 'attack', success: true, x: x, y: y }));
        }

        // 플래시 스킬
        async function handleFlash(data) {
            const { x, y } = data;
            const gameState = gameStates.get(ws.roomId);
            const now = Date.now();
            
            if (!gameState || gameState.status !== 'playing') return;
            const player = gameState.getPlayer(ws.userId);
            
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
                    userId: ws.userId,
                    x: x,
                    y: y
                });
                
                sendCooldowns(ws, player.cooldowns);
                ws.send(JSON.stringify({ event: 'flash', success: true, x: x, y: y }));
            } else {
                 return ws.send(JSON.stringify({ event: 'flash', success: false, message: '유효하지 않은 플래시 거리입니다.' }));
            }
        }

        // 유체화 스킬
        async function handleGhost(data) {
            const gameState = gameStates.get(ws.roomId);
            const now = Date.now();
            
            if (!gameState || gameState.status !== 'playing') return;
            const player = gameState.getPlayer(ws.userId);
            
            if (!player || player.isDead || player.cooldowns.ghost > now) {
                return ws.send(JSON.stringify({ event: 'ghost', success: false, message: '쿨타임 중입니다.' }));
            }

            player.isGhost = true;
            player.ghostEndTime = now + GAME_CONSTANTS.GHOST_DURATION;
            player.cooldowns.ghost = now + GAME_CONSTANTS.GHOST_COOLDOWN;
            
            const newSpeed = getCurrentMoveSpeed(player);
            
            gameState.broadcastToAll({
                event: 'ghostActivated',
                userId: ws.userId,
            });
            
            sendCooldowns(ws, player.cooldowns);
            ws.send(JSON.stringify({ event: 'ghost', success: true, newSpeed: newSpeed }));
        }
    }); // wss.on('connection') 끝
} // initWebSocket 끝

module.exports = initWebSocket;