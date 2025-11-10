// src/pages/GamePage.jsx (수정된 핵심 로직)
import React, { useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useWebSocket } from '../WebSocketContext'; // 🟢 Context 훅 임포트

// 롤처럼 플레이하려면 GamePage는 캔버스를 렌더링해야 합니다.
const GAME_CANVAS_WIDTH = 800;
const GAME_CANVAS_HEIGHT = 600;

function GamePage() {
    const { roomId } = useParams();
    // 🟢 Context에서 상태 및 함수 가져오기
    const { isConnected, gameState, cooldowns, sendMessage } = useWebSocket();
    const canvasRef = useRef(null);
    
    // 키 입력 처리 로직
    const handleKeyDown = useCallback((e) => {
        // WASD 또는 방향키를 눌렀을 때 서버에 이동 이벤트 전송
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            sendMessage({ event: 'move', direction: e.code });
        }
        // QWER 스킬 키 입력
        if (['KeyQ', 'KeyW', 'KeyE', 'KeyR'].includes(e.code)) {
            sendMessage({ event: 'skillCast', key: e.code.charAt(3) });
        }
    }, [sendMessage]);

    // 1. 게임 루프 및 캔버스 렌더링
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        const gameLoop = () => {
            if (gameState) {
                // 캔버스 초기화
                ctx.clearRect(0, 0, GAME_CANVAS_WIDTH, GAME_CANVAS_HEIGHT);

                // 지도 배경 그리기 (롤 지도처럼)
                ctx.fillStyle = '#1e3743';
                ctx.fillRect(0, 0, GAME_CANVAS_WIDTH, GAME_CANVAS_HEIGHT);
                
                // --- 플레이어 및 객체 렌더링 로직 ---
                
                // 예시: 모든 플레이어 그리기
                // gameState.players는 서버에서 받은 플레이어 목록이라고 가정
                if (gameState.players) {
                    gameState.players.forEach(player => {
                        ctx.beginPath();
                        ctx.arc(player.x, player.y, 20, 0, Math.PI * 2); // x, y 좌표
                        ctx.fillStyle = player.isMyPlayer ? 'yellow' : 'red';
                        ctx.fill();
                        
                        // HP 바 등 기타 정보 렌더링
                        ctx.fillStyle = 'white';
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
        };
    }, [isConnected, gameState]);


    // 2. 키보드 이벤트 리스너 추가 (플레이어 조작)
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        
        // 마우스 클릭 시 이동 명령 전송 (롤 방식)
        const handleCanvasClick = (e) => {
            const rect = canvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            sendMessage({ event: 'moveClick', x, y });
        };
        canvasRef.current.addEventListener('click', handleCanvasClick);
        
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            canvasRef.current.removeEventListener('click', handleCanvasClick);
        };
    }, [handleKeyDown, sendMessage]);


    // 3. 렌더링
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h1>게임 진행 중: {roomId}</h1>
            <p>연결 상태: {isConnected ? '🟢 연결됨' : '🔴 연결 끊김'}</p>
            
            {/* 롤 스타일 게임은 Canvas로 구현되어야 합니다. */}
            <canvas
                ref={canvasRef}
                width={GAME_CANVAS_WIDTH}
                height={GAME_CANVAS_HEIGHT}
                style={{ border: '2px solid #555', backgroundColor: '#333' }}
            />
            
            {/* 쿨타임 및 UI 표시 (Context의 cooldowns 사용) */}
            <div style={{ marginTop: '20px' }}>
                <h3>스킬 쿨타임</h3>
                <p>유체화(Ghost): {cooldowns.ghost}초 | 점멸(Flash): {cooldowns.flash}초</p>
                <button 
                    onClick={() => sendMessage({ event: 'skillCast', key: 'Ghost' })} 
                    disabled={cooldowns.ghost > 0}>
                    유체화 (D)
                </button>
                <button 
                    onClick={() => sendMessage({ event: 'skillCast', key: 'Flash' })} 
                    disabled={cooldowns.flash > 0}>
                    점멸 (F)
                </button>
            </div>
            
            {/* 수신 메시지 로그 등 (선택적) */}
            {/* ... */}
        </div>
    );
}

export default GamePage;