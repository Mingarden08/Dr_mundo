const WebSocket = require('ws');

function initWebSocket(server) {
    const wss = new WebSocket.Server({ server });
    const rooms = {}; // roomId: { players: [], gameStarted: false }

    wss.on('connection', (ws) => {
        ws.playerId = Date.now(); // 간단한 playerId
        ws.roomId = null;

        ws.send(JSON.stringify({ event: 'connected', playerId: ws.playerId }));

        ws.on('message', (msg) => {
            const data = JSON.parse(msg);

            switch (data.event) {
                case 'join':
                    if (!rooms[data.roomId]) rooms[data.roomId] = { players: [], gameStarted: false };
                    rooms[data.roomId].players.push(ws);
                    ws.roomId = data.roomId;
                    ws.send(JSON.stringify({ success: true }));
                    break;

                case 'leave':
                    if (ws.roomId && rooms[ws.roomId]) {
                        rooms[ws.roomId].players = rooms[ws.roomId].players.filter(p => p !== ws);
                        ws.roomId = null;
                    }
                    ws.send(JSON.stringify({ success: true }));
                    break;

                case 'start':
                    if (ws.roomId && rooms[ws.roomId]) {
                        rooms[ws.roomId].gameStarted = true;
                        rooms[ws.roomId].players.forEach(p => p.send(JSON.stringify({ event: 'start', success: true })));
                    }
                    break;

                case 'move':
                    rooms[ws.roomId]?.players.forEach(p => {
                        if (p !== ws) p.send(JSON.stringify({ event: 'move', playerId: ws.playerId, x: data.x, y: data.y }));
                    });
                    ws.send(JSON.stringify({ success: true }));
                    break;

                case 'attack':
                    rooms[ws.roomId]?.players.forEach(p => {
                        if (p !== ws) p.send(JSON.stringify({ event: 'attack', x: data.x, y: data.y, damage: data.damage }));
                    });
                    ws.send(JSON.stringify({ x: data.x, y: data.y }));
                    break;

                case 'flash':
                case 'ghost':
                    ws.send(JSON.stringify({ x: data.x + 40, y: data.y + 40 }));
                    break;

                case 'hit':
                    ws.send(JSON.stringify({ x: data.x, y: data.y, hp: 400 }));
                    break;

                case 'finish':
                    rooms[ws.roomId]?.players.forEach(p => {
                        p.send(JSON.stringify({ event: 'finish', roomId: ws.roomId, playerId: data.playerId }));
                    });
                    break;

                case 'coolTime':
                    ws.send(JSON.stringify({ event: 'coolTime', rune: 1, attack: 1, ghost: 1, flash: 1 }));
                    break;

                default:
                    console.log('Unknown event:', data.event);
            }
        });

        ws.on('close', () => {
            if (ws.roomId && rooms[ws.roomId]) {
                rooms[ws.roomId].players = rooms[ws.roomId].players.filter(p => p !== ws);
            }
        });
    });

    return { wss };
}

module.exports = initWebSocket;
