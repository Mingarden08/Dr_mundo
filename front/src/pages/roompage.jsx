import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./roompage.css";
import logo from "./assets/images/logo.png";

// API Base URL을 상수로 정의하여 일관성을 높입니다.
const API_BASE_URL = "https://dr-mundo.onrender.com/dr-mundo/game/room";

function RoomPage() {
    const [user, setUser] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [roomName, setRoomName] = useState("");
    const [rooms, setRooms] = useState([]);
    const navigate = useNavigate();

    // useCallback을 사용하여 함수가 불필요하게 재생성되는 것을 방지합니다.
    const leaveCurrentRoom = useCallback(async () => {
        try {
            const userData = localStorage.getItem("user");
            if (!userData) return;

            const token = JSON.parse(userData).data.token;
            
            // 1. 현재 참가중인 방 목록 확인 (GET /room)
            const roomsResponse = await fetch(API_BASE_URL, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            
            if (roomsResponse.ok) {
                const roomsData = await roomsResponse.json();
                const userRooms = roomsData.data?.rooms || []; 
                
                if (userRooms.length > 0) {
                    const rNo = userRooms[0].roomId;
                    console.log(`기존 방 #${rNo}에서 나가기 시도...`);
                    
                    // 2. 방 나가기 (DELETE /room/leave/{rNo})
                    const leaveResponse = await fetch(`${API_BASE_URL}/leave/${rNo}`, {
                        method: "DELETE",
                        headers: {
                            "Authorization": `Bearer ${token}`
                        }
                    });
                    
                    if (leaveResponse.ok) {
                           console.log(`✅ 기존 방 #${rNo}에서 성공적으로 나갔습니다.`);
                    } else {
                           const leaveError = await leaveResponse.json();
                           console.error(`❌ 방 나가기 실패: ${leaveError.message || '알 수 없는 오류'} (방 #${rNo})`);
                    }
                }
            }
        } catch (err) {
            console.error("기존 방 정보 확인 또는 나가기 실패:", err);
        }
    }, []); // 외부 의존성 없음

    // useCallback을 사용하여 함수가 불필요하게 재생성되는 것을 방지합니다.
    const fetchRooms = useCallback(async () => {
        try {
            const userData = localStorage.getItem("user");
            if (!userData) return;

            const token = JSON.parse(userData).data.token;
            
            // 방 목록 가져오기 (GET /room)
            const response = await fetch(API_BASE_URL, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setRooms(data.data?.rooms || []);
            }
        } catch (error) {
            console.error("방 목록 가져오기 실패:", error);
        }
    }, [setRooms]); // setRooms는 state setter이므로 안전하지만, 명시적으로 추가

    useEffect(() => {
        const userData = localStorage.getItem("user");

        if (userData) {
            const parsedUser = JSON.parse(userData);
            setUser(parsedUser);
            console.log("로그인한 사용자:", parsedUser);
        } else {
            navigate("/Login");
        }

        // 방 목록 가져오기
        fetchRooms();
        // 페이지 로드 시 기존 방에서 나가기 (추가 안전장치)
        leaveCurrentRoom();
    }, [navigate, fetchRooms, leaveCurrentRoom]); // useCallback 함수들을 의존성 배열에 추가

    const handleLogout = () => {
        localStorage.removeItem("user");
        navigate("/Login");
    };

    const handleJoinRoom = async (rNo) => {
        try {
            const userData = localStorage.getItem("user");
            const token = JSON.parse(userData).data.token;

            const response = await fetch(`${API_BASE_URL}/join/${rNo}`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (response.ok) {
                navigate(`/waiting/${rNo}`);
            } else {
                const errorData = await response.json();
                alert(errorData.message || "방 입장에 실패했습니다.");
            }
        } catch (error) {
            console.error("방 입장 오류:", error);
            alert("방 입장 중 오류가 발생했습니다.");
        }
    };

    const handleCreateRoom = async () => {
        if (!roomName.trim()) {
            alert("방 이름을 입력해주세요.");
            return;
        }
    
        try {
            const userData = localStorage.getItem("user");
            
            if (!userData) {
                alert("로그인 정보가 없습니다.");
                navigate("/Login");
                return;
            }
    
            const parsedUser = JSON.parse(userData);
            const token = parsedUser.data.token; 
            
            if (!token) {
                alert("토큰 정보가 없습니다.");
                navigate("/Login");
                return;
            }

            // 1. 기존 방에서 나가기
            await leaveCurrentRoom();

            // ⭐ 2. 서버 상태 동기화를 위해 잠시 대기 (0.5초)
            console.log("서버 상태 동기화를 위해 500ms 대기...");
            await new Promise(resolve => setTimeout(resolve, 500)); 
            
            // 3. 방 생성 시도
            const response = await fetch(`${API_BASE_URL}/create`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    roomName: roomName
                }),
            });
    
            if (response.ok) {
                const data = await response.json();
                console.log("✅ 방 생성 성공:", data);
                const roomId = data.data.roomId;
                setShowModal(false);
                setRoomName("");
                navigate(`/waiting/${roomId}`);
            } else {
                const errorData = await response.json();
                console.error("❌ 방 생성 실패 응답:", errorData);
                alert(`방 생성에 실패했습니다: ${errorData.message || "알 수 없는 오류"}`);
            }
        } catch (error) {
            console.error("최종 방 생성 처리 오류:", error);
            alert("방 생성 중 오류가 발생했습니다.");
        }
    };

    return (
        <div className="room-container">
            <div className="content-wrapper">
                <img src={logo} alt="logo" />
                {/* 현재 사용자 이메일 표시 (디버깅용) */}
                {user && user.data.email && (
                    <div className="user-info">접속 중: {user.data.email}</div>
                )}
                <button className="logout-button" onClick={handleLogout}>
                    로그아웃
                </button>
            </div>
            <div className="room-list">
                <p>방 목록</p>
                <hr></hr>
                <div className="rooms-grid">
                    {rooms.length === 0 ? (
                        <div className="no-rooms">생성된 방이 없습니다.</div>
                    ) : (
                        rooms.map((room) => (
                            <div key={room.roomId} className="room-item" onClick={() => handleJoinRoom(room.roomId)}>
                                <div className="room-item-header">
                                    <h3>{room.roomName || `방 #${room.roomId}`}</h3>
                                    <span className="room-status-badge">
                                        {room.playerCnt}/2
                                    </span>
                                </div>
                                <div className="room-item-info">
                                    <span className={`status-text ${room.playerCnt < 2 ? 'waiting' : 'full'}`}>
                                        {room.playerCnt < 2 ? '대기중' : '게임중'}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
            <div className="room-event">
                <button className="room-button" onClick={() => setShowModal(true)}>
                    방만들기
                </button>
                <button className="refresh-button" onClick={fetchRooms}>
                    새로고침
                </button>
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>방 만들기</h2>
                        <input
                            type="text"
                            placeholder="방 이름을 입력하세요"
                            value={roomName}
                            onChange={(e) => setRoomName(e.target.value)}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                    handleCreateRoom();
                                }
                            }}
                            className="room-name-input"
                        />
                        <div className="modal-buttons">
                            <button onClick={handleCreateRoom} className="create-button">
                                생성
                            </button>
                            <button onClick={() => {
                                setShowModal(false);
                                setRoomName("");
                            }} className="cancel-button">
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RoomPage;