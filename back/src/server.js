const http = require('http');
const app = require('./app');
const { sequelize } = require('./models');
const { initWebSocket } = require('./utils/websocket');

const PORT = process.env.PORT || 3000;

// HTTP 서버 생성
const server = http.createServer(app);

// WebSocket 초기화
const { wss, checkHit, gameStates } = initWebSocket(server);

// WebSocket 객체를 app에 저장 (다른 모듈에서 사용 가능)
app.set('websocket', { wss, checkHit, gameStates });

// 데이터베이스 연결 및 서버 시작
sequelize.sync({ alter: false })
    .then(() => {
        console.log('✅ Database synced');
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