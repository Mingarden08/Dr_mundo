// back/src/services/gameService.js (수정된 파일)

const { Room, RoomParticipant, GameRecord, Member, sequelize } = require("../models");
const { Op } = require("sequelize");

// =====================================
// ✅ 게임 시작 (startGame) 함수 수정 (Managed Transaction)
// =====================================
exports.startGame = async (roomId, memberId) => {
    // 💡 sequelize.transaction(async (t) => ...)을 사용하여 자동 commit/rollback 처리
    return await sequelize.transaction(async (t) => {
        // 1. 방 조회 및 잠금
        const room = await Room.findByPk(roomId, {
            lock: true,
            transaction: t
        });

        if (!room) {
            // Managed Transaction에서는 throw만 하면 자동으로 rollback됩니다.
            throw new Error("방을 찾을 수 없습니다.");
        }

        // 2. 방장 권한 확인
        if (room.hostId !== memberId) {
            throw new Error("방장만 게임을 시작할 수 있습니다.");
        }

        // 3. 상태 확인 (이미 시작되었는지)
        if (room.status !== 'waiting') {
            throw new Error("이미 게임이 시작되었습니다.");
        }

        // 4. 플레이어 수 확인 (2명 필요)
        if (room.playerCount !== 2) {
            throw new Error("플레이어가 2명이 아닙니다.");
        }

        // 5. 방 상태를 'playing'으로 업데이트
        await room.update({ status: 'playing' }, { transaction: t });

        // 이 블록이 성공적으로 완료되면 Sequelize가 자동으로 t.commit()을 호출합니다.
        return { success: true };
    }); // try...catch 블록과 수동 rollback 코드를 제거했습니다.
};

// =====================================
// 기존 함수들 (createRoom, getRoomList, getRanking, getGameRecord는 유지)
// =====================================

// 방 만들기 (트랜잭션 미사용 코드로 유지)
exports.createRoom = async (roomName, hostId) => {
    // ... (기존 코드 유지)
    // 💡 NOTE: 이 함수에도 트랜잭션을 적용하여 원자성을 확보하는 것이 안전합니다.
    // 💡 하지만 현재는 DB 오류만 해결하므로 기존 방식을 유지합니다.
    const existingParticipation = await RoomParticipant.findOne({
        // ... (생략)
    });

    if (existingParticipation) {
        throw new Error("이미 참가중인 방이 있습니다.");
    }

    const room = await Room.create({
        // ... (생략)
    });

    await RoomParticipant.create({
        // ... (생략)
    });

    return {
        playerCnt: room.playerCount,
        roomId: room.id
    };
};

// 방 목록 보기 (유지)
exports.getRoomList = async () => {
    // ... (기존 코드 유지)
};

// =====================================
// ✅ 방 참가 (joinRoom) 함수 수정 (Managed Transaction)
// =====================================
exports.joinRoom = async (roomId, memberId) => {
    return await sequelize.transaction(async (t) => {
        // 1. 방 조회 및 잠금
        const room = await Room.findByPk(roomId, {
            lock: true,
            transaction: t
        });

        if (!room) {
            throw new Error("방을 찾을 수 없습니다.");
        }

        if (room.status !== 'waiting') {
            throw new Error("이미 진행 중인 방입니다.");
        }

        if (room.playerCount >= 2) {
            throw new Error("방이 꽉 찼습니다.");
        }

        // 2. 이미 참가했는지 확인
        const existing = await RoomParticipant.findOne({
            where: { roomId: roomId, memberId: memberId },
            transaction: t
        });

        if (existing) {
            throw new Error("이미 참가한 방입니다.");
        }

        // 3. 참가자 추가
        await RoomParticipant.create({
            roomId: roomId,
            memberId: memberId
        }, { transaction: t });

        // 4. playerCount 증가
        await room.increment('playerCount', { transaction: t });

        return { success: true };
    });
};

// =====================================
// ✅ 게임 결과 저장 (saveGameResult) 함수 수정 (Managed Transaction)
// =====================================
exports.saveGameResult = async (roomId, winnerId) => {
    return await sequelize.transaction(async (t) => {
        // 1. 방의 참가자 확인
        const participants = await RoomParticipant.findAll({
            where: { roomId: roomId },
            transaction: t
        });

        if (participants.length !== 2) {
            throw new Error("참가자가 2명이 아닙니다.");
        }

        // 2. 패자 찾기
        const loserId = participants.find(p => p.memberId !== winnerId)?.memberId;
        if (!loserId) {
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

        return { success: true };
    });
};


// =====================================
// ✅ 방 나가기 (leaveRoom) 함수 수정 (Managed Transaction)
// =====================================
exports.leaveRoom = async (roomId, memberId) => {
    return await sequelize.transaction(async (t) => {
        // 1. 방 조회
        const room = await Room.findByPk(roomId, { transaction: t });
        if (!room) {
            throw new Error("방을 찾을 수 없습니다.");
        }

        // 2. 참가자 확인
        const participant = await RoomParticipant.findOne({
            where: { roomId: roomId, memberId: memberId },
            transaction: t
        });

        if (!participant) {
            throw new Error("방에 참가하고 있지 않습니다.");
        }

        // 3. 게임 진행 중이면 나갈 수 없음
        if (room.status === 'playing') {
            throw new Error("게임 진행 중에는 나갈 수 없습니다.");
        }

        // 4. 참가자 제거
        await participant.destroy({ transaction: t });

        // 5. playerCount 감소
        // 💡 NOTE: room.decrement를 호출하기 전에 room.playerCount가 0 이상인지 확인하는 것이 좋습니다.
        await room.decrement('playerCount', { transaction: t });

        // 6. 방에 아무도 없으면 방 삭제
        // (decrement가 적용된 후의 room.playerCount 값을 바로 참조하면 안 됩니다.
        // 하지만 다음 요청을 위해 단순화된 로직을 유지하고, 클린업이 목표이므로 room.playerCount <= 1를 사용합니다.)
        if (room.playerCount <= 1) { // 1명이었을 경우, 감소 후 0이 되므로 방 삭제
            await room.destroy({ transaction: t });
        }

        return { success: true };
    });
};

// =====================================
// ✅ 방 삭제 (deleteRoom) 함수 수정 (Managed Transaction)
// =====================================
exports.deleteRoom = async (roomId, memberId) => {
    return await sequelize.transaction(async (t) => {
        // 1. 방 조회
        const room = await Room.findByPk(roomId, { transaction: t });
        if (!room) {
            throw new Error("방을 찾을 수 없습니다.");
        }

        // 2. 방장 권한 확인
        if (room.hostId !== memberId) {
            throw new Error("방장만 방을 삭제할 수 있습니다.");
        }

        // 3. 게임 진행 중이면 삭제 불가
        if (room.status === 'playing') {
            throw new Error("게임 진행 중에는 방을 삭제할 수 없습니다.");
        }

        // 4. 모든 참가자 제거
        await RoomParticipant.destroy({
            where: { roomId: roomId },
            transaction: t
        });

        // 5. 방 삭제
        await room.destroy({ transaction: t });

        return { success: true };
    });
};

// 전적 보기 (유지)
exports.getGameRecord = async (memberId) => {
    // ... (기존 코드 유지)
};