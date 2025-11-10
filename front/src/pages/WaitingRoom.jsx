// src/pages/WaitingRoom.jsx (디버깅 및 개선 버전)

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./WaitingRoom.css";
import { useWebSocket } from '../WebSocketContext';

function WaitingRoom() {
    const { roomId } = useParams();
    const [roomInfo, setRoomInfo] = useState({ roomName: `방 #${roomId}` });
    const [isHost, setIsHost] = useState(true); // TODO: 서버에서 받아와야 함
    const [currentUser, setCurrentUser] = useState(null);

    const navigate = useNavigate();

    // Context에서 필요한 값과 함수 가져오기
    const { isConnected, gameState, sendMessage, connect, disconnect, error } = useWebSocket();
    const { playerCount, isGameStarted, currentPlayers } = gameState;

    // 초기 연결 및 설정
    useEffect(() => {
        console.log("=== WaitingRoom 컴포넌트 마운트 ===");
        
        const userData = localStorage.getItem("user");
        if (!userData) {
            console.log("❌ 사용자 정보 없음 - 로그인 페이지로 이동");
            navigate("/Login");
            return;
        }

        const parsedUser = JSON.parse(userData);
        console.log("✅ 사용자 정보:", parsedUser);
        setCurrentUser(parsedUser);
        
        // WebSocket 연결 시도
        console.log("🔌 WebSocket 연결 시도 - roomId:", roomId);
        connect(parsedUser.data.token, roomId);

        // HTTP 폴링으로 방 정보 가져오기 (백업용)
        const interval = setInterval(() => {
            fetchRoomInfo(parsedUser.data.token);
        }, 3000);

        // 최초 방 정보 가져오기
        fetchRoomInfo(parsedUser.data.token);

        return () => {
            console.log("🔄 WaitingRoom 컴포넌트 언마운트");
            clearInterval(interval);
        };
    }, [roomId, navigate, connect]);

    // WebSocket 연결 상태 모니터링
    useEffect(() => {
        console.log("📊 상태 업데이트:", {
            isConnected,
            playerCount,
            isGameStarted,
            currentPlayers,
            error
        });
    }, [isConnected, playerCount, isGameStarted, currentPlayers, error]);

    // 게임 시작 상태 감지 및 페이지 이동
    useEffect(() => {
        if (isGameStarted) {
            console.log('🎮 게임 시작 이벤트 수신! 페이지 이동.');
            alert('게임이 시작됩니다!');
            navigate(`/game/${roomId}`);
        }
    }, [isGameStarted, navigate, roomId]);

    // HTTP API로 방 정보 가져오기 (폴링)
    const fetchRoomInfo = async (token) => {
        try {
            console.log("🔍 방 정보 조회 시작 - roomId:", roomId);
            
            const response = await fetch(`http://localhost:8080/api/rooms/${roomId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log("✅ 방 정보 조회 성공:", data);
                
                setRoomInfo({
                    roomName: data.roomName || `방 #${roomId}`,
                    ...data
                });
                
                // 방장 여부 설정 (서버 응답에 isHost 필드가 있다면)
                if (data.hostId && currentUser?.data?.id) {
                    setIsHost(data.hostId === currentUser.data.id);
                }
            } else {
                console.error("❌ 방 정보 조회 실패 - 상태 코드:", response.status);
            }
        } catch (error) {
            console.error("❌ 방 정보 조회 중 에러:", error);
        }
    };

    // 게임 시작
    const handleStartGame = async () => {
        console.log("🎮 게임 시작 버튼 클릭");
        
        if (!isHost) {
            console.log("⚠️ 방장이 아니므로 게임 시작 불가");
            alert("방장만 게임을 시작할 수 있습니다.");
            return;
        }

        if (playerCount !== 2) {
            console.log("⚠️ 인원 부족 - 현재:", playerCount);
            alert("2명이 모두 입장해야 게임을 시작할 수 있습니다.");
            return;
        }

        if (!isConnected) {
            console.log("⚠️ WebSocket 연결 끊김");
            alert("WebSocket 연결이 끊겼습니다. 새로고침 해주세요.");
            return;
        }

        try {
            console.log("📤 게임 시작 메시지 전송");
            const success = sendMessage({ 
                event: 'start', 
                roomId: roomId 
            });
            
            if (success) {
                console.log("✅ 게임 시작 메시지 전송 성공 - 서버 응답 대기 중...");
            } else {
                console.log("❌ 게임 시작 메시지 전송 실패");
                alert("메시지 전송에 실패했습니다. 다시 시도해주세요.");
            }
        } catch (error) {
            console.error("❌ 게임 시작 중 에러:", error);
            alert("게임 시작 중 오류가 발생했습니다.");
        }
    };

    // 방 나가기
    const handleLeaveRoom = async () => {
        console.log("🚪 방 나가기 시작");
        
        try {
            // WebSocket으로 방 나가기 알림
            if (isConnected) {
                console.log("📤 leave 메시지 전송");
                sendMessage({ event: 'leave', roomId: roomId });
            }

            // API로 방 나가기 (DB 업데이트)
            const userData = localStorage.getItem("user");
            if (userData) {
                const parsedUser = JSON.parse(userData);
                console.log("🔄 API 방 나가기 요청");
                
                await fetch(`http://localhost:8080/api/rooms/${roomId}/leave`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${parsedUser.data.token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }

            // WebSocket 연결 해제
            console.log("🔌 WebSocket 연결 해제");
            disconnect();

            console.log("✅ 방 나가기 완료 - 방 목록으로 이동");
            navigate("/roompage");
        } catch (error) {
            console.error("❌ 방 나가기 중 에러:", error);
            navigate("/roompage");
        }
    };

    // 플레이어 슬롯 렌더링
    const renderPlayerSlots = () => {
        const slots = [];
        const totalSlots = 2;
        
        console.log("🎨 플레이어 슬롯 렌더링 - playerCount:", playerCount, "currentPlayers:", currentPlayers);
        
        for (let i = 0; i < totalSlots; i++) {
            const isFilled = i < playerCount;
            let playerName = "대기 중...";
            let isHostSlot = false;
            
            if (isFilled) {
                if (currentPlayers && currentPlayers.length > i) {
                    // Context에서 실제 플레이어 정보 사용
                    playerName = currentPlayers[i].nickName || currentPlayers[i].name || `플레이어 ${i + 1}`;
                    isHostSlot = currentPlayers[i].isHost || false;
                } else {
                    // 플레이어 정보가 없으면 기본값 사용
                    if (i === 0 && currentUser) {
                        playerName = currentUser.data?.nickName || "방장";
                        isHostSlot = isHost;
                    } else {
                        playerName = `플레이어 ${i + 1}`;
                    }
                }
            }
            
            slots.push(
                <div key={i} className={`player-slot ${isFilled ? 'filled' : 'empty'}`}>
                    {isFilled ? (
                        <>
                            <div className="player-avatar">👤</div>
                            <div className="player-name">{playerName}</div>
                            {isHostSlot && <div className="host-badge">방장</div>}
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
                    <span>인원: {playerCount}/2</span>
                    <span style={{ 
                        color: isConnected ? 'green' : 'red', 
                        marginLeft: '10px', 
                        fontWeight: 'bold' 
                    }}>
                        {isConnected ? '🟢 WS 연결됨' : '🔴 WS 연결 끊김'}
                    </span>
                </div>
            </div>

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
            
            {/* 디버깅 정보 표시 */}
            {error && (
                <div style={{ 
                    color: 'red', 
                    marginTop: '20px', 
                    padding: '10px', 
                    border: '1px solid red',
                    borderRadius: '5px',
                    backgroundColor: '#fee'
                }}>
                    ⚠️ WebSocket 에러: {error}
                </div>
            )}
            
            {/* 개발 모드 디버그 패널 */}
            {process.env.NODE_ENV === 'development' && (
                <div style={{
                    marginTop: '20px',
                    padding: '15px',
                    backgroundColor: '#f0f0f0',
                    borderRadius: '5px',
                    fontSize: '12px'
                }}>
                    <h3>🔧 디버그 정보</h3>
                    <div><strong>연결 상태:</strong> {isConnected ? '✅' : '❌'}</div>
                    <div><strong>플레이어 수:</strong> {playerCount}</div>
                    <div><strong>게임 시작:</strong> {isGameStarted ? '✅' : '❌'}</div>
                    <div><strong>현재 플레이어:</strong> {JSON.stringify(currentPlayers)}</div>
                    <div><strong>방장 여부:</strong> {isHost ? '✅' : '❌'}</div>
                    <div><strong>에러:</strong> {error || '없음'}</div>
                </div>
            )}
        </div>
    );
}

export default WaitingRoom;