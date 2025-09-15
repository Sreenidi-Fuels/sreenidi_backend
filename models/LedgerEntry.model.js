const mongoose = require("mongoose");

const LedgerEntrySchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User", 
        required: true 
    },
    orderId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Order", 
        required: true  // Always required - use unique ObjectId for balance payments
    },
    invoiceId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Invoice" 
    },
    type: { 
        type: String, 
        enum: ["debit", "credit"], 
        required: true 
    },
    amount: { 
        type: Number, 
        required: true, 
        min: 0 
    },
    balanceBefore: { 
        type: Number, 
        required: true, 
        default: 0 
    },
    balanceAfter: { 
        type: Number, 
        required: true 
    },
    description: { 
        type: String, 
        required: true 
    },
    paymentMethod: { 
        type: String, 
        enum: ["ccavenue", "cash", "credit", "bank_transfer", "upi"], 
        default: "ccavenue" 
    },
    paymentStatus: { 
        type: String, 
        enum: ["pending", "processing", "completed", "failed", "cancelled"], 
        default: "pending" 
    },
    transactionId: String,
    bankRefNo: String,
    trackingId: String,
    deliveredLiters: { 
        type: Number, 
        default: null 
    },
    metadata: { 
        type: mongoose.Schema.Types.Mixed, 
        select: false 
    }
}, { 
    timestamps: true 
});

// Only add compound index for userId + createdAt for better query performance
// Mongoose automatically creates indexes for ObjectId fields (userId, orderId, invoiceId)
LedgerEntrySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("LedgerEntry", LedgerEntrySchema);

