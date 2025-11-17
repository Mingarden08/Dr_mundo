import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const BASE_URL = "https://dr-mundo.onrender.com/dr-mundo/game";

function WaitingRoom() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [room, setRoom] = useState(null);

    useEffect(() => {
        const userData = localStorage.getItem("user");
        if (!userData) return navigate("/Login");
        setUser(JSON.parse(userData));
        fetchRoomInfo();
    }, [roomId]);

    const fetchRoomInfo = async () => {
        try {
            const res = await fetch(`${BASE_URL}/room/${roomId}`, {
                headers: { "Authorization": `Bearer ${user.data.token}` }
            });
            if (!res.ok) throw new Error("방 정보 조회 실패");
            const data = await res.json();
            setRoom(data.data);
        } catch (error) {
            console.error("방 정보 조회 중 에러:", error);
            alert("방 정보를 불러오는 중 오류 발생");
            navigate("/Room");
        }
    };

    const leaveRoom = async () => {
        try {
            const res = await fetch(`${BASE_URL}/room/leave/${roomId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${user.data.token}` }
            });
            if (!res.ok) throw new Error("방 나가기 실패");
            navigate("/Room");
        } catch (error) {
            console.error("방 나가기 중 에러:", error);
            alert("방 나가기 중 오류 발생");
        }
    };

    return (
        <div>
            <h2>대기방 #{roomId}</h2>
            <div>방 정보: {JSON.stringify(room)}</div>
            <button onClick={leaveRoom}>방 나가기</button>
        </div>
    );
}

export default WaitingRoom;
