import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./WaitingRoom.css";

function WaitingRoom() {
    const { roomId } = useParams();
    const [roomInfo, setRoomInfo] = useState({ roomName: `방 #${roomId}` });
    const [playerCount, setPlayerCount] = useState(1);
    const [isHost, setIsHost] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);
    const [players, setPlayers] = useState([]); // 플레이어 목록
    const navigate = useNavigate();
    const wsRef = useRef(null);

    useEffect(() => {
        const userData = localStorage.getItem("user");
        if (!userData) {
            navigate("/Login");
            return;
        }

        const parsedUser = JSON.parse(userData);
        setCurrentUser(parsedUser);

        // WebSocket 연결
        connectWebSocket(parsedUser);

        // 방 정보 주기적으로 업데이트 (3초마다)
        const interval = setInterval(() => {
            fetchRoomInfo();
        }, 3000);

        // 처음 한 번 실행
        fetchRoomInfo();

        return () => {
            clearInterval(interval);
            // WebSocket 연결 해제
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [roomId, navigate]);

    const connectWebSocket = (user) => {
        // WebSocket URL (환경에 따라 자동 설정)
        const WS_URL = window.location.protocol === 'https:' 
            ? 'wss://dr-mundo.onrender.com'
            : 'ws://localhost:3000';

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('✅ WebSocket 연결 성공');
            
            // 인증
            ws.send(JSON.stringify({
                event: 'auth',
                token: user.data.token
            }));

            // 방 참가
            setTimeout(() => {
                ws.send(JSON.stringify({
                    event: 'join',
                    roomId: roomId
                }));
            }, 500);
        };

        ws.onmessage = (message) => {
            try {
                const data = JSON.parse(message.data);
                console.log('📩 WebSocket 메시지:', data);

                switch (data.event) {
                    case 'auth':
                        if (data.success) {
                            console.log('✅ 인증 성공');
                        }
                        break;

                    case 'joined':
                        console.log('✅ 방 참가 성공');
                        if (data.currentPlayers) {
                            setPlayers(data.currentPlayers);
                            setPlayerCount(data.currentPlayers.length);
                        }
                        break;

                    case 'playerJoined':
                        console.log('👥 새 플레이어 참가:', data.userId);
                        setPlayerCount(data.playerCount);
                        break;

                    case 'playerLeft':
                        console.log('👋 플레이어 퇴장:', data.userId);
                        setPlayerCount(data.playerCount);
                        break;

                    case 'gameStarted':
                        // ✅ 방장이 게임을 시작하면 모든 플레이어가 게임 페이지로 이동
                        console.log('🎮 게임 시작!');
                        alert('게임이 시작됩니다!');
                        navigate(`/game/${roomId}`);
                        break;

                    case 'error':
                        console.error('❌ 에러:', data.message);
                        alert(data.message);
                        break;

                    default:
                        console.log('알 수 없는 이벤트:', data.event);
                }
            } catch (error) {
                console.error('메시지 파싱 에러:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('❌ WebSocket 에러:', error);
        };

        ws.onclose = () => {
            console.log('🔌 WebSocket 연결 종료');
        };
    };

    const fetchRoomInfo = async () => {
        try {
            const userData = localStorage.getItem("user");
            if (!userData) return;

            const token = JSON.parse(userData).data.token;
            
            const response = await fetch("https://dr-mundo.onrender.com/dr-mundo/game/room", {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const rooms = data.data?.rooms || [];
                const currentRoom = rooms.find(room => room.roomId === parseInt(roomId));
                
                if (currentRoom) {
                    setPlayerCount(currentRoom.playerCnt);
                    console.log(`방 #${roomId} 현재 인원: ${currentRoom.playerCnt}/2`);
                } else {
                    console.log("방을 찾을 수 없습니다.");
                }
            }
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
            // ✅ WebSocket으로 게임 시작 요청
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    event: 'start',
                    roomId: roomId
                }));
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
            // WebSocket으로 방 나가기 알림
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    event: 'leave',
                    roomId: roomId
                }));
            }

            // API로도 방 나가기 (DB 업데이트용)
            const userData = localStorage.getItem("user");
            const token = JSON.parse(userData).data.token;

            await fetch(`https://dr-mundo.onrender.com/dr-mundo/game/room/leave/${roomId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            navigate("/roompage");
        } catch (error) {
            console.error("방 나가기 오류:", error);
            navigate("/roompage");
        }
    };

    // 플레이어 슬롯 생성
    const renderPlayerSlots = () => {
        const slots = [];
        for (let i = 0; i < 2; i++) {
            const isFilled = i < playerCount;
            slots.push(
                <div key={i} className={`player-slot ${isFilled ? 'filled' : 'empty'}`}>
                    {isFilled ? (
                        <>
                            <div className="player-avatar">👤</div>
                            <div className="player-name">
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
                    <span>인원: {playerCount}/2</span>
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
                        disabled={playerCount !== 2}
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
        </div>
    );
}

export default WaitingRoom;