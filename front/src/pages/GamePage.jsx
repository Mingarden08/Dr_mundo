// src/pages/GamePage.jsx (WebSocket Context 사용 버전)

import React, { useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
// 🟢 Context API 훅 임포트
import { useWebSocket } from '../WebSocketContext'; 

// 캔버스 크기 (롤과 같은 2D 게임을 구현하기 위한 기반)
const GAME_CANVAS_WIDTH = 800;
const GAME_CANVAS_HEIGHT = 600;

function GamePage() {
    const { roomId } = useParams();
    const canvasRef = useRef(null);
    
    // 🟢 Context에서 필요한 상태 및 함수 가져오기
    // ContextProvider에서 cooldowns를 안전하게 기본값으로 내보낸다고 가정합니다.
    const { 
        isConnected, 
        gameState, 
        sendMessage 
        // cooldowns를 gameState에서 안전하게 꺼내 쓰거나, Context에서 직접 가져온다고 가정
    } = useWebSocket();

    // 💡 안전한 쿨타임 객체 접근
    // Context의 gameState에 coolTime 정보가 있다고 가정하고, 없을 경우 기본값으로 안전하게 초기화합니다.
    const cooldowns = gameState?.cooldowns || { rune: 0, attack: 0, ghost: 0, flash: 0 };


    // 1. 키 입력 처리 로직 (서버에 이동 및 스킬 명령 전송)
    const handleKeyDown = useCallback((e) => {
        // WASD 이동 키 입력
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
            sendMessage({ event: 'move', direction: e.code.charAt(3) });
        }
        // QWER 스킬 키 입력
        if (['KeyQ', 'KeyW', 'KeyE', 'KeyR'].includes(e.code)) {
            sendMessage({ event: 'skillCast', key: e.code.charAt(3) });
        }
    }, [sendMessage]); // sendMessage는 Context에서 왔으므로 안정적입니다.


    // 2. 게임 루프 및 캔버스 렌더링
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        const gameLoop = () => {
            // 게임 상태(gameState)가 업데이트될 때마다 화면을 다시 그립니다.
            if (gameState) {
                ctx.clearRect(0, 0, GAME_CANVAS_WIDTH, GAME_CANVAS_HEIGHT);
                
                // 맵 배경 그리기
                ctx.fillStyle = '#1e3743';
                ctx.fillRect(0, 0, GAME_CANVAS_WIDTH, GAME_CANVAS_HEIGHT);
                
                // --- 플레이어 렌더링 예시 ---
                // gameState.players는 서버에서 실시간으로 받는 플레이어 목록이라고 가정합니다.
                if (gameState.players) {
                    gameState.players.forEach(player => {
                        ctx.beginPath();
                        // player.x, player.y는 서버에서 받은 위치 정보입니다.
                        ctx.arc(player.x, player.y, 20, 0, Math.PI * 2); 
                        ctx.fillStyle = player.isMyPlayer ? 'yellow' : 'red';
                        ctx.fill();
                        
                        ctx.fillStyle = 'white';
                        ctx.font = '16px Arial';
                        ctx.fillText(player.name, player.x - 20, player.y - 30);
                    });
                }
            }
            animationFrameId = requestAnimationFrame(gameLoop);
        };

        if (isConnected) {
            gameLoop();
        }

        return () => {
            cancelAnimationFrame(animationFrameId);
            // 💡 주의: GamePage를 떠나도 WebSocket 연결은 Context에서 유지됩니다.
        };
    }, [isConnected, gameState]); // isConnected와 gameState가 바뀔 때마다 렌더링 루프 실행


    // 3. 키보드 및 마우스 이벤트 리스너 추가
    useEffect(() => {
        // 키보드 이벤트
        window.addEventListener('keydown', handleKeyDown);
        
        // 마우스 클릭 시 이동 명령 전송 (롤 방식)
        const canvas = canvasRef.current;
        const handleCanvasClick = (e) => {
            const rect = canvas.getBoundingClientRect();
            // 캔버스 내의 상대 좌표 계산
            const x = e.clientX - rect.left; 
            const y = e.clientY - rect.top;
            sendMessage({ event: 'moveClick', x, y });
        };
        canvas.addEventListener('click', handleCanvasClick);
        
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            canvas.removeEventListener('click', handleCanvasClick);
        };
    }, [handleKeyDown, sendMessage]);


    // 4. 스킬 사용 전송 함수 (기존 로직을 Context의 sendMessage로 대체)
    const sendSkill = (skillName) => {
        sendMessage({ event: 'skill', type: skillName });
    };

    // 5. 렌더링
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
            <h1>게임 진행 중: {roomId}</h1>
            <p>
                연결 상태: 
                <span style={{ color: isConnected ? 'green' : 'red', fontWeight: 'bold', marginLeft: '10px' }}>
                    {isConnected ? '🟢 WS 연결됨' : '🔴 WS 연결 끊김'}
                </span>
            </p>
            
            <canvas
                ref={canvasRef}
                width={GAME_CANVAS_WIDTH}
                height={GAME_CANVAS_HEIGHT}
                style={{ border: '2px solid #555', backgroundColor: '#333' }}
            />
            
            {/* 쿨타임 표시 (Context에서 안전하게 가져온 cooldowns 사용) */}
            <div style={{ marginTop: '20px', border: '1px solid #ccc', padding: '10px', width: '800px', textAlign: 'center' }}>
                <h3>스킬 쿨타임 (QWERD F)</h3>
                {/* 💡 안전하게 접근되므로 오류가 발생하지 않습니다. */}
                <p>룬: {cooldowns.rune.toFixed(1)}초 | 공격: {cooldowns.attack.toFixed(1)}초 | 유체화(Ghost): {cooldowns.ghost.toFixed(1)}초 | 점멸(Flash): {cooldowns.flash.toFixed(1)}초</p>
                
                <button 
                    onClick={() => sendSkill('ghost')} 
                    disabled={!isConnected || cooldowns.ghost > 0} 
                    style={{ marginRight: '10px' }}>
                    유체화 (D)
                </button>
                <button 
                    onClick={() => sendSkill('flash')} 
                    disabled={!isConnected || cooldowns.flash > 0}>
                    점멸 (F)
                </button>
            </div>
        </div>
    );
}

export default GamePage;