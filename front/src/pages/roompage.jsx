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
        if (!userData) return navigate("/Login");

        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);

        // 로그인 직후 바로 토큰 사용
        const token = parsedUser.data?.token || parsedUser.token;
        if (!token) return console.error("토큰 정보 없음");
        fetchRooms(token);
    }, [navigate]);

    const fetchRooms = async (token) => {
        if (!token) return;
        try {
            const response = await fetch(`${BASE_URL}/room`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("방 목록 가져오기 실패");
            const data = await response.json();
            setRooms(data.data?.rooms || []);
        } catch (error) {
            console.error(error);
            alert("방 목록을 불러오는 중 오류가 발생했습니다.");
        }
    };

    const handleCreateRoom = async () => {
        if (!roomName.trim()) return alert("방 이름을 입력해주세요.");
        if (!user?.data?.token && !user?.token) return alert("로그인 정보가 없습니다.");

        const token = user.data?.token || user.token;

        try {
            const response = await fetch(`${BASE_URL}/room/create`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ roomName }),
            });
            if (!response.ok) {
                const err = await response.json();
                return alert(err.message || "방 생성 실패");
            }
            const data = await response.json();
            navigate(`/waiting/${data.data.roomId}`);
        } catch (error) {
            console.error(error);
            alert("방 생성 중 오류가 발생했습니다.");
        }
    };

    const handleJoinRoom = async (roomId) => {
        if (!user?.data?.token && !user?.token) return alert("로그인 정보가 없습니다.");
        const token = user.data?.token || user.token;

        try {
            // 1️⃣ 방 정보 확인
            const roomRes = await fetch(`${BASE_URL}/room/${roomId}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!roomRes.ok) throw new Error("방 정보 조회 실패");
            const roomData = await roomRes.json();
            if (!roomData.data) return alert("방 정보를 불러올 수 없습니다.");
            if (roomData.data.playerCnt >= 2) return alert("이미 가득 찬 방입니다.");

            // 2️⃣ join 요청
            const joinRes = await fetch(`${BASE_URL}/room/join/${roomId}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!joinRes.ok) {
                const err = await joinRes.json();
                return alert(err.message || "방 입장 실패");
            }

            navigate(`/waiting/${roomId}`);
        } catch (error) {
            console.error("방 참가 오류:", error);
            alert("방 참가 중 오류가 발생했습니다.");
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("user");
        navigate("/Login");
    };

    return (
        <div className="room-container">
            <div className="content-wrapper">
                <img src={logo} alt="logo" />
                <div className="user-info">접속 중: {user?.data?.email || user?.email}</div>
                <button onClick={handleLogout}>로그아웃</button>
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
                <button onClick={() => fetchRooms(user.data?.token || user.token)}>새로고침</button>
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
