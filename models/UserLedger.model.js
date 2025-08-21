const mongoose = require("mongoose");

const UserLedgerSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User", 
        required: true, 
        unique: true 
    },
    currentBalance: { 
        type: Number, 
        required: true, 
        default: 0, 
        min: 0 
    },
    totalDebits: { 
        type: Number, 
        default: 0, 
        min: 0 
    },
    totalCredits: { 
        type: Number, 
        default: 0, 
        min: 0 
    },
    outstandingAmount: { 
        type: Number, 
        default: 0, 
        min: 0 
    },
    lastTransactionDate: { 
        type: Date, 
        default: Date.now 
    },
    lastPaymentDate: Date,
    lastOrderDate: Date,
    status: { 
        type: String, 
        enum: ["active", "suspended", "overdue"], 
        default: "active" 
    }
}, { 
    timestamps: true 
});

// REMOVE this line - userId is already indexed (unique: true creates index)
// UserLedgerSchema.index({ userId: 1 });

module.exports = mongoose.model("UserLedger", UserLedgerSchema);

