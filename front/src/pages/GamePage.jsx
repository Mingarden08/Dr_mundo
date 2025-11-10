import React, { useState, useEffect, useRef } from 'react';

// 서버에서 사용하는 메시지 형식(coolTime, playerLeft 등)을 기반으로 상태를 관리합니다.
const WS_URL = 'wss://dr-mundo.onrender.com'; // 실제 WebSocket 서버 주소로 변경하세요

function GameClient() {
    // 1. 상태 관리
    const [isConnected, setIsConnected] = useState(false); // 연결 상태
    const [messages, setMessages] = useState([]); // 수신된 메시지 목록
    const [inputMessage, setInputMessage] = useState(''); // 보낼 메시지 입력 값
    const [cooldowns, setCooldowns] = useState({ rune: 0, attack: 0, ghost: 0, flash: 0 }); // 쿨타임 상태
    
    // WebSocket 객체를 저장하기 위한 ref. 컴포넌트 라이프사이클 동안 유지됩니다.
    const ws = useRef(null); 

    // 2. WebSocket 연결 및 이벤트 핸들링 (컴포넌트 마운트 시 실행)
    useEffect(() => {
        // WebSocket 객체 생성
        ws.current = new WebSocket(WS_URL);

        // 연결이 성공적으로 열렸을 때
        ws.current.onopen = () => {
            console.log('WebSocket 연결이 열렸습니다.');
            setIsConnected(true);
            // 서버에 인증 토큰 등을 전송할 수 있습니다. (예: ws.current.send(JSON.stringify({ event: 'auth', token: 'YOUR_JWT_TOKEN' })));
        };

        // 메시지 수신 시
        ws.current.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // 서버 코드(websocket.js)에서 정의된 'coolTime' 이벤트 처리
                if (data.event === 'coolTime') {
                    // 서버가 보낸 쿨타임 정보로 상태 업데이트
                    setCooldowns({
                        rune: data.rune,
                        attack: data.attack,
                        ghost: data.ghost,
                        flash: data.flash
                    });
                } 
                // 'playerLeft' 이벤트 처리 예시
                else if (data.event === 'playerLeft') {
                    setMessages(prev => [...prev, `${data.userId}님이 접속을 종료했습니다. (남은 인원: ${data.playerCount})`]);
                } 
                // 그 외 모든 메시지는 목록에 추가 (예시)
                else {
                    setMessages(prev => [...prev, `[${data.event || 'message'}] ${JSON.stringify(data)}`]);
                }
                
            } catch (error) {
                // JSON이 아닌 일반 텍스트 메시지 처리
                setMessages(prev => [...prev, `[텍스트 메시지] ${event.data}`]);
            }
        };

        // 에러 발생 시
        ws.current.onerror = (error) => {
            console.error('WebSocket 에러 발생:', error);
        };

        // 연결이 닫혔을 때
        ws.current.onclose = () => {
            console.log('WebSocket 연결이 닫혔습니다.');
            setIsConnected(false);
            // 재연결 로직을 여기에 구현할 수 있습니다.
        };

        // 3. 컴포넌트가 언마운트될 때 WebSocket 연결 정리 (매우 중요)
        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, []); // 빈 배열: 컴포넌트가 처음 마운트될 때 한 번만 실행

    // 4. 메시지 전송 함수
    const sendMessage = () => {
        if (ws.current && isConnected && inputMessage.trim() !== '') {
            // 서버가 인식할 수 있는 JSON 형식으로 메시지를 전송 (예시: 채팅 메시지)
            const messageToSend = JSON.stringify({
                event: 'chat',
                message: inputMessage
            });
            ws.current.send(messageToSend);
            setInputMessage('');
        }
    };
    
    // 5. 스킬 사용 전송 함수 (서버 코드에 'flash' 및 'ghost' 쿨타임이 정의되어 있습니다.)
    const sendSkill = (skillName) => {
        if (ws.current && isConnected) {
            // 서버에 스킬 사용 이벤트를 보냅니다.
            ws.current.send(JSON.stringify({ event: 'skill', type: skillName }));
        }
    };


    // 6. 렌더링
    return (
        <div style={{ padding: '20px', border: '1px solid #ccc' }}>
            <h2>게임 클라이언트 (React + WebSocket)</h2>
            <p>
                연결 상태: 
                <span style={{ color: isConnected ? 'green' : 'red', fontWeight: 'bold' }}>
                    {isConnected ? '연결됨' : '연결 끊김'}
                </span>
            </p>

            {/* 쿨타임 표시 (서버에서 받은 데이터) */}
            <div>
                <h3>스킬 쿨타임</h3>
                <p>룬: {cooldowns.rune}초 | 공격: {cooldowns.attack}초 | 유체화(Ghost): {cooldowns.ghost}초 | 점멸(Flash): {cooldowns.flash}초</p>
                <button onClick={() => sendSkill('ghost')} disabled={!isConnected || cooldowns.ghost > 0}>유체화 사용</button>
                <button onClick={() => sendSkill('flash')} disabled={!isConnected || cooldowns.flash > 0}>점멸 사용</button>
            </div>

            <hr />

            {/* 메시지 송수신 영역 */}
            <div>
                <h3>메시지 전송</h3>
                <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    disabled={!isConnected}
                    placeholder="서버로 보낼 메시지 입력"
                    style={{ width: '300px', marginRight: '10px' }}
                />
                <button onClick={sendMessage} disabled={!isConnected}>전송</button>
            </div>

            <hr />

            {/* 수신 메시지 표시 */}
            <div>
                <h3>수신 메시지 로그</h3>
                <div style={{ height: '200px', overflowY: 'scroll', border: '1px solid #eee', padding: '10px' }}>
                    {messages.map((msg, index) => (
                        <p key={index} style={{ margin: '2px 0', fontSize: '14px' }}>{msg}</p>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default GameClient;