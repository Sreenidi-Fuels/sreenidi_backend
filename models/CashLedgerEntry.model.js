const mongoose = require('mongoose');

const CashLedgerEntrySchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    entryType: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ['cash', 'qr'], default: 'cash' },
    description: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed, select: false }
}, { timestamps: true });

CashLedgerEntrySchema.index({ orderId: 1, entryType: 1 });
CashLedgerEntrySchema.index({ invoiceId: 1, entryType: 1 });

module.exports = mongoose.model('CashLedgerEntry', CashLedgerEntrySchema);



