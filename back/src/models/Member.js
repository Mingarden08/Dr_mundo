const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('Member', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            field: 'member_id'  
        },
        email: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        nickName: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
            field: 'nick_name'  
        },
        passwd: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        totalWins: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            field: 'total_wins'  
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            field: 'created_at'  
        }
    }, {
        tableName: 'Member',
        timestamps: false,
        underscored: false
    });
};