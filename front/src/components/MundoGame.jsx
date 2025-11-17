import React, { useRef, useEffect, useState, useCallback } from 'react';
import './MundoGame.css'; // 별도 CSS 파일로 스타일 분리

// ----------------------------------------------------------------------
// 1. 상수 정의
// ----------------------------------------------------------------------
const GAME_CONSTANTS = {
    MAP_WIDTH: 1000,
    MAP_HEIGHT: 563,
    PLAYER_RADIUS: 31,
    PLAYER_MAX_HP: 1000,
    BASE_MOVE_SPEED: 355,
    Q_SKILL: {
        PROJECTILE_RADIUS: 37,
        PROJECTILE_SPEED: 1200,
        HP_COST: 50,
        COOLDOWN: 3.7
    },
    FLASH: {
        COOLDOWN: 5,
        DISTANCE: 300
    },
    GHOST: {
        COOLDOWN: 15,
        DURATION: 10000,
        SPEED_BONUS: 0.24
    },
    COLLISION_R_THRESHOLD: 150,
    COLLISION_GB_THRESHOLD: 120
};

const ANIMATION_CONSTANTS = {
    PLAYER_IDLE_FRAMES: 2,
    PLAYER_IDLE_FPS: 8,
    PLAYER_MOVE_FRAMES: 4,
    PLAYER_MOVE_FPS: 12,
    PROJECTILE_FRAMES: 4,
    PROJECTILE_FPS: 15,

    PLAYER_IDLE_PATH: 'idle_',
    PLAYER_MOVE_PATH: 'move_',
    PROJECTILE_PATH: 'proj_'
};

const myPlayerId = 'Player1';
const INITIAL_Y = GAME_CONSTANTS.MAP_HEIGHT / 2;

const initialGameState = {
    players: new Map([
        [myPlayerId, { x: 250, y: INITIAL_Y, targetX: 250, targetY: INITIAL_Y, hp: 1000, maxHp: 1000, isGhost: false, currentFrame: 0, lastFrameTime: 0 }],
        ['Player2', { x: 750, y: INITIAL_Y, targetX: 750, targetY: INITIAL_Y, hp: 1000, maxHp: 1000, isGhost: false, currentFrame: 0, lastFrameTime: 0 }]
    ]),
    projectiles: new Map(),
    cooldowns: { attack: 0, flash: 0, ghost: 0, rune: 0 },
    status: 'loading',
    winnerId: null,
};

