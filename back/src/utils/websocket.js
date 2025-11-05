const WebSocket = require('ws');

function initWebSocket(server) {
    const wss = new WebSocket.Server({ server });
    const rooms = {}; // roomId: { players: Map, gameStarted: false, projectiles: [] }
    
    // 게임 상수
    const GAME_CONSTANTS = {
        BASE_HP: 705,
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

    // 플레이어 상태 초기화
    function createPlayerState(playerId) {
        return {
            playerId,
            x: 400,
            y: 300,
            targetX: 400,
            targetY: 300,
            hp: GAME_CONSTANTS.BASE_HP,
            maxHp: GAME_CONSTANTS.BASE_HP,
            moveSpeed: GAME_CONSTANTS.BASE_MOVE_SPEED,
            isGhost: false,
            ghostEndTime: 0,
            slowEndTime: 0,
            slowPercent: 0,
            isDead: false,
            cooldowns: {
                attack: 0,
                ghost: 0,
                flash: 0
            },
            lastUpdateTime: Date.now()
        };
    }

    // 투사체 생성
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

    // HP 자연 회복 및 상태 업데이트
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

    // 플레이어 위치 업데이트 (실제 이동 처리)
    function updatePlayerPosition(player, deltaTime) {
        if (player.isDead) return false;
        
        const dx = player.targetX - player.x;
        const dy = player.targetY - player.y;
        const distToTarget = Math.sqrt(dx * dx + dy * dy);
        
        // 목표 지점에 거의 도착했으면 정확한 위치로 설정
        if (distToTarget < 5) {
            if (player.x !== player.targetX || player.y !== player.targetY) {
                player.x = player.targetX;
                player.y = player.targetY;
                return true; // 위치 변경됨
            }
            return false;
        }
        
        // 현재 이동 속도 계산
        const currentSpeed = getCurrentMoveSpeed(player);
        const moveDistance = currentSpeed * deltaTime;
        
        // 이동할 거리가 남은 거리보다 크면 목표 지점으로 바로 이동
        if (moveDistance >= distToTarget) {
            player.x = player.targetX;
            player.y = player.targetY;
        } else {
            // 정규화된 방향으로 이동
            const ratio = moveDistance / distToTarget;
            player.x += dx * ratio;
            player.y += dy * ratio;
        }
        
        return true; // 위치 변경됨
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

    // 거리 계산
    function distance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }

    // 충돌 체크
    function checkCollision(projX, projY, playerX, playerY) {
        return distance(projX, projY, playerX, playerY) < GAME_CONSTANTS.Q_SKILL.PROJECTILE_RADIUS;
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

    // 투사체 업데이트 및 충돌 체크 (서버 권한)
    function updateProjectiles(roomId) {
        const room = rooms[roomId];
        if (!room || !room.projectiles) return;

        const now = Date.now();
        const toRemove = [];

        room.projectiles.forEach((proj, index) => {
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
            room.players.forEach((target, targetWs) => {
                if (target.playerId === proj.attackerId || target.isDead) return;
                
                if (checkCollision(proj.x, proj.y, target.x, target.y)) {
                    // 공격자 찾기
                    let attackerWs = null;
                    let attacker = null;
                    room.players.forEach((p, ws) => {
                        if (p.playerId === proj.attackerId) {
                            attackerWs = ws;
                            attacker = p;
                        }
                    });

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
                        
                        // 피격 판정 브로드캐스트 (서버 권한)
                        broadcastToRoom(roomId, {
                            event: 'hit',
                            x: target.x,
                            y: target.y,
                            hp: Math.max(0, target.hp)
                        });
                        
                        // 사망 체크
                        if (target.hp <= 0) {
                            target.hp = 0;
                            target.isDead = true;
                            
                            broadcastToRoom(roomId, {
                                event: 'finish',
                                playerId: proj.attackerId,
                                roomId: roomId
                            });
                        }
                    }
                    
                    toRemove.push(index);
                }
            });
        });

        // 제거할 투사체 삭제
        for (let i = toRemove.length - 1; i >= 0; i--) {
            room.projectiles.splice(toRemove[i], 1);
        }
    }

    // 주기적 쿨타임 브로드캐스트 및 위치 업데이트
    setInterval(() => {
        Object.keys(rooms).forEach(roomId => {
            if (!rooms[roomId].gameStarted) return;
            
            const now = Date.now();
            const positionUpdates = []; // 위치가 변경된 플레이어 추적
            
            rooms[roomId].players.forEach((player, ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    updatePlayerHP(player);
                    
                    // 플레이어 위치 업데이트
                    const moved = updatePlayerPosition(player, 0.05); // 50ms = 0.05초
                    if (moved) {
                        positionUpdates.push({
                            playerId: player.playerId,
                            x: player.x,
                            y: player.y
                        });
                    }
                    
                    ws.send(JSON.stringify({
                        event: 'coolTime',
                        attack: Math.max(0, Math.ceil((player.cooldowns.attack - now) / 1000)),
                        ghost: Math.max(0, Math.ceil((player.cooldowns.ghost - now) / 1000)),
                        flash: Math.max(0, Math.ceil((player.cooldowns.flash - now) / 1000))
                    }));
                }
            });
            
            // 위치 변경된 플레이어들 브로드캐스트
            if (positionUpdates.length > 0) {
                broadcastToRoom(roomId, {
                    event: 'positionUpdate',
                    players: positionUpdates
                });
            }
            
            // 투사체 업데이트
            updateProjectiles(roomId);
        });
    }, 50); // 20fps로 업데이트

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
                            gameStarted: false,
                            projectiles: []
                        };
                    }
                    
                    const playerState = createPlayerState(ws.playerId);
                    rooms[roomId].players.set(ws, playerState);
                    ws.roomId = roomId;
                    
                    ws.send(JSON.stringify({ 
                        event: 'joined',
                        success: true
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
                        
                        ws.send(JSON.stringify({ 
                            success: true 
                        }));
                        
                        ws.roomId = null;
                    }
                    break;

                case 'start':
                    if (ws.roomId && rooms[ws.roomId]) {
                        rooms[ws.roomId].gameStarted = true;
                        broadcastToRoom(ws.roomId, { 
                            event: 'gameStarted'
                        });
                        ws.send(JSON.stringify({ 
                            success: true 
                        }));
                    }
                    break;

                case 'move':
                    if (ws.roomId && rooms[ws.roomId]) {
                        const player = rooms[ws.roomId].players.get(ws);
                        if (player && !player.isDead) {
                            updatePlayerHP(player);
                            
                            // 목표 지점만 설정 (실제 이동은 서버 루프에서 처리)
                            player.targetX = data.x;
                            player.targetY = data.y;
                            
                            // 다른 플레이어들에게 이동 목표 알림
                            broadcastToRoom(ws.roomId, {
                                event: 'playerMoveTarget',
                                playerId: ws.playerId,
                                targetX: data.x,
                                targetY: data.y
                            }, ws);
                            
                            ws.send(JSON.stringify({ 
                                success: true
                            }));
                        }
                    }
                    break;

                case 'attack':
                    if (ws.roomId && rooms[ws.roomId]) {
                        const player = rooms[ws.roomId].players.get(ws);
                        const now = Date.now();
                        
                        if (player && !player.isDead && player.cooldowns.attack <= now) {
                            updatePlayerHP(player);
                            
                            // HP 소모
                            player.hp -= GAME_CONSTANTS.Q_SKILL.HP_COST;
                            
                            if (player.hp <= 0) {
                                player.hp = 0;
                                player.isDead = true;
                                broadcastToRoom(ws.roomId, {
                                    event: 'finish',
                                    playerId: 'suicide',
                                    roomId: ws.roomId
                                });
                                ws.send(JSON.stringify({ 
                                    x: player.x,
                                    y: player.y
                                }));
                                return;
                            }
                            
                            // 쿨타임 설정
                            player.cooldowns.attack = now + GAME_CONSTANTS.Q_SKILL.COOLDOWN;
                            
                            // 투사체 생성 (서버에서 관리)
                            const projectile = createProjectile(ws.playerId, player.x, player.y, data.x, data.y);
                            rooms[ws.roomId].projectiles.push(projectile);
                            
                            // 스킬 시전 알림
                            broadcastToRoom(ws.roomId, {
                                event: 'attackCast',
                                playerId: ws.playerId,
                                x: data.x,
                                y: data.y,
                                fromX: player.x,
                                fromY: player.y,
                                damage: data.damage || GAME_CONSTANTS.Q_SKILL.MIN_DAMAGE
                            }, ws);
                            
                            ws.send(JSON.stringify({ 
                                x: player.x,
                                y: player.y
                            }));
                        }
                    }
                    break;

                case 'ghost':
                    if (ws.roomId && rooms[ws.roomId]) {
                        const player = rooms[ws.roomId].players.get(ws);
                        const now = Date.now();
                        
                        if (player && !player.isDead && player.cooldowns.ghost <= now) {
                            player.isGhost = true;
                            player.ghostEndTime = now + GAME_CONSTANTS.GHOST_DURATION;
                            player.cooldowns.ghost = now + GAME_CONSTANTS.GHOST_COOLDOWN;
                            
                            const newSpeed = getCurrentMoveSpeed(player);
                            const timeInSeconds = Math.ceil(GAME_CONSTANTS.GHOST_DURATION / 1000);
                            
                            broadcastToRoom(ws.roomId, {
                                event: 'ghostActivated',
                                playerId: ws.playerId,
                                speed: newSpeed
                            }, ws);
                            
                            ws.send(JSON.stringify({
                                time: timeInSeconds,
                                speed: newSpeed
                            }));
                        }
                    }
                    break;

                case 'flash':
                    if (ws.roomId && rooms[ws.roomId]) {
                        const player = rooms[ws.roomId].players.get(ws);
                        const now = Date.now();
                        
                        if (player && !player.isDead && player.cooldowns.flash <= now) {
                            // 거리 검증
                            const dist = distance(player.x, player.y, data.x, data.y);
                            
                            if (dist >= GAME_CONSTANTS.FLASH_MIN_RANGE && dist <= GAME_CONSTANTS.FLASH_MAX_RANGE) {
                                player.x = data.x;
                                player.y = data.y;
                                player.cooldowns.flash = now + GAME_CONSTANTS.FLASH_COOLDOWN;
                                
                                broadcastToRoom(ws.roomId, {
                                    event: 'playerFlashed',
                                    playerId: ws.playerId,
                                    x: data.x,
                                    y: data.y
                                }, ws);
                                
                                ws.send(JSON.stringify({
                                    x: data.x,
                                    y: data.y
                                }));
                            }
                        }
                    }
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
                
                if (rooms[ws.roomId].players.size === 0) {
                    delete rooms[ws.roomId];
                }
            }
        });
    });

    return { wss };
}

module.exports = initWebSocket;