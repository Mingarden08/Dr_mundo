// D:\Dr_mundo\back\src\server.js

const http = require('http');
const app = require('./app'); // 'app' 모듈이 Express 앱 인스턴스를 내보낸다고 가정
const { sequelize } = require('./models'); // models/index.js에서 sequelize 객체 require
const initWebSocket = require('./utils/websocket'); // 위에서 정의한 웹소켓 초기화 함수

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// WebSocket 초기화 및 HTTP 서버에 연결
const wss = initWebSocket(server); 

// Express 앱 인스턴스에 wss 객체를 설정하여 다른 모듈에서 접근 가능하게 합니다.
app.set('websocket', { wss }); 

sequelize.sync({ alter: false })
    .then(() => {
        console.log('✅ Database synced');
        // HTTP 및 WebSocket 서버 시작
        server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
    })
    .catch(err => {
        console.error('❌ Database sync failed:', err);
        process.exit(1);
    });

module.exports = server;