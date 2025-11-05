// D:\Dr_mundo\back\src\server.js

const http = require('http');
const app = require('./app');
const { sequelize } = require('./models');
// 웹소켓 모듈에서 initWebSocket, checkHit, gameStates를 구조 분해 할당으로 불러옵니다.
const { initWebSocket, checkHit, gameStates } = require('./utils/websocket'); 

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// WebSocket 초기화 및 HTTP 서버에 연결
const wss = initWebSocket(server); 

// WebSocket 관련 모든 객체를 app에 설정하여 다른 모듈에서 접근 가능하게 합니다.
app.set('websocket', { wss, checkHit, gameStates });

sequelize.sync({ alter: false })
    .then(() => {
        console.log('✅ Database synced');
        // 서버 시작 시 Swagger 및 WebSocket 주소 포함하여 자세한 로그 출력
        server.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
            console.log(`📚 Swagger available at http://localhost:${PORT}/api-docs`);
            console.log(`🔌 WebSocket listening at ws://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ Database sync failed:', err);
        process.exit(1);
    });

module.exports = server;