// src/WebSocketContext.jsx

import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';

// WebSocket 서버 주소 설정 (WaitingRoom.jsx에서 가져온 로직)
const WS_BASE_URL = 'dr-mundo.onrender.com';
const getWsUrl = (token) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 토큰을 쿼리 파라미터로 전달하여 서버에서 인증 및 연결 관리에 사용
    return `${protocol}//${WS_BASE_URL}?token=${token}`; 
};

const WebSocketContext = createContext(null);

// 사용자 정의 훅: 다른 컴포넌트에서 Context를 쉽게 사용하도록 합니다.
export const useWebSocket = () => useContext(WebSocketContext);

export const WebSocketProvider = ({ children }) => {
    const ws = useRef(null); 
    const [isConnected, setIsConnected] = useState(false);
    const [gameState, setGameState] = useState({ 
        currentPlayers: [],
        playerCount: 0,
        isGameStarted: false, // 게임 시작 여부
        // ... 여기에 쿨타임, 맵 상태 등이 GamePage에서 사용될 상태가 추가됩니다.
    });
    const [error, setError] = useState(null); 

    // 1. 메시지 전송 함수 (Context를 사용하는 모든 컴포넌트에서 호출 가능)
    const sendMessage = useCallback((data) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(data));
            return true;
        }
        console.warn("WebSocket 연결 끊김. 메시지 전송 실패:", data);
        return false;
    }, []);

    // 2. 연결 및 초기 메시지 전송 함수 (WaitingRoom에서 호출)
    const connect = useCallback((token, roomId) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            console.log("WebSocket이 이미 연결되어 있습니다. 바로 방 참가 요청.");
            sendMessage({ event: 'join', roomId }); // 이미 연결된 경우, 방 참가 메시지만 재전송
            return;
        }

        const url = getWsUrl(token);
        ws.current = new WebSocket(url);

        ws.current.onopen = () => {
            console.log('✅ WebSocket 연결 성공');
            setIsConnected(true);
            setError(null);
            
            // 1. 인증 메시지 전송
            sendMessage({ event: 'auth', token: token });

            // 2. 방 참가 메시지 전송
            setTimeout(() => { // 서버에서 인증 처리 시간을 벌기 위해 딜레이
                sendMessage({ event: 'join', roomId: roomId });
            }, 500); 
        };

        ws.current.onmessage = (message) => {
            try {
                const data = JSON.parse(message.data);

                switch (data.event) {
                    case 'joined':
                        // 방 참가 성공 시 플레이어 목록 및 인원 업데이트
                        setGameState(prev => ({ 
                            ...prev, 
                            currentPlayers: data.currentPlayers || [], 
                            playerCount: (data.currentPlayers || []).length 
                        }));
                        break;
                    case 'playerJoined':
                    case 'playerLeft':
                        // 다른 플레이어의 출입 알림
                        setGameState(prev => ({ 
                            ...prev, 
                            playerCount: data.playerCount,
                            // TODO: currentPlayers 업데이트 로직도 여기에 필요
                        }));
                        break;
                    case 'gameStarted':
                        // 🚨 방장으로부터 게임 시작 이벤트 수신 시 상태 업데이트
                        setGameState(prev => ({ ...prev, isGameStarted: true })); 
                        break;
                    case 'error':
                        setError(data.message);
                        break;
                    // ... 기타 게임 상태 업데이트 (GamePage에서 사용)
                }
            } catch (error) {
                console.error('메시지 파싱 에러 (Context):', error);
            }
        };

        ws.current.onerror = (error) => { setIsConnected(false); setError("연결 중 에러 발생."); };
        ws.current.onclose = () => { 
            console.log('🔌 WebSocket 연결 종료');
            setIsConnected(false);
            setGameState(prev => ({ ...prev, isGameStarted: false })); // 연결 종료 시 게임 상태 초기화
        };
    }, [sendMessage]);

    // 3. 연결 해제 함수
    const disconnect = useCallback(() => {
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }
    }, []);

    const contextValue = {
        isConnected,
        gameState,
        error,
        sendMessage,
        connect,
        disconnect,
    };

    return (
        <WebSocketContext.Provider value={contextValue}>
            {children}
        </WebSocketContext.Provider>
    );
};

// **참고: 이 Provider는 `src/App.js` 또는 라우터를 감싸는 최상위 컴포넌트에 한 번만 적용해야 합니다.**
// 예: <WebSocketProvider><Router>...</Router></WebSocketProvider>