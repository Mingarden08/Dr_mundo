const sequelize = require('../utils/db');
const Member = require('./Member');
const Room = require('./Room');
const GameRecord = require('./GameRecord');
const RoomParticipant = require('./RoomParticipant');

const models = {
    Member: Member(sequelize),
    Room: Room(sequelize),
    GameRecord: GameRecord(sequelize),
    RoomParticipant: RoomParticipant(sequelize)
};

// ============================================
// 관계 설정 (Association)
// ============================================

// 1. Member와 Room의 관계 (방 생성 - host)
models.Member.hasMany(models.Room, { 
    foreignKey: 'hostId',  // camelCase로 통일
    as: 'hostedRooms' 
});
models.Room.belongsTo(models.Member, { 
    foreignKey: 'hostId', 
    as: 'host' 
});

// 2. Member와 GameRecord의 관계 (승자)
models.Member.hasMany(models.GameRecord, { 
    foreignKey: 'winnerId',  // camelCase로 통일
    as: 'wonGames' 
});
models.GameRecord.belongsTo(models.Member, { 
    foreignKey: 'winnerId', 
    as: 'winner' 
});

// 3. Member와 GameRecord의 관계 (패자)
models.Member.hasMany(models.GameRecord, { 
    foreignKey: 'loserId',  // camelCase로 통일
    as: 'lostGames' 
});
models.GameRecord.belongsTo(models.Member, { 
    foreignKey: 'loserId', 
    as: 'loser' 
});

// 4. Room과 GameRecord의 관계
models.Room.hasMany(models.GameRecord, { 
    foreignKey: 'roomId',  // camelCase로 통일
    as: 'gameRecords' 
});
models.GameRecord.belongsTo(models.Room, { 
    foreignKey: 'roomId', 
    as: 'room' 
});

// 5. Member와 RoomParticipant의 관계
models.Member.hasMany(models.RoomParticipant, { 
    foreignKey: 'memberId',  // camelCase로 통일
    as: 'participations' 
});
models.RoomParticipant.belongsTo(models.Member, { 
    foreignKey: 'memberId', 
    as: 'member' 
});

// 6. Room과 RoomParticipant의 관계
models.Room.hasMany(models.RoomParticipant, { 
    foreignKey: 'roomId',  // camelCase로 통일
    as: 'participants' 
});
models.RoomParticipant.belongsTo(models.Room, { 
    foreignKey: 'roomId', 
    as: 'room' 
});

module.exports = { sequelize, ...models };