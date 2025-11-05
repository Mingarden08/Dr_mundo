const gameService = require("../services/gameService");

const successResp = (data) => ({ 
    code: 200, 
    message: "요청이 성공적으로 처리되었습니다.", 
    data 
});

// 게임 시작 (새로 추가)
exports.startGame = async (req, res) => {
    try {
        const roomId = parseInt(req.params.rNo);
        const memberId = req.user.id; // authMiddleware에서 설정된 member_id

        if (!roomId || isNaN(roomId)) {
            return res.status(400).json({ 
                code: 400, 
                message: "방 번호가 필요합니다.", 
                data: null 
            });
        }

        // 서비스 계층의 startGame 함수 호출 (DB 상태 업데이트 및 검증)
        const result = await gameService.startGame(roomId, memberId);
        
        // 성공 응답 (실제 게임 시작 알림은 웹소켓을 통해 처리됨)
        return res.json(successResp(result));

    } catch (err) {
        console.error(err);
        if (err.message === "방을 찾을 수 없습니다." || 
            err.message === "방장만 게임을 시작할 수 있습니다." ||
            err.message === "플레이어가 2명이 아닙니다." ||
            err.message === "이미 게임이 시작되었습니다.") {
            return res.status(400).json({ 
                code: 400, 
                message: err.message, 
                data: null 
            });
        }
        return res.status(500).json({ 
            code: 500, 
            message: "서버 에러", 
            data: null 
        });
    }
};

// 방 만들기
exports.createRoom = async (req, res) => {
    try {
        const { roomName } = req.body;
        const hostId = req.user.id; // authMiddleware에서 설정된 member_id

        if (!roomName) {
            return res.status(400).json({ 
                code: 400, 
                message: "방 이름이 필요합니다.", 
                data: null 
            });
        }

        const result = await gameService.createRoom(roomName, hostId);
        return res.json(successResp(result));

    } catch (err) {
        console.error(err);
        if (err.message === "이미 참가중인 방이 있습니다.") {
            return res.status(400).json({ 
                code: 400, 
                message: err.message, 
                data: null 
            });
        }
        return res.status(500).json({ 
            code: 500, 
            message: "서버 에러", 
            data: null 
        });
    }
};

// 방 목록 보기
exports.getRoomList = async (req, res) => {
    try {
        const rooms = await gameService.getRoomList();
        return res.json(successResp({ rooms }));

    } catch (err) {
        console.error(err);
        return res.status(500).json({ 
            code: 500, 
            message: "서버 에러", 
            data: null 
        });
    }
};

// 방 참가
exports.joinRoom = async (req, res) => {
    try {
        const roomId = parseInt(req.params.rNo);
        const memberId = req.user.id; // authMiddleware에서 설정된 member_id

        if (!roomId || isNaN(roomId)) {
            return res.status(400).json({ 
                code: 400, 
                message: "방 번호가 필요합니다.", 
                data: null 
            });
        }

        const result = await gameService.joinRoom(roomId, memberId);
        return res.json(successResp(result));

    } catch (err) {
        console.error(err);
        if (err.message === "방을 찾을 수 없습니다." || 
            err.message === "이미 진행 중인 방입니다." ||
            err.message === "방이 꽉 찼습니다." ||
            err.message === "이미 참가한 방입니다.") {
            return res.status(400).json({ 
                code: 400, 
                message: err.message, 
                data: null 
            });
        }
        return res.status(500).json({ 
            code: 500, 
            message: "서버 에러", 
            data: null 
        });
    }
};

// 게임 결과 저장
exports.saveGameResult = async (req, res) => {
    try {
        const roomId = parseInt(req.params.rNo);
        const { winner } = req.body;
        const memberId = req.user.id; // authMiddleware에서 설정된 member_id

        if (!roomId || isNaN(roomId) || !winner) {
            return res.status(400).json({ 
                code: 400, 
                message: "필수 값이 없습니다.", 
                data: null 
            });
        }

        // winner가 "player"이면 현재 유저가 승리
        const winnerId = winner === "player" ? memberId : null;

        if (!winnerId) {
            return res.status(400).json({ 
                code: 400, 
                message: "승자 정보가 올바르지 않습니다.", 
                data: null 
            });
        }

        const result = await gameService.saveGameResult(roomId, winnerId);
        return res.json(successResp(result));

    } catch (err) {
        console.error(err);
        if (err.message === "참가자가 2명이 아닙니다." ||
            err.message === "패자를 찾을 수 없습니다.") {
            return res.status(400).json({ 
                code: 400, 
                message: err.message, 
                data: null 
            });
        }
        return res.status(500).json({ 
            code: 500, 
            message: "서버 에러", 
            data: null 
        });
    }
};

// 전적 보기
exports.getGameRecord = async (req, res) => {
    try {
        const memberId = req.user.id; // authMiddleware에서 설정된 member_id
        const result = await gameService.getGameRecord(memberId);
        return res.json(successResp(result));

    } catch (err) {
        console.error(err);
        return res.status(500).json({ 
            code: 500, 
            message: "서버 에러", 
            data: null 
        });
    }
};

// 랭킹 보기
exports.getRanking = async (req, res) => {
    try {
        const ranks = await gameService.getRanking();
        return res.json(successResp({ ranks }));

    } catch (err) {
        console.error(err);
        return res.status(500).json({ 
            code: 500, 
            message: "서버 에러", 
            data: null 
        });
    }
};

// 방 나가기
exports.leaveRoom = async (req, res) => {
    try {
        const roomId = parseInt(req.params.rNo);
        const memberId = req.user.id;

        if (!roomId || isNaN(roomId)) {
            return res.status(400).json({ 
                code: 400, 
                message: "방 번호가 필요합니다.", 
                data: null 
            });
        }

        const result = await gameService.leaveRoom(roomId, memberId);
        return res.json(successResp(result));

    } catch (err) {
        console.error(err);
        if (err.message === "방을 찾을 수 없습니다." ||
            err.message === "방에 참가하고 있지 않습니다." ||
            err.message === "게임 진행 중에는 나갈 수 없습니다.") {
            return res.status(400).json({ 
                code: 400, 
                message: err.message, 
                data: null 
            });
        }
        return res.status(500).json({ 
            code: 500, 
            message: "서버 에러", 
            data: null 
        });
    }
};

// 방 삭제
exports.deleteRoom = async (req, res) => {
    try {
        const roomId = parseInt(req.params.rNo);
        const memberId = req.user.id;

        if (!roomId || isNaN(roomId)) {
            return res.status(400).json({ 
                code: 400, 
                message: "방 번호가 필요합니다.", 
                data: null 
            });
        }

        const result = await gameService.deleteRoom(roomId, memberId);
        return res.json(successResp(result));

    } catch (err) {
        console.error(err);
        if (err.message === "방을 찾을 수 없습니다." ||
            err.message === "방장만 방을 삭제할 수 있습니다." ||
            err.message === "게임 진행 중에는 방을 삭제할 수 없습니다.") {
            return res.status(400).json({ 
                code: 400, 
                message: err.message, 
                data: null 
            });
        }
        return res.status(500).json({ 
            code: 500, 
            message: "서버 에러", 
            data: null 
        });
    }
};