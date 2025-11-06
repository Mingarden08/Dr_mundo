import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./WaitingRoom.css";

function WaitingRoom() {
    const { roomId } = useParams();
    const [roomInfo, setRoomInfo] = useState({ roomName: `방 #${roomId}` });
    const [playerCount, setPlayerCount] = useState(1);
    const [isHost, setIsHost] = useState(true);
    const [currentUser, setCurrentUser] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const userData = localStorage.getItem("user");
        if (!userData) {
            navigate("/Login");
            return;
        }

        const parsedUser = JSON.parse(userData);
        setCurrentUser(parsedUser);

        // 방 정보 주기적으로 업데이트 (3초마다)
        const interval = setInterval(() => {
            fetchRoomInfo();
        }, 3000);

        // 처음 한 번 실행
        fetchRoomInfo();

        return () => clearInterval(interval);
    }, [roomId, navigate]);

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
                    // 방이 목록에 없으면 게임이 시작되었거나 삭제됨
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
            const userData = localStorage.getItem("user");
            const token = JSON.parse(userData).data.token;

            const response = await fetch(`https://dr-mundo.onrender.com/dr-mundo/game/room/start/${roomId}`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (response.ok) {
                alert("게임이 시작됩니다!");
                navigate(`/game/${roomId}`);
            } else {
                alert("게임 시작에 실패했습니다.");
            }
        } catch (error) {
            console.error("게임 시작 오류:", error);
            alert("게임 시작 중 오류가 발생했습니다.");
        }
    };

    const handleLeaveRoom = async () => {
        try {
            const userData = localStorage.getItem("user");
            const token = JSON.parse(userData).data.token;

            const response = await fetch(`https://dr-mundo.onrender.com/dr-mundo/game/room/leave/${roomId}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (response.ok) {
                console.log("방에서 나갔습니다.");
            }

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