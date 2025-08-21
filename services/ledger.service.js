const LedgerEntry = require('../models/LedgerEntry.model.js');
const UserLedger = require('../models/UserLedger.model.js');
const mongoose = require('mongoose');

class LedgerService {
    
    /**
     * Create a debit entry when order is created
     */
    static async createDebitEntry(userId, orderId, amount, description = 'Order created') {
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            // Convert string IDs to ObjectIds if needed
            const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
            const orderIdObj = typeof orderId === 'string' ? new mongoose.Types.ObjectId(orderId) : orderId;
            
            // Get or create user ledger
            let userLedger = await UserLedger.findOne({ userId: userIdObj }).session(session);
            if (!userLedger) {
                userLedger = new UserLedger({ 
                    userId: userIdObj, 
                    currentBalance: 0,
                    totalDebits: 0,
                    totalCredits: 0,
                    outstandingAmount: 0
                });
            }
            
            const balanceBefore = userLedger.currentBalance;
            const balanceAfter = balanceBefore + amount;
            
            // Create ledger entry
            const ledgerEntry = new LedgerEntry({
                userId: userIdObj,
                orderId: orderIdObj,
                type: 'debit',
                amount,
                balanceBefore,
                balanceAfter,
                description,
                paymentMethod: 'credit',
                paymentStatus: 'pending'
            });
            
            // Update user ledger
            userLedger.currentBalance = balanceAfter;
            userLedger.totalDebits += amount;
            userLedger.outstandingAmount = userLedger.totalDebits - userLedger.totalCredits;  // ← Allow negative values
            userLedger.lastTransactionDate = new Date();
            userLedger.lastOrderDate = new Date();
            
            // Save both documents
            await Promise.all([
                ledgerEntry.save({ session }),
                userLedger.save({ session })
            ]);
            
            await session.commitTransaction();
            return { success: true, ledgerEntry, userLedger };
            
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
    
    /**
     * Create a credit entry when payment is received or invoice is created
     */
    static async createCreditEntry(userId, orderId, amount, description = 'Payment received', options = {}) {
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            const { invoiceId, paymentMethod = 'ccavenue', transactionId, bankRefNo, trackingId } = options;
            
            // Convert string IDs to ObjectIds if needed
            const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
            const orderIdObj = typeof orderId === 'string' ? new mongoose.Types.ObjectId(orderId) : orderId;
            
            // Get or create user ledger
            let userLedger = await UserLedger.findOne({ userId: userIdObj }).session(session);
            if (!userLedger) {
                userLedger = new UserLedger({ 
                    userId: userIdObj, 
                    currentBalance: 0,
                    totalDebits: 0,
                    totalCredits: 0,
                    outstandingAmount: 0
                });
            }
            
            const balanceBefore = userLedger.currentBalance;
            // For credit entries (payments received), we don't change the current balance
            // The outstanding amount will be reduced instead
            const balanceAfter = balanceBefore;
            
            // Create ledger entry
            const ledgerEntry = new LedgerEntry({
                userId: userIdObj,
                orderId: orderIdObj,
                invoiceId,
                type: 'credit',
                amount,
                balanceBefore,
                balanceAfter,
                description,
                paymentMethod,
                paymentStatus: 'completed',
                transactionId,
                bankRefNo,
                trackingId
            });
            
            // Update user ledger
            userLedger.currentBalance = balanceAfter;
            userLedger.totalCredits += amount;
            // Outstanding amount = total debits - total credits
            userLedger.outstandingAmount = userLedger.totalDebits - userLedger.totalCredits;  // ← Allow negative values
            userLedger.lastTransactionDate = new Date();
            userLedger.lastPaymentDate = new Date();
            
            // Save both documents
            await Promise.all([
                ledgerEntry.save({ session }),
                userLedger.save({ session })
            ]);
            
            await session.commitTransaction();
            return { success: true, ledgerEntry, userLedger };
            
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
    
    /**
     * Get user's current ledger balance and outstanding amount
     */
    static async getUserBalance(userId) {
        try {
            // Convert string ID to ObjectId if needed
            const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
            
            let userLedger = await UserLedger.findOne({ userId: userIdObj });
            
            if (!userLedger) {
                return {
                    currentBalance: 0,
                    totalDebits: 0,
                    totalCredits: 0,
                    outstandingAmount: 0,
                    status: 'active'
                };
            }
            
            return {
                currentBalance: userLedger.currentBalance,
                totalDebits: userLedger.totalDebits,
                totalCredits: userLedger.totalCredits,
                outstandingAmount: userLedger.outstandingAmount,
                status: userLedger.status,
                lastTransactionDate: userLedger.lastTransactionDate,
                lastPaymentDate: userLedger.lastPaymentDate
            };
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Get user's transaction history
     */
    static async getUserTransactions(userId, page = 1, limit = 20) {
        try {
            // Convert string ID to ObjectId if needed
            const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
            
            const skip = (page - 1) * limit;
            
            const transactions = await LedgerEntry.find({ userId: userIdObj })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('orderId', 'fuelQuantity amount')
                .populate('invoiceId', 'invoiceNo totalAmount')
                .lean();
            
            const total = await LedgerEntry.countDocuments({ userId: userIdObj });
            
            return {
                transactions,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalTransactions: total,
                    hasNext: page * limit < total,
                    hasPrev: page > 1
                }
            };
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Get outstanding amount for a user
     */
    static async getOutstandingAmount(userId) {
        try {
            // Convert string ID to ObjectId if needed
            const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
            
            const userLedger = await UserLedger.findOne({ userId: userIdObj });
            return userLedger ? userLedger.outstandingAmount : 0;
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Get admin dashboard summary
     */
    static async getAdminDashboardSummary() {
        try {
            const summary = await UserLedger.aggregate([
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        totalOutstanding: { $sum: '$outstandingAmount' },
                        totalDebits: { $sum: '$totalDebits' },
                        totalCredits: { $sum: '$totalCredits' },
                        averageOutstanding: { $avg: '$outstandingAmount' }
                    }
                }
            ]);
            
            const overdueUsers = await UserLedger.countDocuments({ 
                outstandingAmount: { $gt: 0 },
                lastPaymentDate: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // 30 days
            });
            
            return {
                ...summary[0],
                overdueUsers,
                totalUsers: summary[0]?.totalUsers || 0,
                totalOutstanding: summary[0]?.totalOutstanding || 0,
                totalDebits: summary[0]?.totalDebits || 0,
                totalCredits: summary[0]?.totalCredits || 0,
                averageOutstanding: summary[0]?.averageOutstanding || 0
            };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = LedgerService;
