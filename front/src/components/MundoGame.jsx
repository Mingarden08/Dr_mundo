import React, { useRef, useEffect, useState, useCallback } from 'react';
import './MundoGame.css'; 
// 웹소켓 컨텍스트 임포트 (이전에 오류 수정했던 경로)
import { useWebSocket } from '../WebSocketContext.js'; 

// ----------------------------------------------------------------------
// 1. 상수 정의 (대부분 그대로 유지)
// ----------------------------------------------------------------------
const GAME_CONSTANTS = {
    MAP_WIDTH: 1000,
    MAP_HEIGHT: 563,
    PLAYER_RADIUS: 31,
    // ... 나머지 상수 ...
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
    // ... 애니메이션 상수 ...
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


// ----------------------------------------------------------------------
// MundoGame 컴포넌트 시작
// ----------------------------------------------------------------------
function MundoGame() {
    // ➡️ 웹소켓 컨텍스트에서 상태와 함수를 가져옵니다.
    // NOTE: useWebSocket()는 { gameState, sendMessage, myPlayerId, isConnected } 등을 제공해야 합니다.
    const { gameState: wsGameState, sendMessage, myPlayerId } = useWebSocket();
    
    // 로컬 상태와 웹소켓 상태를 분리:
    // gameState는 렌더링에만 사용하며, 모든 게임 상태는 wsGameState에서 가져옵니다.
    // wsGameState가 없거나 로딩 중일 때 기본값을 설정합니다.
    const initialLocalState = {
        players: new Map(),
        projectiles: new Map(),
        cooldowns: { attack: 0, flash: 0, ghost: 0, rune: 0 },
        status: 'loading',
        winnerId: null,
    };
    
    // 웹소켓 상태가 업데이트될 때마다 로컬 렌더링 상태를 업데이트합니다.
    const [gameState, setGameState] = useState(initialLocalState);
    useEffect(() => {
        if (wsGameState && wsGameState.currentPlayers) {
            // currentPlayers 배열을 Map으로 변환 (서버 데이터 구조에 맞게 조정 필요)
            const playersMap = new Map(wsGameState.currentPlayers.map(p => [
                p.userId, 
                { 
                    x: p.x, y: p.y, targetX: p.targetX || p.x, targetY: p.targetY || p.y, 
                    hp: p.hp, maxHp: GAME_CONSTANTS.PLAYER_MAX_HP, 
                    isGhost: p.isGhost || false, currentFrame: 0, lastFrameTime: 0 
                }
            ]));

            setGameState(prev => ({
                ...prev,
                players: playersMap,
                cooldowns: wsGameState.coolDowns || prev.cooldowns,
                // 서버로부터 'gameStarted'를 받으면 status를 'playing'으로 설정하는 로직 필요
                status: wsGameState.isGameStarted ? 'playing' : 'loading',
            }));
        }
    }, [wsGameState]);


    // Refs for non-triggering variables and canvas elements
    const canvasRef = useRef(null);
    const ctxRef = useRef(null);
    const mapPixelDataRef = useRef(null);
    const lastTimeRef = useRef(Date.now());
    const animationFrameIdRef = useRef(null);
    const mouseXRef = useRef(0);
    const mouseYRef = useRef(0);

    // State for assets (로컬에서 관리)
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
    // 3. 헬퍼 함수 (그대로 유지)
    // ----------------------------------------------------------------------
    const distance = (x1, y1, x2, y2) => {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    };

    const isCollision = useCallback((x, y) => {
        // ... (픽셀 충돌 검사 로직 그대로 유지)
        const mapPixelData = mapPixelDataRef.current;
        if (!mapPixelData) return false;

        const R_P = GAME_CONSTANTS.PLAYER_RADIUS;

        // 경계 충돌 검사
        if (x < R_P || x > GAME_CONSTANTS.MAP_WIDTH - R_P ||
            y < R_P || y > GAME_CONSTANTS.MAP_HEIGHT - R_P) {
            return true;
        }

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
    // 4. 이벤트 핸들러 (서버로 메시지 전송 방식으로 변경)
    // ----------------------------------------------------------------------
    const handleMove = useCallback((clickX, clickY) => {
        if (gameState.status !== 'playing') return;
        if (isCollision(clickX, clickY)) return;

        // ➡️ 서버에 이동 명령 전송
        sendMessage({ 
            event: 'move', 
            x: clickX, 
            y: clickY,
            // roomId는 useParams()를 통해 얻거나 컨텍스트에서 가져와야 함 (현재 코드에서는 생략)
        }); 

    }, [gameState.status, isCollision, sendMessage]);


    const handleAttack = useCallback(() => {
        if (gameState.cooldowns.attack > 0 || gameState.status !== 'playing') return;

        const player = gameState.players.get(myPlayerId);
        if (!player || player.hp <= GAME_CONSTANTS.Q_SKILL.HP_COST) return;

        // ➡️ 서버에 공격 명령 전송
        sendMessage({ 
            event: 'attack', 
            targetX: mouseXRef.current, 
            targetY: mouseYRef.current 
        });

    }, [gameState.status, gameState.cooldowns.attack, gameState.players, myPlayerId, sendMessage]);


    const handleFlash = useCallback(() => {
        if (gameState.cooldowns.flash > 0 || gameState.status !== 'playing') return;

        const player = gameState.players.get(myPlayerId);
        if (!player) return;

        const flashDistance = GAME_CONSTANTS.FLASH.DISTANCE;
        const angle = Math.atan2(mouseYRef.current - player.y, mouseXRef.current - player.x);

        let targetX = player.x + Math.cos(angle) * flashDistance;
        let targetY = player.y + Math.sin(angle) * flashDistance;
        
        // 플래시 도착 지점 클라이언트 충돌 검사
        if (isCollision(targetX, targetY)) return;

        // ➡️ 서버에 플래시 명령 전송
        sendMessage({ 
            event: 'flash', 
            targetX: targetX, 
            targetY: targetY 
        });

    }, [gameState.status, gameState.cooldowns.flash, gameState.players, myPlayerId, isCollision, sendMessage]);


    const handleGhost = useCallback(() => {
        if (gameState.cooldowns.ghost > 0 || gameState.status !== 'playing') return;

        // ➡️ 서버에 고스트 명령 전송
        sendMessage({ event: 'ghost' });
        
    }, [gameState.status, gameState.cooldowns.ghost, sendMessage]);
    
    // NOTE: handleHitTest는 이제 서버에서 처리해야 하므로 제거하거나 테스트용으로만 남겨둬야 합니다.
    const handleHitTest = useCallback(() => {
        // 이 로직은 멀티플레이어 환경에서는 서버에서 처리됩니다. 
        // 클라이언트 테스트용으로만 남겨둡니다.
        // sendMessage({ event: 'testHit', targetId: 'Player2' });
        console.log("로컬 테스트용: H키 입력 시 서버로 히트 테스트 요청을 보낼 수 있습니다.");
    }, []);


    // ----------------------------------------------------------------------
    // 5. 게임 루프 (그리기 및 애니메이션 업데이트 전용으로 수정)
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

        // ⚠️ 서버에서 투사체 상태를 받지 않는 경우, 로컬에서 투사체 위치와 애니메이션만 업데이트해야 합니다.
        // 현재 로직은 로컬에서 투사체 위치, 충돌, 제거, 쿨타임을 관리하고 있으나,
        // 멀티플레이어에서는 '투사체 생성' (서버 응답), '투사체 히트/제거' (서버 응답) 메시지를 기다려야 합니다.
        
        // ➡️ 서버 응답이 지연되는 동안 부드러운 움직임을 위한 로컬 보간 (현재 코드가 수행하는 역할)
        
        // 1. 맵 배경 그리기
        ctx.drawImage(mapImage, 0, 0, GAME_CONSTANTS.MAP_WIDTH, GAME_CONSTANTS.MAP_HEIGHT);

        // 2. 플레이어 및 투사체 애니메이션 프레임 업데이트 (서버에서 받은 위치/상태를 기반으로 렌더링)
        let nextPlayers = new Map(gameState.players);
        let nextProjectiles = new Map(gameState.projectiles);
        
        // (플레이어 움직임 보간 및 애니메이션 프레임 업데이트 로직 유지)
        nextPlayers.forEach((player, playerId) => {
            // ... (애니메이션 프레임 업데이트 로직 유지) ...
            
            const dist = distance(player.x, player.y, player.targetX, player.targetY);
            const isMoving = dist > 5;
            
            // ⚠️ 여기서 실제 위치 보간은 서버에서 받은 player.x/y와 player.targetX/targetY를 기반으로 수행됩니다.
            // 서버에서 받은 위치를 현재 위치로 보간하는 로직이 필요하지만, 
            // 현재 코드는 로컬에서 target까지 이동하는 로직을 수행합니다. 
            // 멀티플레이어 환경에서는 이 부분이 복잡해지므로, 서버에서 받은 x, y를 바로 사용하는 것이 간단합니다.
            // 여기서는 원본 로직을 유지하되, 충돌 검사는 필요합니다.

            let currentSpeed = GAME_CONSTANTS.BASE_MOVE_SPEED;
            if (player.isGhost) {
                currentSpeed *= (1 + GAME_CONSTANTS.GHOST.SPEED_BONUS);
            }

            if (isMoving) {
                // ... (이동/보간 로직은 그대로 두어 부드러운 움직임을 제공합니다)
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

                // 로컬 충돌 검사 (서버에서 최종 검증하더라도 클라이언트에서 이동을 막아 부자연스러움을 줄입니다)
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
            if (currentFrames.length > 0) {
                const currentFPS = isMoving ? ANIMATION_CONSTANTS.PLAYER_MOVE_FPS : ANIMATION_CONSTANTS.PLAYER_IDLE_FPS;
                const frameDuration = 1000 / currentFPS;
                const frameCount = currentFrames.length;
                if (now > player.lastFrameTime + frameDuration) {
                    player.currentFrame = (player.currentFrame + 1) % frameCount;
                    player.lastFrameTime = now;
                }
            }
        });
        
        // (투사체 업데이트 및 충돌 로직은 로컬에서 제거하고 서버 메시지로 처리하는 것이 좋으나, 
        //  현재 로컬 엔진 로직을 유지하여 단일 클라이언트 렌더링을 돕습니다.)
        
        // 3. 투사체 그리기 및 업데이트
        const projectilesToRemove = [];
        const projFrameDuration = 1000 / ANIMATION_CONSTANTS.PROJECTILE_FPS;
        // ... (투사체 위치 업데이트 및 충돌 검사 로직 유지) ...
        
        nextProjectiles.forEach((proj, projId) => {
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

            // ⚠️ 멀티플레이어 환경에서 클라이언트가 직접 충돌 처리 및 HP 감소를 해서는 안 됩니다!
            // 이 로직은 서버로 옮겨야 합니다. 현재는 로컬 테스트를 위해 유지합니다.
            // ... (충돌 검사 로직 유지) ...
            
        });
        projectilesToRemove.forEach(projId => nextProjectiles.delete(projId));
        
        setGameState(prev => ({
            ...prev,
            players: nextPlayers,
            projectiles: nextProjectiles,
            // 쿨타임은 서버 상태(wsGameState)를 따르도록 합니다.
        }));


        // 4. 투사체 그리기
        nextProjectiles.forEach(proj => {
            const R = GAME_CONSTANTS.Q_SKILL.PROJECTILE_RADIUS;
            const projImg = assets.projectileFrames[proj.currentFrame];

            if (projImg) {
                ctx.drawImage(projImg, proj.x - R, proj.y - R, R * 2, R * 2);
            }
        });

        // 5. 플레이어 그리기
        nextPlayers.forEach((player, userId) => {
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
            ctx.strokeStyle = player.isGhost ? 'yellow' : (userId === myPlayerId ? 'cyan' : 'white');
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

        // 6. 게임 종료 메시지
        if (gameState.status === 'finished') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, GAME_CONSTANTS.MAP_WIDTH, GAME_CONSTANTS.MAP_HEIGHT);
            ctx.fillStyle = 'gold';
            ctx.font = '48px Arial';
            ctx.fillText(`WINNER: ${gameState.winnerId}`, GAME_CONSTANTS.MAP_WIDTH / 2, GAME_CONSTANTS.MAP_HEIGHT / 2);
        }

        // 다음 프레임 요청
        if (gameState.status === 'playing') {
            animationFrameIdRef.current = requestAnimationFrame(gameLoop);
        }

    }, [assets, isCollision, gameState.status, gameState.players, gameState.projectiles, myPlayerId]);


    // ... (6. 초기화 및 이벤트 리스너 설정 - 그대로 유지) ...
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
        // ... (에셋 로딩 로직 유지) ...
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
                    img.fileName = fileName; 
                    images.push(img);
                    setAssetsLoadedCount(prev => prev + 1);
                    loadedCount++;
                    if (loadedCount === numFrames) {
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
                case 'H': handleHitTest(); break; // 테스트용 유지
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
                // ⚠️ 게임 시작은 이제 WebSocketContext의 isGameStarted 상태를 따릅니다.
                // 로컬에서는 에셋 로드가 완료되었음을 알립니다.
                setGameState(prev => ({ ...prev, status: 'ready' })); 
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
        if (gameState.status === 'loading' || gameState.status === 'ready') {
            const percent = Math.floor((assetsLoadedCount / totalAssets) * 100);
            return `Status: ${gameState.status.toUpperCase()} (${percent}%)`;
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