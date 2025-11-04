const http = require('http');
const app = require('./app');
const { sequelize } = require('./models');
const initWebSocket = require('./utils/websocket');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// WebSocket 초기화
const { wss } = initWebSocket(server);

// app에서 다른 모듈에서 사용 가능하도록 설정
app.set('websocket', { wss });

sequelize.sync({ alter: false })
    .then(() => {
        console.log('✅ Database synced');
        server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
    })
    .catch(err => {
        console.error('❌ Database sync failed:', err);
        process.exit(1);
    });

module.exports = server;
