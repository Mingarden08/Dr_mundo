const WebSocket = require('ws');

function initWebSocket(server) {
    const wss = new WebSocket.Server({ server });
    const rooms = {}; // roomId: { players: Map, gameStarted: false }
    
    // 게임 상수
    const GAME_CONSTANTS = {
        BASE_HP: 705,
        BASE_HP_REGEN: 2.0, // 초당
        BASE_MOVE_SPEED: 355,
        GHOST_SPEED_BONUS: 0.24, // 24%
        GHOST_DURATION: 10000, // 10초
        
        Q_SKILL: {
            MIN_DAMAGE: 80,
            HP_PERCENT_DAMAGE: 0.20, // 20%
            SLOW_PERCENT: 0.40, // 40%
            SLOW_DURATION: 2000, // 2초
            HP_COST: 50,
            COOLDOWN: 3700 // 3.7초
        }
    };

    // 플레이어 상태 초기화
    function createPlayerState(playerId) {
        return {
            playerId,
            x: 0,
            y: 0,
            targetX: 0,
            targetY: 0,
            hp: GAME_CONSTANTS.BASE_HP,
            maxHp: GAME_CONSTANTS.BASE_HP,
            moveSpeed: GAME_CONSTANTS.BASE_MOVE_SPEED,
            isGhost: false,
            ghostEndTime: 0,
            slowEndTime: 0,
            slowPercent: 0,
            cooldowns: {
                q: 0,
                ghost: 0,
                flash: 0
            },
            lastUpdateTime: Date.now()
        };
    }

    // HP 자연 회복 계산
    function updatePlayerHP(player) {
        const now = Date.now();
        const deltaTime = (now - player.lastUpdateTime) / 1000; // 초 단위
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

    // 현재 이동속도 계산
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

    // 방의 모든 플레이어에게 메시지 전송
    function broadcastToRoom(roomId, message, excludeWs = null) {
        if (!rooms[roomId]) return;
        
        rooms[roomId].players.forEach((playerState, ws) => {
            if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            }
        });
    }

    wss.on('connection', (ws) => {
        ws.playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        ws.roomId = null;

        ws.send(JSON.stringify({ event: 'connected', playerId: ws.playerId }));

        ws.on('message', (msg) => {
            const data = JSON.parse(msg);

            switch (data.event) {
                case 'join':
                    const roomId = data.roomId;
                    if (!rooms[roomId]) {
                        rooms[roomId] = { 
                            players: new Map(), 
                            gameStarted: false 
                        };
                    }
                    
                    const playerState = createPlayerState(ws.playerId);
                    rooms[roomId].players.set(ws, playerState);
                    ws.roomId = roomId;
                    
                    // 기존 플레이어 정보 전송
                    const existingPlayers = [];
                    rooms[roomId].players.forEach((state, socket) => {
                        if (socket !== ws) {
                            existingPlayers.push({
                                playerId: state.playerId,
                                x: state.x,
                                y: state.y,
                                hp: state.hp,
                                maxHp: state.maxHp
                            });
                        }
                    });
                    
                    ws.send(JSON.stringify({ 
                        event: 'joined',
                        success: true,
                        playerId: ws.playerId,
                        playerState: playerState,
                        existingPlayers: existingPlayers,
                        constants: GAME_CONSTANTS
                    }));
                    
                    // 다른 플레이어들에게 새 플레이어 알림
                    broadcastToRoom(roomId, {
                        event: 'playerJoined',
                        playerId: ws.playerId,
                        x: playerState.x,
                        y: playerState.y,
                        hp: playerState.hp,
                        maxHp: playerState.maxHp
                    }, ws);
                    break;

                case 'leave':
                    if (ws.roomId && rooms[ws.roomId]) {
                        rooms[ws.roomId].players.delete(ws);
                        broadcastToRoom(ws.roomId, {
                            event: 'playerLeft',
                            playerId: ws.playerId
                        });
                        ws.roomId = null;
                    }
                    ws.send(JSON.stringify({ event: 'left', success: true }));
                    break;

                case 'start':
                    if (ws.roomId && rooms[ws.roomId]) {
                        rooms[ws.roomId].gameStarted = true;
                        broadcastToRoom(ws.roomId, { event: 'gameStarted' });
                    }
                    break;

                case 'move':
                    // 오른쪽 클릭으로 이동 (targetX, targetY로 이동)
                    if (ws.roomId && rooms[ws.roomId]) {
                        const player = rooms[ws.roomId].players.get(ws);
                        if (player) {
                            updatePlayerHP(player);
                            
                            player.targetX = data.x;
                            player.targetY = data.y;
                            
                            const moveSpeed = getCurrentMoveSpeed(player);
                            
                            broadcastToRoom(ws.roomId, {
                                event: 'playerMove',
                                playerId: ws.playerId,
                                fromX: player.x,
                                fromY: player.y,
                                toX: data.x,
                                toY: data.y,
                                moveSpeed: moveSpeed
                            }, ws);
                            
                            // 현재 위치 업데이트
                            player.x = data.x;
                            player.y = data.y;
                            
                            ws.send(JSON.stringify({ 
                                event: 'moveConfirmed',
                                success: true,
                                moveSpeed: moveSpeed
                            }));
                        }
                    }
                    break;

                case 'qSkill':
                    // Q 스킬 사용
                    if (ws.roomId && rooms[ws.roomId]) {
                        const player = rooms[ws.roomId].players.get(ws);
                        const now = Date.now();
                        
                        if (player && player.cooldowns.q <= now) {
                            updatePlayerHP(player);
                            
                            // HP 소모
                            player.hp -= GAME_CONSTANTS.Q_SKILL.HP_COST;
                            
                            if (player.hp <= 0) {
                                player.hp = 0;
                                // 사망 처리
                                broadcastToRoom(ws.roomId, {
                                    event: 'playerDied',
                                    playerId: ws.playerId
                                });
                            }
                            
                            // 쿨타임 설정
                            player.cooldowns.q = now + GAME_CONSTANTS.Q_SKILL.COOLDOWN;
                            
                            // 다른 플레이어들에게 스킬 사용 알림
                            broadcastToRoom(ws.roomId, {
                                event: 'qSkillCast',
                                playerId: ws.playerId,
                                x: data.x,
                                y: data.y,
                                fromX: player.x,
                                fromY: player.y
                            }, ws);
                            
                            ws.send(JSON.stringify({ 
                                event: 'qSkillConfirmed',
                                success: true,
                                hp: player.hp,
                                cooldownEnd: player.cooldowns.q
                            }));
                        } else {
                            ws.send(JSON.stringify({ 
                                event: 'qSkillConfirmed',
                                success: false,
                                reason: 'cooldown'
                            }));
                        }
                    }
                    break;

                case 'qSkillHit':
                    // Q 스킬이 적중했을 때 (클라이언트에서 충돌 감지 후 알림)
                    if (ws.roomId && rooms[ws.roomId]) {
                        const attacker = rooms[ws.roomId].players.get(ws);
                        const targetWs = Array.from(rooms[ws.roomId].players.keys())
                            .find(socket => socket.playerId === data.targetPlayerId);
                        
                        if (attacker && targetWs) {
                            const target = rooms[ws.roomId].players.get(targetWs);
                            
                            // 데미지 계산
                            const damage = Math.max(
                                GAME_CONSTANTS.Q_SKILL.MIN_DAMAGE,
                                attacker.hp * GAME_CONSTANTS.Q_SKILL.HP_PERCENT_DAMAGE
                            );
                            
                            target.hp -= damage;
                            
                            // 둔화 적용
                            target.slowPercent = GAME_CONSTANTS.Q_SKILL.SLOW_PERCENT;
                            target.slowEndTime = Date.now() + GAME_CONSTANTS.Q_SKILL.SLOW_DURATION;
                            
                            // HP 회복 (맞춘 플레이어)
                            attacker.hp = Math.min(attacker.maxHp, attacker.hp + GAME_CONSTANTS.Q_SKILL.HP_COST);
                            
                            // 브로드캐스트
                            broadcastToRoom(ws.roomId, {
                                event: 'qSkillHit',
                                attackerId: ws.playerId,
                                targetId: data.targetPlayerId,
                                damage: damage,
                                targetHp: target.hp,
                                slowDuration: GAME_CONSTANTS.Q_SKILL.SLOW_DURATION
                            });
                            
                            if (target.hp <= 0) {
                                target.hp = 0;
                                broadcastToRoom(ws.roomId, {
                                    event: 'playerDied',
                                    playerId: data.targetPlayerId,
                                    killerId: ws.playerId
                                });
                            }
                        }
                    }
                    break;

                case 'ghost':
                    // 유체화 스킬
                    if (ws.roomId && rooms[ws.roomId]) {
                        const player = rooms[ws.roomId].players.get(ws);
                        const now = Date.now();
                        
                        if (player && player.cooldowns.ghost <= now) {
                            player.isGhost = true;
                            player.ghostEndTime = now + GAME_CONSTANTS.GHOST_DURATION;
                            player.cooldowns.ghost = now + 15000; // 쿨타임 15초로 가정
                            
                            broadcastToRoom(ws.roomId, {
                                event: 'ghostActivated',
                                playerId: ws.playerId,
                                duration: GAME_CONSTANTS.GHOST_DURATION
                            }, ws);
                            
                            ws.send(JSON.stringify({
                                event: 'ghostConfirmed',
                                success: true,
                                endTime: player.ghostEndTime,
                                cooldownEnd: player.cooldowns.ghost
                            }));
                        }
                    }
                    break;

                case 'flash':
                    // 점멸 (순간이동)
                    if (ws.roomId && rooms[ws.roomId]) {
                        const player = rooms[ws.roomId].players.get(ws);
                        const now = Date.now();
                        
                        if (player && player.cooldowns.flash <= now) {
                            player.x = data.x;
                            player.y = data.y;
                            player.cooldowns.flash = now + 5000; // 쿨타임 5초로 가정
                            
                            broadcastToRoom(ws.roomId, {
                                event: 'playerFlashed',
                                playerId: ws.playerId,
                                x: data.x,
                                y: data.y
                            }, ws);
                            
                            ws.send(JSON.stringify({
                                event: 'flashConfirmed',
                                success: true,
                                x: data.x,
                                y: data.y,
                                cooldownEnd: player.cooldowns.flash
                            }));
                        }
                    }
                    break;

                case 'getState':
                    // 현재 상태 요청
                    if (ws.roomId && rooms[ws.roomId]) {
                        const player = rooms[ws.roomId].players.get(ws);
                        if (player) {
                            updatePlayerHP(player);
                            ws.send(JSON.stringify({
                                event: 'stateUpdate',
                                playerState: player
                            }));
                        }
                    }
                    break;

                case 'finish':
                    broadcastToRoom(ws.roomId, {
                        event: 'gameFinished',
                        winnerId: data.playerId
                    });
                    break;

                default:
                    console.log('Unknown event:', data.event);
            }
        });

        ws.on('close', () => {
            if (ws.roomId && rooms[ws.roomId]) {
                rooms[ws.roomId].players.delete(ws);
                broadcastToRoom(ws.roomId, {
                    event: 'playerLeft',
                    playerId: ws.playerId
                });
                
                // 방이 비었으면 삭제
                if (rooms[ws.roomId].players.size === 0) {
                    delete rooms[ws.roomId];
                }
            }
        });
    });

    return { wss };
}

module.exports = initWebSocket;