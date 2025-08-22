const LedgerEntry = require('../models/LedgerEntry.model.js');
const UserLedger = require('../models/UserLedger.model.js');
const mongoose = require('mongoose');

class LedgerService {
    
    /**
     * Create a CREDIT entry when payment is received (ADMIN PERSPECTIVE: Money coming IN)
     */
    static async createPaymentEntry(userId, orderId, amount, description = 'Payment received', options = {}) {
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            const { transactionId, bankRefNo, trackingId, paymentMethod = 'ccavenue' } = options;
            
            // Convert string IDs to ObjectIds if needed
            const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
            const orderIdObj = typeof orderId === 'string' ? new mongoose.Types.ObjectId(orderId) : orderId;
            
            // Get or create user ledger
            let userLedger = await UserLedger.findOne({ userId: userIdObj }).session(session);
            if (!userLedger) {
                userLedger = new UserLedger({ 
                    userId: userIdObj, 
                    currentBalance: 0,
                    totalPaid: 0,           // ← CHANGED: totalPaid (money received)
                    totalOrders: 0,         // ← CHANGED: totalOrders (fuel delivered)
                    outstandingAmount: 0
                });
            }
            
            const balanceBefore = userLedger.currentBalance;
            const balanceAfter = balanceBefore + amount;
            
            // Create ledger entry - ADMIN PERSPECTIVE: Payment = CREDIT (money in)
            const ledgerEntry = new LedgerEntry({
                userId: userIdObj,
                orderId: orderIdObj,
                type: 'credit',            // ← Payment = CREDIT (money in)
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
            
            // Update user ledger - ADMIN PERSPECTIVE
            userLedger.currentBalance = balanceAfter;
            userLedger.totalPaid += amount;           // ← CHANGED: totalPaid increases
            // Outstanding amount = total orders - total paid (negative = company owes users fuel)
            userLedger.outstandingAmount = userLedger.totalOrders - userLedger.totalPaid;
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
     * Create a DEBIT entry when fuel is delivered (ADMIN PERSPECTIVE: Fuel delivered OUT)
     */
    static async createDeliveryEntry(userId, orderId, amount, description = 'Fuel delivered', options = {}) {
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            const { invoiceId, paymentMethod = 'credit' } = options;
            
            // Convert string IDs to ObjectIds if needed
            const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
            const orderIdObj = typeof orderId === 'string' ? new mongoose.Types.ObjectId(orderId) : orderId;
            
            // Get or create user ledger
            let userLedger = await UserLedger.findOne({ userId: userIdObj }).session(session);
            if (!userLedger) {
                userLedger = new UserLedger({ 
                    userId: userIdObj, 
                    currentBalance: 0,
                    totalPaid: 0,
                    totalOrders: 0,
                    outstandingAmount: 0
                });
            }
            
            const balanceBefore = userLedger.currentBalance;
            // For delivery entries (fuel delivered), we reduce the current balance
            const balanceAfter = balanceBefore - amount;
            
            // Create ledger entry - ADMIN PERSPECTIVE: Delivery = DEBIT (fuel out)
            const ledgerEntry = new LedgerEntry({
                userId: userIdObj,
                orderId: orderIdObj,
                invoiceId,
                type: 'debit',             // ← Delivery = DEBIT (fuel out)
                amount,
                balanceBefore,
                balanceAfter,
                description,
                paymentMethod,
                paymentStatus: 'completed'
            });
            
            // Update user ledger - ADMIN PERSPECTIVE
            userLedger.currentBalance = balanceAfter;
            userLedger.totalOrders += amount;       // ← CHANGED: totalOrders increases (fuel delivered)
            // Outstanding amount = total orders - total paid (negative = company owes users fuel)
            userLedger.outstandingAmount = userLedger.totalOrders - userLedger.totalPaid;
            userLedger.lastTransactionDate = new Date();
            
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
            
            console.log('🔍 getUserBalance - Raw UserLedger from DB:', {
                userId: userIdObj,
                totalPaid: userLedger?.totalPaid,
                totalOrders: userLedger?.totalOrders,
                outstandingAmount: userLedger?.outstandingAmount
            });
            
            if (!userLedger) {
                console.log('⚠️ No UserLedger found, returning defaults');
                return {
                    currentBalance: 0,
                    totalPaid: 0,           // ← CHANGED: totalPaid
                    totalOrders: 0,         // ← CHANGED: totalOrders
                    outstandingAmount: 0,
                    status: 'active'
                };
            }
            
            const result = {
                currentBalance: userLedger.currentBalance,
                totalPaid: userLedger.totalPaid,           // ← CHANGED: totalPaid
                totalOrders: userLedger.totalOrders,       // ← CHANGED: totalOrders
                outstandingAmount: userLedger.outstandingAmount,
                status: userLedger.status,
                lastTransactionDate: userLedger.lastTransactionDate,
                lastPaymentDate: userLedger.lastPaymentDate
            };
            
            console.log('📤 getUserBalance - Returning result:', result);
            return result;
        } catch (error) {
            console.error('❌ Error in getUserBalance:', error);
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
                        totalPaid: { $sum: '$totalPaid' },           // ← CHANGED: totalPaid
                        totalOrders: { $sum: '$totalOrders' },       // ← CHANGED: totalOrders
                        averageOutstanding: { $avg: '$outstandingAmount' }
                    }
                }
            ]);
            
