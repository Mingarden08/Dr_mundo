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
    
    // 💡 1. gameState 초기 상태 정의 시 cooldowns를 안전하게 초기화합니다.
    const [gameState, setGameState] = useState({ 
        currentPlayers: [],
        playerCount: 0,
        isGameStarted: false,
        // 🚨 TypeError를 방지하기 위해 빈 객체가 아닌 기본값으로 초기화합니다.
        cooldowns: { rune: 0, attack: 0, ghost: 0, flash: 0 } 
    });
    
    const [error, setError] = useState(null); 

    // 메시지 전송 함수
    const sendMessage = useCallback((data) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(data));
            return true;
        }
        console.warn("WebSocket 연결 끊김. 메시지 전송 실패:", data);
        return false;
    }, []);

    // 연결 및 초기 메시지 전송 함수
    const connect = useCallback((token, roomId) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            console.log("WebSocket이 이미 연결되어 있습니다. 바로 방 참가 요청.");
            sendMessage({ event: 'join', roomId });
            return;
        }

        const url = getWsUrl(token);
        ws.current = new WebSocket(url);

        ws.current.onopen = () => {
            console.log('✅ WebSocket 연결 성공');
            setIsConnected(true);
            setError(null);
            
            sendMessage({ event: 'auth', token: token });

            setTimeout(() => {
                sendMessage({ event: 'join', roomId: roomId });
            }, 500); 
        };

        ws.current.onmessage = (message) => {
            try {
                const data = JSON.parse(message.data);

                switch (data.event) {
                    case 'joined':
                        setGameState(prev => ({ 
                            ...prev, 
                            currentPlayers: data.currentPlayers || [], 
                            playerCount: (data.currentPlayers || []).length 
                        }));
                        break;
                    case 'playerJoined':
                    case 'playerLeft':
                        setGameState(prev => ({ 
                            ...prev, 
                            playerCount: data.playerCount,
                        }));
                        break;
                    
                    // 💡 2. 쿨타임 메시지 수신 시 gameState의 cooldowns만 업데이트합니다.
                    case 'coolTime':
                        setGameState(prev => ({ 
                            ...prev, 
                            cooldowns: {
                                rune: data.rune || 0,
                                attack: data.attack || 0,
                                ghost: data.ghost || 0,
                                flash: data.flash || 0
                            }
                        }));
                        break;
                        
                    case 'gameStarted':
                        setGameState(prev => ({ ...prev, isGameStarted: true })); 
                        break;
                    case 'error':
                        setError(data.message);
                        break;
                    default:
                        // 게임 상태 업데이트 (예: 플레이어 위치, HP 등)
                        if (data.event === 'gameStateUpdate' && data.state) {
                            setGameState(prev => ({ ...prev, ...data.state }));
                        }
                }
            } catch (error) {
                console.error('메시지 파싱 에러 (Context):', error);
            }
        };

        ws.current.onerror = (error) => { setIsConnected(false); setError("연결 중 에러 발생."); };
        ws.current.onclose = () => { 
            console.log('🔌 WebSocket 연결 종료');
            setIsConnected(false);
            setGameState(prev => ({ ...prev, isGameStarted: false }));
        };
    }, [sendMessage]);

    // 연결 해제 함수
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