// src/pages/WaitingRoom.jsx (수정된 코드)

import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./WaitingRoom.css";
// 🟢 1. Context API 훅 임포트
import { useWebSocket } from '../WebSocketContext'; 

function WaitingRoom() {
    const { roomId } = useParams();
    const [roomInfo, setRoomInfo] = useState({ roomName: `방 #${roomId}` });
    // const [playerCount, setPlayerCount] = useState(1); // 🔴 Context에서 관리
    const [isHost, setIsHost] = useState(true); // TODO: 서버에서 받아와야 함
    const [currentUser, setCurrentUser] = useState(null);
    // const wsRef = useRef(null); // 🔴 제거: Context가 WebSocket 객체를 관리

    const navigate = useNavigate();

    // 🟢 2. Context에서 필요한 값과 함수 가져오기
    const { isConnected, gameState, sendMessage, connect, disconnect, error } = useWebSocket();
    const { playerCount, isGameStarted, currentPlayers } = gameState; // Context의 gameState에서 값 추출

    // 🟢 3. WebSocket 연결 및 페이지 이동 로직 통합
    useEffect(() => {
        const userData = localStorage.getItem("user");
        if (!userData) {
            navigate("/Login");
            return;
        }

        const parsedUser = JSON.parse(userData);
        setCurrentUser(parsedUser);
        
        // 🟢 Context의 connect 함수를 사용하여 연결 시작
        // connect 함수 내부에서 'auth'와 'join' 메시지까지 처리됩니다.
        connect(parsedUser.data.token, roomId); 

        // 🔴 기존의 HTTP 폴링은 그대로 유지 (WebSocket이 아닌 API로 방 인원을 확인하던 로직)
        const interval = setInterval(() => {
            fetchRoomInfo(parsedUser.data.token);
        }, 3000);

        fetchRoomInfo(parsedUser.data.token);

        return () => {
            clearInterval(interval);
            // 페이지를 떠나도 게임 페이지로 이동할 예정이므로, WS 연결은 끊지 않습니다.
            // 'handleLeaveRoom'에서만 연결을 명시적으로 끊습니다.
        };
    }, [roomId, navigate, connect]); // connect 함수를 의존성 배열에 포함

    // 🟢 4. 게임 시작 상태 변화 감지 및 페이지 이동 (Context의 상태를 감시)
    useEffect(() => {
        if (isGameStarted) {
            console.log('🎮 게임 시작 이벤트 수신! 페이지 이동.');
            alert('게임이 시작됩니다!'); // 기존 alert 유지
            navigate(`/game/${roomId}`);
        }
    }, [isGameStarted, navigate, roomId]);


    // 🔴 connectWebSocket 함수 제거 (Context로 이동됨)
    // const connectWebSocket = (user) => { ... } 

    // HTTP 폴링 함수는 그대로 유지
    const fetchRoomInfo = async (token) => {
        try {
            // ... (기존 fetchRoomInfo 로직은 생략)
            // 주의: 이 함수는 playerCount를 설정하지 않도록 수정해야 합니다. 
            //       playerCount는 이제 WebSocket을 통해 Context에서 업데이트 됩니다.
            // ...
        } catch (error) {
            console.error("방 정보 조회 실패:", error);
        }
    };

    const handleStartGame = async () => {
        if (!isHost) {
            alert("방장만 게임을 시작할 수 있습니다.");
            return;
        }

        if (playerCount !== 2) {
            alert("2명이 모두 입장해야 게임을 시작할 수 있습니다.");
            return;
        }

        try {
            // 🟢 WebSocket으로 게임 시작 요청 (Context의 sendMessage 함수 사용)
            if (sendMessage({ event: 'start', roomId: roomId })) {
                console.log("게임 시작 메시지 전송됨. 서버 응답 대기 중...");
                // navigate는 Context에서 isGameStarted 상태를 받은 후 useEffect에서 처리됩니다.
            } else {
                alert("WebSocket 연결이 끊겼습니다. 새로고침 해주세요.");
            }
        } catch (error) {
            console.error("게임 시작 오류:", error);
            alert("게임 시작 중 오류가 발생했습니다.");
        }
    };

    const handleLeaveRoom = async () => {
        try {
            // 🟢 WebSocket으로 방 나가기 알림 (Context의 sendMessage 함수 사용)
            sendMessage({ event: 'leave', roomId: roomId });

            // API로도 방 나가기 (DB 업데이트용)
            // ... (기존 API DELETE 요청 로직은 생략)

            // 🟢 방을 완전히 떠났으므로 Context 연결 해제
            disconnect(); 

            navigate("/roompage");
        } catch (error) {
            console.error("방 나가기 오류:", error);
            navigate("/roompage");
        }
    };

    // 플레이어 슬롯 생성 (Context의 playerCount와 currentPlayers 사용)
    const renderPlayerSlots = () => {
        const slots = [];
        const totalSlots = 2; 
        
        for (let i = 0; i < totalSlots; i++) {
            const isFilled = i < playerCount; 
            
            // TODO: currentPlayers 배열을 사용하여 실제 플레이어 정보를 표시하도록 개선 필요
            // 현재는 인원 수(playerCount)와 현재 사용자 정보만으로 임시 표시합니다.
            
            slots.push(
                <div key={i} className={`player-slot ${isFilled ? 'filled' : 'empty'}`}>
                    {isFilled ? (
                        <>
                            <div className="player-avatar">👤</div>
                            <div className="player-name">
                                {/* 현재 로그인된 사용자 닉네임을 사용하고, 나머지는 '플레이어 2'로 표시 */}
                                {i === 0 ? (currentUser?.data?.nickName || "방장") : "플레이어 2"}
                            </div>
                            {i === 0 && <div className="host-badge">방장</div>}
                        </>
                    ) : (
                        <div className="empty-slot">대기 중...</div>
                    )}
                </div>
            );
        }
        return slots;
    };

    return (
        <div className="waiting-container">
            <div className="waiting-header">
                <h1>{roomInfo.roomName}</h1>
                <div className="room-status">
                    <span>방 ID: {roomId}</span>
                    {/* 🟢 Context의 playerCount 사용 */}
                    <span>인원: {playerCount}/2</span>
                    {/* 🟢 WS 연결 상태 표시 추가 */}
                    <span style={{ color: isConnected ? 'green' : 'red', marginLeft: '10px', fontWeight: 'bold' }}>
                        {isConnected ? 'WS 연결됨' : 'WS 연결 끊김'}
                    </span>
                </div>
            </div>

            {/* ... (players-section, players-grid 등 나머지 JSX는 기존과 동일) */}
            <div className="players-section">
                <h2>참가자 목록</h2>
                <div className="players-grid">
                    {renderPlayerSlots()}
                </div>
            </div>

            <div className="waiting-controls">
                <button className="leave-button" onClick={handleLeaveRoom}>
                    나가기
                </button>
                {isHost && (
                    <button 
                        className="start-button" 
                        onClick={handleStartGame}
                        // 🟢 WS 연결 상태를 확인하여 비활성화 조건에 추가
                        disabled={playerCount !== 2 || !isConnected}
                    >
                        게임 시작 ({playerCount}/2)
                    </button>
                )}
                {!isHost && (
                    <div className="waiting-message">
                        방장이 게임을 시작하기를 기다리는 중...
                    </div>
                )}
            </div>
            {error && <div style={{ color: 'red', marginTop: '20px' }}>WebSocket 에러: {error}</div>}
        </div>
    );
}

export default WaitingRoom;