            const overdueUsers = await UserLedger.countDocuments({ 
                outstandingAmount: { $lt: 0 },  // ← CHANGED: Negative outstanding = company owes users fuel
                lastPaymentDate: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // 30 days
            });
            
            return {
                ...summary[0],
                overdueUsers,
                totalUsers: summary[0]?.totalUsers || 0,
                totalOutstanding: summary[0]?.totalOutstanding || 0,
                totalPaid: summary[0]?.totalPaid || 0,           // ← CHANGED: totalPaid
                totalOrders: summary[0]?.totalOrders || 0,       // ← CHANGED: totalOrders
                averageOutstanding: summary[0]?.averageOutstanding || 0
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Recalculate user ledger totals and outstanding amount
     */
    static async recalculateUserLedger(userId) {
        try {
            const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
            
            // Get all ledger entries for the user
            const entries = await LedgerEntry.find({ userId: userIdObj });
            
            console.log('🔍 Found ledger entries:', entries.length);
            entries.forEach(entry => {
                console.log(`  - ${entry.type}: ₹${entry.amount} (${entry.description})`);
            });
            
            // Calculate totals - ADMIN PERSPECTIVE
            let totalPaid = 0;        // ← CHANGED: totalPaid (payments received)
            let totalOrders = 0;      // ← CHANGED: totalOrders (fuel delivered)
            
            entries.forEach(entry => {
                if (entry.type === 'credit') {      // ← CHANGED: credit = payments received (money in)
                    totalPaid += entry.amount;
                } else if (entry.type === 'debit') { // ← CHANGED: debit = fuel delivered (fuel out)
                    totalOrders += entry.amount;
                }
            });
            
            console.log('🧮 Calculated totals:', { totalPaid, totalOrders });
            
            // Calculate outstanding amount - ADMIN PERSPECTIVE
            const outstandingAmount = totalOrders - totalPaid;  // ← CHANGED: Orders - Paid
            
            console.log('💰 Outstanding amount calculation:', `${totalOrders} - ${totalPaid} = ${outstandingAmount}`);
            
            // Update user ledger using findOneAndUpdate for atomic operation
            console.log('💾 Updating UserLedger in database...');
            const updatedLedger = await UserLedger.findOneAndUpdate(
                { userId: userIdObj },
                {
                    $set: {
                        totalPaid: totalPaid,           // ← CHANGED: totalPaid
                        totalOrders: totalOrders,       // ← CHANGED: totalOrders
                        outstandingAmount: outstandingAmount,
                        lastTransactionDate: new Date()
                    }
                },
                { new: true, runValidators: true }  // Return updated document
            );
            
            if (updatedLedger) {
                console.log('📊 After database update - UserLedger:', {
                    totalPaid: updatedLedger.totalPaid,
                    totalOrders: updatedLedger.totalOrders,
                    outstandingAmount: updatedLedger.outstandingAmount
                });
                
                console.log('✅ User ledger recalculated successfully:', {
                    userId: userIdObj,
                    totalPaid,           // ← CHANGED: totalPaid
                    totalOrders,         // ← CHANGED: totalOrders
                    outstandingAmount
                });
            } else {
                console.log('⚠️ No UserLedger found to update');
            }
            
            return { totalPaid, totalOrders, outstandingAmount };
        } catch (error) {
            console.error('❌ Error recalculating user ledger:', error);
            throw error;
        }
    }
    
    /**
     * 🔧 PRODUCTION-GRADE: Auto-recover missing ledger entries
     * This method automatically finds and creates missing CREDIT entries for completed payments
     */
    static async autoRecoverMissingEntries(userId) {
        try {
            const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
            
            console.log('🔧 Auto-recovering missing ledger entries for user:', userId);
            
            // Find orders with completed payments but missing ledger entries
            const Order = require('../models/Order.model.js');
            const ordersWithMissingEntries = await Order.find({
                userId: userIdObj,
                'paymentDetails.status': 'completed',
                $or: [
                    { 'paymentDetails.ledgerEntryCreated': { $ne: true } },
                    { 'paymentDetails.ledgerEntryCreated': { $exists: false } }
                ]
            });
            
            console.log('🔍 Found orders with missing ledger entries:', ordersWithMissingEntries.length);
            
            let recoveredCount = 0;
            let errors = [];
            
            for (const order of ordersWithMissingEntries) {
                try {
                    console.log('🔄 Recovering ledger entry for order:', order._id, 'Amount:', order.amount);
                    
                    // Check if ledger entry already exists
                    const existingEntry = await LedgerEntry.findOne({
                        userId: userIdObj,
                        orderId: order._id,
                        type: 'credit'
                    });
                    
                    if (existingEntry) {
                        console.log('✅ Ledger entry already exists for order:', order._id);
                        // Mark as created in order
                        await Order.findByIdAndUpdate(order._id, {
                            $set: {
                                'paymentDetails.ledgerEntryCreated': true,
                                'paymentDetails.ledgerEntryId': existingEntry._id,
                                'paymentDetails.ledgerCreatedAt': existingEntry.createdAt
                            }
                        });
                        continue;
                    }
                    
                    // Create missing CREDIT entry
                    const ledgerResult = await this.createPaymentEntry(
                        userIdObj,
                        order._id,
                        order.amount,
                        `Payment received via ${order.paymentDetails?.method || 'online'} - ${order.fuelQuantity}L fuel (Auto-recovered)`,
                        {
                            paymentMethod: order.paymentDetails?.method || 'online',
                            transactionId: order.paymentDetails?.transactionId,
                            bankRefNo: order.paymentDetails?.bankRefNo,
                            trackingId: order.paymentDetails?.trackingId
                        }
                    );
                    
                    // Mark as created in order
                    await Order.findByIdAndUpdate(order._id, {
                        $set: {
                            'paymentDetails.ledgerEntryCreated': true,
                            'paymentDetails.ledgerEntryId': ledgerResult.ledgerEntry._id,
                            'paymentDetails.ledgerCreatedAt': new Date(),
                            'paymentDetails.requiresManualReview': false
                        }
                    });
                    
                    console.log('✅ Successfully recovered ledger entry for order:', order._id);
                    recoveredCount++;
                    
                } catch (orderError) {
                    console.error('❌ Failed to recover ledger entry for order:', order._id, orderError.message);
                    errors.push({ orderId: order._id, error: orderError.message });
                    
                    // Mark for manual review
                    await Order.findByIdAndUpdate(order._id, {
                        $set: {
                            'paymentDetails.requiresManualReview': true,
                            'paymentDetails.ledgerError': orderError.message,
                            'paymentDetails.ledgerErrorAt': new Date()
                        }
                    });
                }
            }
            
            // Recalculate ledger after recovery
            if (recoveredCount > 0) {
                console.log('🔄 Recalculating ledger after recovery...');
                await this.recalculateUserLedger(userId);
            }
            
            return {
                success: true,
                recoveredCount,
                totalOrders: ordersWithMissingEntries.length,
                errors
            };
            
        } catch (error) {
            console.error('❌ Error in auto-recovery:', error);
            throw error;
        }
    }
}

module.exports = LedgerService;
