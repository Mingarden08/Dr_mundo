import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./roompage.css";
import logo from "./assets/images/logo.png";

const BASE_URL = "https://dr-mundo.onrender.com/dr-mundo/game";

function RoomPage() {
    const [user, setUser] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [roomName, setRoomName] = useState("");
    const [rooms, setRooms] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const userData = localStorage.getItem("user");
        if (userData) {
            setUser(JSON.parse(userData));
        } else {
            navigate("/Login");
        }

        fetchRooms();
    }, [navigate]);

    const fetchRooms = async () => {
        try {
            const response = await fetch(`${BASE_URL}/room`, {
                headers: { "Authorization": `Bearer ${user?.data?.token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setRooms(data.data?.rooms || []);
            }
        } catch (error) {
            console.error("방 목록 가져오기 실패:", error);
        }
    };

    const handleCreateRoom = async () => {
        if (!roomName.trim()) return alert("방 이름을 입력해주세요.");
        try {
            const response = await fetch(`${BASE_URL}/room/create`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${user.data.token}`
                },
                body: JSON.stringify({ roomName }),
            });
            if (response.ok) {
                const data = await response.json();
                navigate(`/waiting/${data.data.roomId}`);
            } else {
                const err = await response.json();
                alert(err.message || "방 생성 실패");
            }
        } catch (error) {
            console.error("방 생성 오류:", error);
            alert("방 생성 중 오류 발생");
        }
    };

    const handleJoinRoom = async (roomId) => {
        try {
            const response = await fetch(`${BASE_URL}/room/join/${roomId}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${user.data.token}` }
            });
            if (response.ok) navigate(`/waiting/${roomId}`);
            else {
                const err = await response.json();
                alert(err.message || "방 입장 실패");
            }
        } catch (error) {
            console.error("방 입장 오류:", error);
            alert("방 입장 중 오류 발생");
        }
    };

    return (
        <div className="room-container">
            <div className="content-wrapper">
                <img src={logo} alt="logo" />
                <div className="user-info">접속 중: {user?.data?.email}</div>
                <button onClick={() => { localStorage.removeItem("user"); navigate("/Login"); }}>
                    로그아웃
                </button>
            </div>

            <div className="room-list">
                <p>방 목록</p>
                <hr />
                <div className="rooms-grid">
                    {rooms.length === 0 ? (
                        <div className="no-rooms">생성된 방이 없습니다.</div>
                    ) : rooms.map(room => (
                        <div key={room.roomId} className="room-item" onClick={() => handleJoinRoom(room.roomId)}>
                            <h3>{room.roomName || `방 #${room.roomId}`}</h3>
                            <span>{room.playerCnt}/2</span>
                            <span className={room.playerCnt < 2 ? "waiting" : "full"}>
                                {room.playerCnt < 2 ? "대기중" : "게임중"}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="room-event">
                <button onClick={() => setShowModal(true)}>방 만들기</button>
                <button onClick={fetchRooms}>새로고침</button>
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2>방 만들기</h2>
                        <input
                            type="text"
                            placeholder="방 이름 입력"
                            value={roomName}
                            onChange={e => setRoomName(e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && handleCreateRoom()}
                        />
                        <button onClick={handleCreateRoom}>생성</button>
                        <button onClick={() => setShowModal(false)}>취소</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RoomPage;
