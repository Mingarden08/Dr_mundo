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
        
        Q_SKILL: {
            MIN_DAMAGE: 80,
            HP_PERCENT_DAMAGE: 0.20, // 20%
            SLOW_PERCENT: 0.40, // 40%
            SLOW_DURATION: 2000, // 2초
            HP_COST: 50,
            COOLDOWN: 3700, // 3.7초
            PROJECTILE_SPEED: 1200, // 투사체 속도
            PROJECTILE_RADIUS: 30 // 투사체 히트박스 반경
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

    // 거리 계산
    function distance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }

    // 투사체와 플레이어 충돌 검사
    function checkProjectileHit(projectile, player) {
        if (projectile.ownerId === player.playerId) return false; // 자기 자신은 맞지 않음
        
        const dist = distance(projectile.x, projectile.y, player.x, player.y);
        return dist <= GAME_CONSTANTS.Q_SKILL.PROJECTILE_RADIUS + 20; // 플레이어 반경 추가
    }

    // 투사체 업데이트 및 충돌 검사
    function updateProjectiles(roomId) {
        if (!rooms[roomId]) return;
        
        const room = rooms[roomId];
        const now = Date.now();
        
        room.projectiles = room.projectiles.filter(proj => {
            const elapsed = now - proj.startTime;
            const maxDistance = 1000; // 최대 사거리
            const travelDistance = (GAME_CONSTANTS.Q_SKILL.PROJECTILE_SPEED * elapsed) / 1000;
            
            // 최대 거리 도달 시 제거
            if (travelDistance >= maxDistance) {
                return false;
            }
            
            // 현재 위치 계산
            const progress = travelDistance / distance(proj.startX, proj.startY, proj.targetX, proj.targetY);
            proj.x = proj.startX + (proj.targetX - proj.startX) * progress;
            proj.y = proj.startY + (proj.targetY - proj.startY) * progress;
            
            // 충돌 검사
            for (const [ws, player] of room.players) {
                if (checkProjectileHit(proj, player)) {
                    // 공격자 찾기
                    const attackerWs = Array.from(room.players.keys())
                        .find(socket => socket.playerId === proj.ownerId);
                    
                    if (attackerWs) {
                        const attacker = room.players.get(attackerWs);
                        
                        // 데미지 계산
                        const damage = Math.max(
                            GAME_CONSTANTS.Q_SKILL.MIN_DAMAGE,
                            attacker.hp * GAME_CONSTANTS.Q_SKILL.HP_PERCENT_DAMAGE
                        );
                        
                        player.hp -= damage;
                        
                        // 둔화 적용
                        player.slowPercent = GAME_CONSTANTS.Q_SKILL.SLOW_PERCENT;
                        player.slowEndTime = now + GAME_CONSTANTS.Q_SKILL.SLOW_DURATION;
                        
                        // HP 회복 (맞춘 플레이어)
                        attacker.hp = Math.min(attacker.maxHp, attacker.hp + GAME_CONSTANTS.Q_SKILL.HP_COST);
                        
                        // 피격 알림
                        broadcastToRoom(roomId, {
                            event: 'hit',
                            attackerId: proj.ownerId,
                            targetId: player.playerId,
                            x: player.x,
                            y: player.y,
                            hp: Math.max(0, player.hp),
                            damage: damage
                        });
                        
                        // 사망 체크
                        if (player.hp <= 0) {
                            player.hp = 0;
                            broadcastToRoom(roomId, {
                                event: 'finish',
                                playerId: proj.ownerId,
                                roomId: roomId
                            });
                        }
                        
                        return false; // 투사체 제거
                    }
                }
            }
            
            return true; // 투사체 유지
        });
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

    // 게임 루프 (투사체 업데이트)
    setInterval(() => {
        Object.keys(rooms).forEach(roomId => {
            if (rooms[roomId].gameStarted) {
                updateProjectiles(roomId);
            }
        });
    }, 16); // 약 60 FPS

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
                        
                        ws.send(JSON.stringify({ 
                            event: 'left',
                            success: true 
                        }));
                        
                        ws.roomId = null;
                    }
                    break;

                case 'start':
                    if (ws.roomId && rooms[ws.roomId]) {
                        rooms[ws.roomId].gameStarted = true;
                        broadcastToRoom(ws.roomId, { 
                            event: 'gameStarted',
                            success: true
                        });
                        ws.send(JSON.stringify({ 
                            event: 'started',
                            success: true 
                        }));
                    }
                    break;

                case 'move':
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
                                success: true
                            }));
                        }
                    }
                    break;

                case 'attack':
                    // Q 스킬 사용
                    if (ws.roomId && rooms[ws.roomId]) {
                        const player = rooms[ws.roomId].players.get(ws);
                        const now = Date.now();
                        
                        if (player && player.cooldowns.q <= now && player.hp > GAME_CONSTANTS.Q_SKILL.HP_COST) {
                            updatePlayerHP(player);
                            
                            // HP 소모
                            player.hp -= GAME_CONSTANTS.Q_SKILL.HP_COST;
                            
                            // 쿨타임 설정
                            player.cooldowns.q = now + GAME_CONSTANTS.Q_SKILL.COOLDOWN;
                            
                            // 투사체 생성
                            const projectile = {
                                id: `proj_${now}_${Math.random()}`,
                                ownerId: ws.playerId,
                                startX: player.x,
                                startY: player.y,
                                targetX: data.x,
                                targetY: data.y,
                                x: player.x,
                                y: player.y,
                                startTime: now
                            };
                            
                            rooms[ws.roomId].projectiles.push(projectile);
                            
                            // 모든 플레이어에게 스킬 발사 알림
                            broadcastToRoom(ws.roomId, {
                                event: 'attackCast',
                                playerId: ws.playerId,
                                x: data.x,
                                y: data.y,
                                fromX: player.x,
                                fromY: player.y,
                                projectileId: projectile.id
                            });
                            
                            ws.send(JSON.stringify({ 
                                event: 'attackConfirmed',
                                x: data.x,
                                y: data.y
                            }));
                        } else {
                            ws.send(JSON.stringify({ 
                                event: 'attackConfirmed',
                                success: false,
                                reason: player.cooldowns.q > now ? 'cooldown' : 'insufficient_hp'
                            }));
                        }
                    }
                    break;

                case 'coolTime':
                    // 쿨타임 조회
                    if (ws.roomId && rooms[ws.roomId]) {
                        const player = rooms[ws.roomId].players.get(ws);
                        if (player) {
                            const now = Date.now();
                            ws.send(JSON.stringify({
                                event: 'coolTime',
                                rune: 0, // 룬 스킬이 있다면 추가
                                attack: Math.max(0, Math.ceil((player.cooldowns.q - now) / 1000)),
                                ghost: Math.max(0, Math.ceil((player.cooldowns.ghost - now) / 1000)),
                                flash: Math.max(0, Math.ceil((player.cooldowns.flash - now) / 1000))
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
                            player.cooldowns.flash = now + GAME_CONSTANTS.FLASH_COOLDOWN;
                            
                            broadcastToRoom(ws.roomId, {
                                event: 'playerFlashed',
                                playerId: ws.playerId,
                                x: data.x,
                                y: data.y
                            }, ws);
                            
                            ws.send(JSON.stringify({
                                event: 'flashConfirmed',
                                x: data.x,
                                y: data.y
                            }));
                        } else {
                            ws.send(JSON.stringify({
                                event: 'flashConfirmed',
                                success: false,
                                reason: 'cooldown'
                            }));
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
                            player.cooldowns.ghost = now + GAME_CONSTANTS.GHOST_COOLDOWN;
                            
                            const newSpeed = Math.round(GAME_CONSTANTS.BASE_MOVE_SPEED * (1 + GAME_CONSTANTS.GHOST_SPEED_BONUS));
                            
                            broadcastToRoom(ws.roomId, {
                                event: 'ghostActivated',
                                playerId: ws.playerId,
                                duration: GAME_CONSTANTS.GHOST_DURATION,
                                speed: newSpeed
                            }, ws);
                            
                            ws.send(JSON.stringify({
                                event: 'ghostConfirmed',
                                time: Math.ceil(GAME_CONSTANTS.GHOST_DURATION / 1000),
                                speed: newSpeed
                            }));
                        } else {
                            ws.send(JSON.stringify({
                                event: 'ghostConfirmed',
                                success: false,
                                reason: 'cooldown'
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