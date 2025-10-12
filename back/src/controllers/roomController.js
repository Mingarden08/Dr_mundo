/**
 * 방 관련 컨트롤러
 */

const { Room, RoomPlayer } = require('../models');

const successResp = (data) => ({ code: 200, message: '요청이 성공적으로 처리되었습니다.', data });

exports.createRoom = async (req, res) => {
    try {
        const { roomName } = req.body;
        if (!roomName) return res.status(400).json({ code: 400, message: 'roomName 필요', data: null });

        const room = await Room.create({ roomName });

        // 처음 만든 방에 만든 사람을 플레이어로 등록(선택적)
        await RoomPlayer.create({ roomId: room.id, userId: req.user?.id || null });

        return res.json(successResp({ playerCnt: 1, roomId: room.id }));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ code: 500, message: '서버 에러', data: null });
    }
};

exports.listRooms = async (req, res) => {
    try {
        const rooms = await Room.findAll({
            include: [{ model: RoomPlayer, as: 'players', attributes: ['id'] }]
        });

        const data = { rooms: rooms.map(r => ({ playerCnt: r.players ? r.players.length : 0, roomId: r.id })) };
        return res.json(successResp(data));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ code: 500, message: '서버 에러', data: null });
    }
};

exports.joinRoom = async (req, res) => {
    try {
        const rNo = parseInt(req.params.rNo, 10);
        if (!rNo) return res.status(400).json({ code: 400, message: 'room id 필요', data: null });

        const room = await Room.findByPk(rNo);
        if (!room) return res.status(404).json({ code: 404, message: '방 없음', data: null });

        // 참가자 추가
        await RoomPlayer.create({ roomId: room.id, userId: req.user?.id || null });

        return res.json(successResp({ success: true }));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ code: 500, message: '서버 에러', data: null });
    }
};
