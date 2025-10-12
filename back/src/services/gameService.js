const { Room, RoomParticipant, GameRecord, Member, sequelize } = require("../models");
const { Op } = require("sequelize");

// 방 만들기
exports.createRoom = async (roomName, hostId) => {
    // 1. 이미 참가중인 방이 있는지 확인
    const existingParticipation = await RoomParticipant.findOne({
        where: { memberId: hostId },
        include: [{
            model: Room,
            as: 'room',
            where: { 
                status: { 
                    [Op.in]: ['waiting', 'playing'] 
                } 
            }
        }]
    });

    if (existingParticipation) {
        throw new Error("이미 참가중인 방이 있습니다.");
    }

    // 2. 방 생성
    const room = await Room.create({
        roomName: roomName,
        hostId: hostId,
        playerCount: 1,
        status: 'waiting'
    });

    // 3. 방장을 Room_Participant에 추가
    await RoomParticipant.create({
        roomId: room.id,
        memberId: hostId
    });

    return {
        playerCnt: room.playerCount,
        roomId: room.id
    };
};

// 방 목록 보기
exports.getRoomList = async () => {
    const rooms = await Room.findAll({
        where: { status: 'waiting' },
        attributes: ['id', 'playerCount'],
        order: [['createdAt', 'DESC']]
    });

    return rooms.map(room => ({
        roomId: room.id,
        playerCnt: room.playerCount
    }));
};

// 방 참가
exports.joinRoom = async (roomId, memberId) => {
    // 트랜잭션 시작
    const t = await sequelize.transaction();

    try {
        // 1. 방 조회 및 잠금
        const room = await Room.findByPk(roomId, {
            lock: true,
            transaction: t
        });

        if (!room) {
            await t.rollback();
            throw new Error("방을 찾을 수 없습니다.");
        }

        if (room.status !== 'waiting') {
            await t.rollback();
            throw new Error("이미 진행 중인 방입니다.");
        }

        if (room.playerCount >= room.maxCount) {
            await t.rollback();
            throw new Error("방이 꽉 찼습니다.");
        }

        // 2. 이미 참가했는지 확인
        const existing = await RoomParticipant.findOne({
            where: { roomId: roomId, memberId: memberId },
            transaction: t
        });

        if (existing) {
            await t.rollback();
            throw new Error("이미 참가한 방입니다.");
        }

        // 3. 참가자 추가
        await RoomParticipant.create({
            roomId: roomId,
            memberId: memberId
        }, { transaction: t });

        // 4. playerCount 증가
        await room.increment('playerCount', { transaction: t });

        await t.commit();
        return { success: true };

    } catch (err) {
        await t.rollback();
        throw err;
    }
};

// 게임 결과 저장
exports.saveGameResult = async (roomId, winnerId) => {
    const t = await sequelize.transaction();

    try {
        // 1. 방의 참가자 확인
        const participants = await RoomParticipant.findAll({
            where: { roomId: roomId },
            transaction: t
        });

        if (participants.length !== 2) {
            await t.rollback();
            throw new Error("참가자가 2명이 아닙니다.");
        }

        // 2. 패자 찾기
        const loserId = participants.find(p => p.memberId !== winnerId)?.memberId;
        if (!loserId) {
            await t.rollback();
            throw new Error("패자를 찾을 수 없습니다.");
        }

        // 3. 게임 결과 저장
        await GameRecord.create({
            roomId: roomId,
            winnerId: winnerId,
            loserId: loserId
        }, { transaction: t });

        // 4. 승자 전적 업데이트
        const winner = await Member.findByPk(winnerId, { transaction: t });
        await winner.increment('totalWins', { transaction: t });

        // 5. 방 상태 변경
        await Room.update(
            { status: 'finished' },
            { where: { id: roomId }, transaction: t }
        );

        await t.commit();
        return { success: true };

    } catch (err) {
        await t.rollback();
        throw err;
    }
};

// 전적 보기
exports.getGameRecord = async (memberId) => {
    // 1. 게임 기록 조회
    const records = await GameRecord.findAll({
        where: {
            [Op.or]: [
                { winnerId: memberId },
                { loserId: memberId }
            ]
        },
        include: [
            {
                model: Member,
                as: 'winner',
                attributes: ['nickName']
            },
            {
                model: Member,
                as: 'loser',
                attributes: ['nickName']
            }
        ],
        order: [['playedAt', 'DESC']]
    });

    // 2. 게임 결과 변환
    const games = records.map(record => {
        const isWin = record.winnerId === memberId;
        const enemy = isWin ? record.loser.nickName : record.winner.nickName;

        return {
            win: isWin,
            enemy: enemy
        };
    });

    // 3. 랭킹 계산
    const member = await Member.findByPk(memberId);
    const rank = await Member.count({
        where: {
            totalWins: {
                [Op.gt]: member.totalWins
            }
        }
    }) + 1;

    return {
        games,
        rank
    };
};

// 랭킹 보기
exports.getRanking = async () => {
    const rankings = await Member.findAll({
        attributes: ['nickName', 'totalWins'],
        order: [['totalWins', 'DESC']],
        limit: 100
    });

    return rankings.map(member => ({
        player: member.nickName,
        winRate: member.totalWins
    }));
};

// 방 나가기
exports.leaveRoom = async (roomId, memberId) => {
    const t = await sequelize.transaction();

    try {
        // 1. 방 조회
        const room = await Room.findByPk(roomId, { transaction: t });
        if (!room) {
            await t.rollback();
            throw new Error("방을 찾을 수 없습니다.");
        }

        // 2. 참가자 확인
        const participant = await RoomParticipant.findOne({
            where: { roomId: roomId, memberId: memberId },
            transaction: t
        });

        if (!participant) {
            await t.rollback();
            throw new Error("방에 참가하고 있지 않습니다.");
        }

        // 3. 게임 진행 중이면 나갈 수 없음
        if (room.status === 'playing') {
            await t.rollback();
            throw new Error("게임 진행 중에는 나갈 수 없습니다.");
        }

        // 4. 참가자 제거
        await participant.destroy({ transaction: t });

        // 5. playerCount 감소
        await room.decrement('playerCount', { transaction: t });

        // 6. 방에 아무도 없으면 방 삭제
        if (room.playerCount <= 1) {
            await room.destroy({ transaction: t });
        }

        await t.commit();
        return { success: true };

    } catch (err) {
        await t.rollback();
        throw err;
    }
};

// 방 삭제 (방장만 가능)
exports.deleteRoom = async (roomId, memberId) => {
    const t = await sequelize.transaction();

    try {
        // 1. 방 조회
        const room = await Room.findByPk(roomId, { transaction: t });
        if (!room) {
            await t.rollback();
            throw new Error("방을 찾을 수 없습니다.");
        }

        // 2. 방장 권한 확인
        if (room.hostId !== memberId) {
            await t.rollback();
            throw new Error("방장만 방을 삭제할 수 있습니다.");
        }

        // 3. 게임 진행 중이면 삭제 불가
        if (room.status === 'playing') {
            await t.rollback();
            throw new Error("게임 진행 중에는 방을 삭제할 수 없습니다.");
        }

        // 4. 모든 참가자 제거
        await RoomParticipant.destroy({
            where: { roomId: roomId },
            transaction: t
        });

        // 5. 방 삭제
        await room.destroy({ transaction: t });

        await t.commit();
        return { success: true };

    } catch (err) {
        await t.rollback();
        throw err;
    }
};