// ----------------------------------------------------------------------
// MundoGame 컴포넌트 시작
// ----------------------------------------------------------------------
function MundoGame() {
    // Refs for non-triggering variables and canvas elements
    const canvasRef = useRef(null);
    const ctxRef = useRef(null);
    const mapPixelDataRef = useRef(null);
    const lastTimeRef = useRef(Date.now());
    const animationFrameIdRef = useRef(null);
    const mouseXRef = useRef(0);
    const mouseYRef = useRef(0);

    // State for HUD and assets
    const [gameState, setGameState] = useState(initialGameState);
    const [assets, setAssets] = useState({
        mapImage: null,
        playerIdleFrames: [],
        playerMoveFrames: [],
        projectileFrames: [],
    });
    const [assetsLoadedCount, setAssetsLoadedCount] = useState(0);
    const totalAssets = 1 + ANIMATION_CONSTANTS.PLAYER_IDLE_FRAMES +
        ANIMATION_CONSTANTS.PLAYER_MOVE_FRAMES +
        ANIMATION_CONSTANTS.PROJECTILE_FRAMES;

    // ----------------------------------------------------------------------
    // 3. 헬퍼 함수
    // ----------------------------------------------------------------------
    const distance = (x1, y1, x2, y2) => {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    };

    const isCollision = useCallback((x, y) => {
        const mapPixelData = mapPixelDataRef.current;
        if (!mapPixelData) return false;

        const R_P = GAME_CONSTANTS.PLAYER_RADIUS;

        // 경계 충돌 검사
        if (x < R_P || x > GAME_CONSTANTS.MAP_WIDTH - R_P ||
            y < R_P || y > GAME_CONSTANTS.MAP_HEIGHT - R_P) {
            return true;
        }

        // 픽셀 검사 샘플 포인트
        const samplePoints = [
            { sx: x, sy: y }, { sx: x + R_P * 0.9, sy: y }, { sx: x - R_P * 0.9, sy: y },
            { sx: x, sy: y + R_P * 0.9 }, { sx: x, sy: y - R_P * 0.9 }, { sx: x + R_P * 0.6, sy: y + R_P * 0.6 },
            { sx: x - R_P * 0.6, sy: y - R_P * 0.6 }, { sx: x + R_P * 0.6, sy: y - R_P * 0.6 }, { sx: x - R_P * 0.6, sy: y + R_P * 0.6 }
        ];

        for (const point of samplePoints) {
            const px = Math.floor(point.sx);
            const py = Math.floor(point.sy);

            if (px < 0 || px >= GAME_CONSTANTS.MAP_WIDTH || py < 0 || py >= GAME_CONSTANTS.MAP_HEIGHT) continue;

            const dataIndex = (py * GAME_CONSTANTS.MAP_WIDTH + px) * 4;

            if (dataIndex + 2 >= mapPixelData.length) continue;

            const R_value = mapPixelData[dataIndex];
            const G_value = mapPixelData[dataIndex + 1];
            const B_value = mapPixelData[dataIndex + 2];

            if (R_value > GAME_CONSTANTS.COLLISION_R_THRESHOLD &&
                G_value < GAME_CONSTANTS.COLLISION_GB_THRESHOLD &&
                B_value < GAME_CONSTANTS.COLLISION_GB_THRESHOLD) {
                return true;
            }
        }
        return false;
    }, []);

    // ----------------------------------------------------------------------
    // 4. 이벤트 핸들러
    // ----------------------------------------------------------------------
    const handleMove = useCallback((clickX, clickY) => {
        setGameState(prev => {
            if (prev.status !== 'playing') return prev;
            if (isCollision(clickX, clickY)) return prev;

            const newPlayers = new Map(prev.players);
            const myPlayer = newPlayers.get(myPlayerId);
            const otherPlayer = newPlayers.get('Player2');

            if (myPlayer) {
                myPlayer.targetX = Math.min(Math.max(clickX, GAME_CONSTANTS.PLAYER_RADIUS), GAME_CONSTANTS.MAP_WIDTH - GAME_CONSTANTS.PLAYER_RADIUS);
                myPlayer.targetY = Math.min(Math.max(clickY, GAME_CONSTANTS.PLAYER_RADIUS), GAME_CONSTANTS.MAP_HEIGHT - GAME_CONSTANTS.PLAYER_RADIUS);
            }

            // Player2는 무작위 이동
            if (otherPlayer) {
                otherPlayer.targetX = Math.random() * GAME_CONSTANTS.MAP_WIDTH;
                otherPlayer.targetY = Math.random() * GAME_CONSTANTS.MAP_HEIGHT;
            }

            return { ...prev, players: newPlayers };
        });
    }, [isCollision]);


    const handleAttack = useCallback(() => {
        const targetX = mouseXRef.current;
        const targetY = mouseYRef.current;

        setGameState(prev => {
            if (prev.cooldowns.attack > 0 || prev.status !== 'playing') return prev;

            const newPlayers = new Map(prev.players);
            const player = newPlayers.get(myPlayerId);
            if (!player || player.hp <= GAME_CONSTANTS.Q_SKILL.HP_COST) return prev;

            // HP 소모 및 쿨타임 설정
            player.hp = Math.max(0, player.hp - GAME_CONSTANTS.Q_SKILL.HP_COST);
            const newCooldowns = { ...prev.cooldowns, attack: GAME_CONSTANTS.Q_SKILL.COOLDOWN };

            // 투사체 생성
            const tempProjId = `proj_${Date.now()}_${Math.random()}`;
            const newProjectiles = new Map(prev.projectiles);
            newProjectiles.set(tempProjId, {
                id: tempProjId, attackerId: myPlayerId,
                x: player.x, y: player.y, targetX: targetX, targetY: targetY,
                startTime: Date.now(),
                angle: Math.atan2(targetY - player.y, targetX - player.x),
                currentFrame: 0, lastFrameTime: 0
            });

            return { ...prev, players: newPlayers, projectiles: newProjectiles, cooldowns: newCooldowns };
        });
    }, []);


    const handleFlash = useCallback(() => {
        setGameState(prev => {
            if (prev.cooldowns.flash > 0 || prev.status !== 'playing') return prev;

            const newPlayers = new Map(prev.players);
            const player = newPlayers.get(myPlayerId);
            if (!player) return prev;

            const flashDistance = GAME_CONSTANTS.FLASH.DISTANCE;
            const angle = Math.atan2(mouseYRef.current - player.y, mouseXRef.current - player.x);

            let targetX = player.x + Math.cos(angle) * flashDistance;
            let targetY = player.y + Math.sin(angle) * flashDistance;

            if (isCollision(targetX, targetY)) return prev;

            targetX = Math.min(Math.max(targetX, GAME_CONSTANTS.PLAYER_RADIUS), GAME_CONSTANTS.MAP_WIDTH - GAME_CONSTANTS.PLAYER_RADIUS);
            targetY = Math.min(Math.max(targetY, GAME_CONSTANTS.PLAYER_RADIUS), GAME_CONSTANTS.MAP_HEIGHT - GAME_CONSTANTS.PLAYER_RADIUS);

            // 위치 업데이트
            player.x = targetX;
            player.y = targetY;
            player.targetX = targetX;
            player.targetY = targetY;

            // 쿨타임 설정
            const newCooldowns = { ...prev.cooldowns, flash: GAME_CONSTANTS.FLASH.COOLDOWN };

            return { ...prev, players: newPlayers, cooldowns: newCooldowns };
        });
    }, [isCollision]);


    const handleGhost = useCallback(() => {
        setGameState(prev => {
            if (prev.cooldowns.ghost > 0 || prev.status !== 'playing') return prev;

            const newPlayers = new Map(prev.players);
            const player = newPlayers.get(myPlayerId);
            if (!player) return prev;

            player.isGhost = true;
            const newCooldowns = { ...prev.cooldowns, ghost: GAME_CONSTANTS.GHOST.COOLDOWN };

            // 고스트 지속 시간 후 상태 해제
            setTimeout(() => {
                setGameState(current => {
                    const nextPlayers = new Map(current.players);
                    const nextPlayer = nextPlayers.get(myPlayerId);
                    if (nextPlayer) nextPlayer.isGhost = false;
                    return { ...current, players: nextPlayers };
                });
            }, GAME_CONSTANTS.GHOST.DURATION);

            return { ...prev, players: newPlayers, cooldowns: newCooldowns };
        });
    }, []);


    const handleHitTest = useCallback(() => {
        setGameState(prev => {
            if (prev.status !== 'playing') return prev;

            const newPlayers = new Map(prev.players);
            const targetPlayer = newPlayers.get('Player2');
            if (!targetPlayer) return prev;

            const damage = 100;
            targetPlayer.hp = Math.max(0, targetPlayer.hp - damage);

            let nextStatus = prev.status;
            let winnerId = prev.winnerId;

            if (targetPlayer.hp <= 0) {
                nextStatus = 'finished';
                winnerId = myPlayerId;
                if (animationFrameIdRef.current) {
                    cancelAnimationFrame(animationFrameIdRef.current);
                }
            }

            return { ...prev, players: newPlayers, status: nextStatus, winnerId: winnerId };
        });
    }, []);

    // ----------------------------------------------------------------------
    // 5. 게임 루프
    // ----------------------------------------------------------------------
    const gameLoop = useCallback(() => {
        const now = Date.now();
        const deltaTime = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;
        const ctx = ctxRef.current;
        const mapImage = assets.mapImage;

        if (!ctx || !mapImage || gameState.status !== 'playing') {
            if (gameState.status === 'playing') {
                 animationFrameIdRef.current = requestAnimationFrame(gameLoop);
            }
            return;
        }

        // 상태 업데이트 로직 (setState 대신 직접 상태를 변경하고 최종적으로 한 번만 setState)
        let nextGameState = { ...gameState };
        let newPlayers = new Map(nextGameState.players);
        let newProjectiles = new Map(nextGameState.projectiles);
        let newCooldowns = { ...nextGameState.cooldowns };

        // 1. 쿨타임 업데이트
        Object.keys(newCooldowns).forEach(key => {
            if (newCooldowns[key] > 0) {
                const newValue = Math.max(0, newCooldowns[key] - deltaTime);
                newCooldowns[key] = parseFloat(newValue.toFixed(3));
            }
        });
        nextGameState.cooldowns = newCooldowns;

        // 2. 맵 배경 그리기
        ctx.drawImage(mapImage, 0, 0, GAME_CONSTANTS.MAP_WIDTH, GAME_CONSTANTS.MAP_HEIGHT);

        // 3. 플레이어 위치 보간 및 애니메이션 프레임 업데이트
        newPlayers.forEach((player, playerId) => {
            let currentSpeed = GAME_CONSTANTS.BASE_MOVE_SPEED;
            if (player.isGhost) {
                currentSpeed *= (1 + GAME_CONSTANTS.GHOST.SPEED_BONUS);
            }

            const dist = distance(player.x, player.y, player.targetX, player.targetY);
            const isMoving = dist > 5;

            if (isMoving) {
                const dx = player.targetX - player.x;
                const dy = player.targetY - player.y;
                const moveDistance = currentSpeed * deltaTime;

                let nextX = player.x;
                let nextY = player.y;

                if (moveDistance >= dist) {
                    nextX = player.targetX;
                    nextY = player.targetY;
                } else {
                    const ratio = moveDistance / dist;
                    nextX += dx * ratio;
                    nextY += dy * ratio;
                }

                if (!isCollision(nextX, nextY)) {
                    player.x = nextX;
                    player.y = nextY;
                } else {
                    player.targetX = player.x;
                    player.targetY = player.y;
                }
            }

            // 3.1 플레이어 애니메이션 프레임 업데이트 로직
            const currentFrames = isMoving ? assets.playerMoveFrames : assets.playerIdleFrames;
            if (currentFrames.length === 0) return;

            const currentFPS = isMoving ? ANIMATION_CONSTANTS.PLAYER_MOVE_FPS : ANIMATION_CONSTANTS.PLAYER_IDLE_FPS;
            const frameDuration = 1000 / currentFPS;
            const frameCount = currentFrames.length;

            if (now > player.lastFrameTime + frameDuration) {
                player.currentFrame = (player.currentFrame + 1) % frameCount;
                player.lastFrameTime = now;
            }
        });

        // 4. 투사체 위치 업데이트 및 애니메이션 프레임 업데이트
        const projectilesToRemove = [];
        const projFrameDuration = 1000 / ANIMATION_CONSTANTS.PROJECTILE_FPS;

        newProjectiles.forEach((proj, projId) => {
            // 위치 업데이트 로직
            const vx = Math.cos(proj.angle) * GAME_CONSTANTS.Q_SKILL.PROJECTILE_SPEED;
            const vy = Math.sin(proj.angle) * GAME_CONSTANTS.Q_SKILL.PROJECTILE_SPEED;
            proj.x += vx * deltaTime;
            proj.y += vy * deltaTime;

            // 프레임 업데이트 로직
            if (assets.projectileFrames.length > 0 && now > proj.lastFrameTime + projFrameDuration) {
                proj.currentFrame = (proj.currentFrame + 1) % assets.projectileFrames.length;
                proj.lastFrameTime = now;
            }

            // 경계 이탈 검사
            if (proj.x < -100 || proj.x > GAME_CONSTANTS.MAP_WIDTH + 100 || proj.y < -100 || proj.y > GAME_CONSTANTS.MAP_HEIGHT + 100) {
                projectilesToRemove.push(projId);
            }

            // 충돌 검사 (Player2만 검사)
            const targetPlayer = newPlayers.get('Player2');
            if (targetPlayer && proj.attackerId === myPlayerId) {
                const projR = GAME_CONSTANTS.Q_SKILL.PROJECTILE_RADIUS;
                const playerR = GAME_CONSTANTS.PLAYER_RADIUS;
                if (distance(proj.x, proj.y, targetPlayer.x, targetPlayer.y) < projR + playerR) {
                    targetPlayer.hp = Math.max(0, targetPlayer.hp - 150); // 투사체 기본 피해량
                    projectilesToRemove.push(projId); // 충돌한 투사체 제거

                    if (targetPlayer.hp <= 0) {
                        nextGameState.status = 'finished';
                        nextGameState.winnerId = myPlayerId;
                        if (animationFrameIdRef.current) {
                            cancelAnimationFrame(animationFrameIdRef.current);
                        }
                    }
                }
            }
        });
        projectilesToRemove.forEach(projId => newProjectiles.delete(projId));

        nextGameState.players = newPlayers;
        nextGameState.projectiles = newProjectiles;


        // 5. 투사체 그리기
        newProjectiles.forEach(proj => {
            const R = GAME_CONSTANTS.Q_SKILL.PROJECTILE_RADIUS;
            const projImg = assets.projectileFrames[proj.currentFrame];

            if (projImg) {
                ctx.drawImage(projImg, proj.x - R, proj.y - R, R * 2, R * 2);
            }
        });

        // 6. 플레이어 그리기
        newPlayers.forEach((player, userId) => {
            const isMoving = distance(player.x, player.y, player.targetX, player.targetY) > 5;
            const currentFrames = isMoving ? assets.playerMoveFrames : assets.playerIdleFrames;

            const R = GAME_CONSTANTS.PLAYER_RADIUS;
            const playerImg = currentFrames[player.currentFrame];

            if (playerImg) {
                ctx.drawImage(playerImg, player.x - R, player.y - R, R * 2, R * 2);
            }

            // 고스트 상태 표시 (테두리)
            ctx.beginPath();
            ctx.arc(player.x, player.y, R, 0, Math.PI * 2);
            ctx.strokeStyle = player.isGhost ? 'yellow' : 'white';
            ctx.lineWidth = player.isGhost ? 5 : 2;
            ctx.stroke();

            // HP 바 및 상태 표시
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.fillText(userId, player.x, player.y - GAME_CONSTANTS.PLAYER_RADIUS - 10);

            const hpWidth = GAME_CONSTANTS.PLAYER_RADIUS * 2;
            const currentHpWidth = (player.hp / player.maxHp) * hpWidth;
            const barY = player.y + GAME_CONSTANTS.PLAYER_RADIUS + 5;

            ctx.fillStyle = 'red';
            ctx.fillRect(player.x - GAME_CONSTANTS.PLAYER_RADIUS, barY, hpWidth, 5);
            ctx.fillStyle = 'lime';
            ctx.fillRect(player.x - GAME_CONSTANTS.PLAYER_RADIUS, barY, currentHpWidth, 5);
        });

        // 7. 게임 종료 메시지
        if (nextGameState.status === 'finished') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, GAME_CONSTANTS.MAP_WIDTH, GAME_CONSTANTS.MAP_HEIGHT);
            ctx.fillStyle = 'gold';
            ctx.font = '48px Arial';
            ctx.fillText(`WINNER: ${nextGameState.winnerId}`, GAME_CONSTANTS.MAP_WIDTH / 2, GAME_CONSTANTS.MAP_HEIGHT / 2);
        }

        // 게임 상태를 한 번 업데이트
        setGameState(nextGameState);

        // 다음 프레임 요청
        if (nextGameState.status === 'playing') {
            animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        }

    }, [assets, isCollision, gameState.status]);


    // ----------------------------------------------------------------------
    // 6. 초기화 및 이벤트 리스너 설정
    // ----------------------------------------------------------------------

    const getCorrectedMousePos = useCallback((event) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = GAME_CONSTANTS.MAP_WIDTH / rect.width;
        const scaleY = GAME_CONSTANTS.MAP_HEIGHT / rect.height;
        const correctedX = (event.clientX - rect.left) * scaleX;
        const correctedY = (event.clientY - rect.top) * scaleY;
        return { x: correctedX, y: correctedY };
    }, []);


    // 비동기 에셋 로딩 함수
    const loadAnimationFrames = useCallback((pathPrefix, numFrames, assetKey) => {
        return new Promise((resolve, reject) => {
            let loadedCount = 0;
            if (numFrames === 0) {
                resolve([]);
                return;
            }

            const images = [];
            for (let i = 0; i < numFrames; i++) {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                const fileName = `${pathPrefix}${i}.jpg`;
                img.onload = () => {
                    img.fileName = fileName; // 정렬을 위해 파일명 저장
                    images.push(img);
                    setAssetsLoadedCount(prev => prev + 1);
                    loadedCount++;
                    if (loadedCount === numFrames) {
                        // 파일명에서 인덱스를 추출하여 순서대로 정렬 (필수)
                        images.sort((a, b) => {
                            const indexA = parseInt(a.fileName.match(/(\d+)\.(jpeg|png|jpg)/i)[1]);
                            const indexB = parseInt(b.fileName.match(/(\d+)\.(jpeg|png|jpg)/i)[1]);
                            return indexA - indexB;
                        });
                        setAssets(prev => ({ ...prev, [assetKey]: images }));
                        resolve(images);
                    }
                };
                img.onerror = () => {
                    console.error(`Failed to load asset: ${fileName}`);
                    setAssetsLoadedCount(prev => prev + 1);
                    loadedCount++;
                    if (loadedCount === numFrames) resolve(images);
                };
                img.src = fileName;
            }
        });
    }, []);

    // 캔버스 이벤트 핸들러 설정
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleMouseMove = (event) => {
            const pos = getCorrectedMousePos(event);
            mouseXRef.current = pos.x;
            mouseYRef.current = pos.y;
        };

        const handleMouseDown = (event) => {
            if (event.button === 2) { // 마우스 오른쪽 버튼
                const pos = getCorrectedMousePos(event);
                handleMove(pos.x, pos.y);
            }
        };

        const handleContextMenu = (e) => {
            e.preventDefault();
        };

        const handleKeyDown = (event) => {
            switch (event.key.toUpperCase()) {
                case 'Q': handleAttack(); break;
                case 'F': handleFlash(); break;
                case 'G': handleGhost(); break;
                case 'H': handleHitTest(); break;
                default: break;
            }
        };

        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('contextmenu', handleContextMenu);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [getCorrectedMousePos, handleMove, handleAttack, handleFlash, handleGhost, handleHitTest]);


    // 초기화 함수 (에셋 로딩 및 게임 루프 시작)
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctxRef.current = ctx;

        // 1. 맵 이미지 로드
        const mapImage = new Image();
        mapImage.crossOrigin = 'Anonymous';
        const mapPromise = new Promise((resolve, reject) => {
            mapImage.onload = () => {
                setAssetsLoadedCount(prev => prev + 1);
                setAssets(prev => ({ ...prev, mapImage: mapImage }));
                resolve(mapImage);
            };
            mapImage.onerror = () => {
                console.error("맵 이미지 로드 실패: 'ingame.jpg' 파일을 확인하세요.");
                setGameState(prev => ({ ...prev, status: 'Error: Map Image Fail! (ingame.jpg)' }));
                reject(new Error("Map load failed"));
            };
            mapImage.src = 'ingame.jpg';
        });

        // 2. 모든 에셋 로드
        const initGame = async () => {
            try {
                const loadedMapImage = await mapPromise;
                await Promise.all([
                    loadAnimationFrames(ANIMATION_CONSTANTS.PLAYER_IDLE_PATH, ANIMATION_CONSTANTS.PLAYER_IDLE_FRAMES, 'playerIdleFrames'),
                    loadAnimationFrames(ANIMATION_CONSTANTS.PLAYER_MOVE_PATH, ANIMATION_CONSTANTS.PLAYER_MOVE_FRAMES, 'playerMoveFrames'),
                    loadAnimationFrames(ANIMATION_CONSTANTS.PROJECTILE_PATH, ANIMATION_CONSTANTS.PROJECTILE_FRAMES, 'projectileFrames'),
                ]);

                // 3. 픽셀 데이터 추출
                ctx.drawImage(loadedMapImage, 0, 0, GAME_CONSTANTS.MAP_WIDTH, GAME_CONSTANTS.MAP_HEIGHT);
                mapPixelDataRef.current = ctx.getImageData(0, 0, GAME_CONSTANTS.MAP_WIDTH, GAME_CONSTANTS.MAP_HEIGHT).data;

                // 4. 게임 시작
                setGameState(prev => ({ ...prev, status: 'playing' }));
                lastTimeRef.current = Date.now();
                animationFrameIdRef.current = requestAnimationFrame(gameLoop);

            } catch (e) {
                console.error("에셋 로드 중 치명적인 오류 발생. 게임 시작 불가:", e);
                setGameState(prev => ({ ...prev, status: 'Error: Asset Load Failed. Check Console.' }));
            }
        };

        initGame();

        // 컴포넌트 언마운트 시 정리
        return () => {
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
            }
        };
    }, [loadAnimationFrames, gameLoop]); // 의존성 배열에 gameLoop 추가 (useCallback으로 메모이제이션)


    // ----------------------------------------------------------------------
    // 7. 렌더링
    // ----------------------------------------------------------------------

    const getStatusText = () => {
        if (gameState.status === 'loading') {
            const percent = Math.floor((assetsLoadedCount / totalAssets) * 100);
            return `Status: LOADING... (${percent}%)`;
        } else if (gameState.status === 'finished') {
            return `WINNER: ${gameState.winnerId}`;
        } else if (gameState.status.startsWith('Error:')) {
            return gameState.status;
        } else {
            return 'Status: PLAYING';
        }
    };


    return (
        <div className="game-container">
            <canvas
                id="gameCanvas"
                ref={canvasRef}
                width={GAME_CONSTANTS.MAP_WIDTH}
                height={GAME_CONSTANTS.MAP_HEIGHT}
                onContextMenu={(e) => e.preventDefault()}
            />

            <div id="game-hud">
                <div className="hud-row">
                    <div id="game-status">{getStatusText()}</div>
                    <div />
                </div>

                <div className="hud-row">
                    <div className="cooldown-item">
                        <span className="cooldown-key">Q (Attack)</span>
                        <span className="cooldown-time" id="cooldown-attack">
                            {gameState.cooldowns.attack.toFixed(1)}s
                        </span>
                    </div>
                    <div className="cooldown-item">
                        <span className="cooldown-key">F (Flash)</span>
                        <span className="cooldown-time" id="cooldown-flash">
                            {gameState.cooldowns.flash.toFixed(1)}s
                        </span>
                    </div>
                    <div className="cooldown-item">
                        <span className="cooldown-key">G (Ghost)</span>
                        <span className="cooldown-time" id="cooldown-ghost">
                            {gameState.cooldowns.ghost.toFixed(1)}s
                        </span>
                    </div>
                    <div className="cooldown-item">
                        <span className="cooldown-key">H (Hit Test)</span>
                        <span className="cooldown-time">TEST</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default MundoGame;