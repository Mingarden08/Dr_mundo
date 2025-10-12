const Room = require("../models/Room");

exports.createRoom = async (userId, roomName, maxPlayers = 2) => {
    const room = await Room.create({
        name: roomName,
        host_id: userId,
        max_players: maxPlayers
    });
    return room;
};
