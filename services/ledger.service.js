const LedgerEntry = require('../models/LedgerEntry.model.js');
const UserLedger = require('../models/UserLedger.model.js');
const mongoose = require('mongoose');

class LedgerService {
    /**
     * Cash ledger for driver-initiated cash orders (separate namespace)
     * Creates CREDIT = CustomersCash and DEBIT = order.amount when invoice is finalised
     */
    static async createCashLedgerEntries(orderId, invoiceId, options = {}) {
        const CashLedgerEntry = require('../models/CashLedgerEntry.model.js');
        const Order = require('../models/Order.model.js');
        const Invoice = require('../models/Invoice.model.js');
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const order = await Order.findById(orderId).session(session);
            if (!order) throw new Error('Order not found');
            if (order.paymentType !== 'cash') throw new Error('Not a cash order');

            // Get invoice to use total amount instead of order amount
            const invoice = await Invoice.findById(invoiceId).session(session);
            const invoiceTotalAmount = invoice ? Number(invoice.totalAmount || 0) : Number(order.amount || 0);

            const method = (options.method || 'cash');
            const creditAmount = Number(order.CustomersCash || 0);
            const debitAmount = invoiceTotalAmount; // Use invoice total amount instead of order amount

            // Idempotency: ensure we don't duplicate for the same invoice
            const existing = await CashLedgerEntry.find({ invoiceId }).session(session);
            if (existing && existing.length) {
                await session.commitTransaction();
                return { success: true, skipped: true, reason: 'entries_exist', entries: existing };
            }

            const entriesToSave = [];
            if (creditAmount > 0) {
                entriesToSave.push(new CashLedgerEntry({
                    orderId,
                    invoiceId,
                    entryType: 'credit',
                    amount: creditAmount,
                    method,
                    description: `Cash/QR collected by driver`
                }));
            }
            if (debitAmount > 0) {
                entriesToSave.push(new CashLedgerEntry({
                    orderId,
                    invoiceId,
                    entryType: 'debit',
                    amount: debitAmount,
                    method,
                    description: `Fuel delivered - cash order`
                }));
            }

            if (entriesToSave.length === 0) {
                await session.commitTransaction();
                return { success: true, skipped: true, reason: 'zero_amounts' };
            }

            await CashLedgerEntry.insertMany(entriesToSave, { session });
            await session.commitTransaction();
            return { success: true, entries: entriesToSave };
        } catch (e) {
            await session.abortTransaction();
            throw e;
        } finally {
            session.endSession();
        }
    }
    
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
            
            // Fetch order to get deliveredLiters and CustomersCash
            const Order = require('../models/Order.model.js');
            const order = await Order.findById(orderIdObj).session(session);
            const deliveredLiters = order ? order.deliveredLiters : null;
            
            // For cash payments, use CustomersCash amount instead of the passed amount
            let paymentAmount = amount;
            if (paymentMethod === 'cash' && order && order.CustomersCash !== null && order.CustomersCash !== undefined) {
                paymentAmount = order.CustomersCash;
                console.log(`💰 Cash payment detected: Using CustomersCash (₹${paymentAmount}) instead of passed amount (₹${amount})`);
            }
            
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
            const balanceAfter = balanceBefore + paymentAmount;
            
            // Create ledger entry - ADMIN PERSPECTIVE: Payment = CREDIT (money in)
            const ledgerEntry = new LedgerEntry({
                userId: userIdObj,
                orderId: orderIdObj,
                type: 'credit',            // ← Payment = CREDIT (money in)
                amount: paymentAmount,     // ← Use adjusted amount for cash payments
                balanceBefore,
                balanceAfter,
                description,
                paymentMethod,
                paymentStatus: 'completed',
                transactionId,
                bankRefNo,
                trackingId,
                deliveredLiters
            });
            
            // Update user ledger - ADMIN PERSPECTIVE
            userLedger.currentBalance = balanceAfter;
            userLedger.totalPaid += paymentAmount;           // ← CHANGED: totalPaid increases
            // Outstanding amount = total paid - total orders (admin perspective: negative = user owes admin, positive = admin owes user)
            userLedger.outstandingAmount = userLedger.totalPaid - userLedger.totalOrders;
            userLedger.lastTransactionDate = new Date();
            userLedger.lastPaymentDate = new Date();
            
            // Save both documents
            await Promise.all([
                ledgerEntry.save({ session }),
                userLedger.save({ session })
            ]);
            
            await session.commitTransaction();
            // Update user's credit availability based on latest totals
            try {
                await this.updateUserCreditAvailability(userIdObj);
            } catch (availabilityError) {
                // Non-fatal: log and continue
                console.warn('⚠️ Failed to update user credit availability (payment):', availabilityError.message);
            }
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
            
            // Fetch order to get deliveredLiters and total amount
            const Order = require('../models/Order.model.js');
            const order = await Order.findById(orderIdObj).session(session);
            const deliveredLiters = order ? order.deliveredLiters : null;
            
            // Use the passed amount (which should be invoice total amount for cash payments)
            let deliveryAmount = amount;
            console.log(`🚛 Delivery entry: Using passed amount (₹${deliveryAmount}) for ${paymentMethod} payment`);
            
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
            const balanceAfter = balanceBefore - deliveryAmount;
            
            // Create ledger entry - ADMIN PERSPECTIVE: Delivery = DEBIT (fuel out)
            const ledgerEntry = new LedgerEntry({
                userId: userIdObj,
                orderId: orderIdObj,
                invoiceId,
                type: 'debit',             // ← Delivery = DEBIT (fuel out)
                amount: deliveryAmount,    // ← Use adjusted amount for cash payments
                balanceBefore,
                balanceAfter,
                description,
                paymentMethod,
                paymentStatus: 'completed',
                deliveredLiters
            });
            
            // Update user ledger - ADMIN PERSPECTIVE
            userLedger.currentBalance = balanceAfter;
            userLedger.totalOrders += deliveryAmount;       // ← CHANGED: totalOrders increases (fuel delivered)
            // Outstanding amount = total paid - total orders (admin perspective: negative = user owes admin, positive = admin owes user)
            userLedger.outstandingAmount = userLedger.totalPaid - userLedger.totalOrders;
            
            // Save both documents
            await Promise.all([
                ledgerEntry.save({ session }),
                userLedger.save({ session })
            ]);
            
            await session.commitTransaction();
            // Update user's credit availability based on latest totals
            try {
                await this.updateUserCreditAvailability(userIdObj);
            } catch (availabilityError) {
                // Non-fatal: log and continue
                console.warn('⚠️ Failed to update user credit availability (delivery):', availabilityError.message);
            }
            return { success: true, ledgerEntry, userLedger };
            
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
    
    /**
     * Create a CREDIT entry when payment is received (ADMIN PERSPECTIVE: Money coming IN)
     * Alias for createPaymentEntry for backward compatibility
     */
    static async createCreditEntry(userId, orderId, amount, description = 'Payment received', options = {}) {
        return this.createPaymentEntry(userId, orderId, amount, description, options);
    }
    
    /**
     * Create a DEBIT entry when fuel is delivered (ADMIN PERSPECTIVE: Fuel delivered OUT)
     * Alias for createDeliveryEntry for backward compatibility
     */
    static async createDebitEntry(userId, orderId, amount, description = 'Fuel delivered', options = {}) {
        return this.createDeliveryEntry(userId, orderId, amount, description, options);
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
                .populate('orderId', 'fuelQuantity amount deliveredLiters')
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
            // Join with Users to ensure we count real credited users and aggregate only over them
            const summaryAgg = await UserLedger.aggregate([
                { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
                { $unwind: { path: '$user', preserveNullAndEmptyArrays: false } },
                // Consider only credited users in admin summary
                { $match: { 'user.role': 'credited' } },
                {
                    $group: {
                        _id: null,
                        totalUsers: { $addToSet: '$userId' },
                        totalOutstanding: { $sum: '$outstandingAmount' },
                        totalPaid: { $sum: '$totalPaid' },
                        totalOrders: { $sum: '$totalOrders' },
                        averageOutstanding: { $avg: '$outstandingAmount' }
                    }
                },
                { $project: {
                    _id: 0,
                    totalUsers: { $size: '$totalUsers' },
                    totalOutstanding: 1,
                    totalPaid: 1,
                    totalOrders: 1,
                    averageOutstanding: 1
                } }
            ]);

            // Overdue users: credited users with negative outstanding and last payment older than 30 days
            const overdueAgg = await UserLedger.aggregate([
                { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
                { $unwind: { path: '$user', preserveNullAndEmptyArrays: false } },
                { $match: { 'user.role': 'credited', outstandingAmount: { $lt: 0 }, lastPaymentDate: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
                { $count: 'count' }
            ]);

            const summary = summaryAgg[0] || { totalUsers: 0, totalOutstanding: 0, totalPaid: 0, totalOrders: 0, averageOutstanding: 0 };
            const overdueUsers = overdueAgg[0]?.count || 0;

            return {
                _id: null,
                totalUsers: summary.totalUsers,
                totalOutstanding: summary.totalOutstanding,
                totalPaid: summary.totalPaid,
                totalOrders: summary.totalOrders,
                averageOutstanding: summary.averageOutstanding,
                overdueUsers
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
            const outstandingAmount = totalPaid - totalOrders;  // ← CHANGED: Paid - Orders (admin perspective: negative = user owes admin)
            
            console.log('💰 Outstanding amount calculation:', `${totalPaid} - ${totalOrders} = ${outstandingAmount}`);
            
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
            
            // Update user's credit availability based on latest totals
            try {
                await this.updateUserCreditAvailability(userIdObj);
            } catch (availabilityError) {
                console.warn('⚠️ Failed to update user credit availability (recalc):', availabilityError.message);
            }
            return { totalPaid, totalOrders, outstandingAmount };
        } catch (error) {
            console.error('❌ Error recalculating user ledger:', error);
            throw error;
        }
    }

    /**
     * Update User.creditLimitUsed and amountOfCreditAvailable using business rules:
     * - creditLimitUsed is driven by credit orders minus repayments recorded via credit-payment API
     * - debit-payment entries must NOT affect availability
     * - Clamp used to [0, creditLimit]
     */
    static async updateUserCreditAvailability(userId) {
        const User = require('../models/User.model.js');
        const Order = require('../models/Order.model.js');
        const LedgerEntry = require('../models/LedgerEntry.model.js');
        const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
        const user = await User.findById(userIdObj);
        if (!user) return;

        // Sum all credit orders that are still within the lifecycle
        const creditOrders = await Order.find({
            userId: userIdObj,
            paymentType: 'credit',
            'tracking.dispatch.status': { $in: ['pending', 'dispatched', 'completed'] }
        }).select('amount totalAmount');
        const creditOrdersTotal = creditOrders.reduce((sum, o) => {
            // Use totalAmount if available, otherwise fall back to amount
            const orderAmount = o.totalAmount !== null && o.totalAmount !== undefined ? o.totalAmount : o.amount;
            return sum + (Number(orderAmount) || 0);
        }, 0);

        // Sum credit payments recorded by credit-payment API (description starts with 'Credit payment received')
        const creditPayments = await LedgerEntry.aggregate([
            { $match: { userId: userIdObj, type: 'credit', description: { $regex: /^Credit payment received/ } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const creditPaymentsTotal = creditPayments.length ? creditPayments[0].total : 0;

        // Compute usage and availability
        const creditLimit = user.creditLimit || 0;
        const usedRaw = Math.max(0, creditOrdersTotal - creditPaymentsTotal);
        const creditLimitUsed = Math.min(usedRaw, creditLimit);
        const amountOfCreditAvailable = Math.max(0, creditLimit - creditLimitUsed);

        // Persist on User
        user.creditLimitUsed = creditLimitUsed;
        user.amountOfCreditAvailable = amountOfCreditAvailable;
        user.lastTransactionDate = new Date();
        await user.save();
        return { creditLimitUsed, amountOfCreditAvailable };
    }

    /**
     * Compute (without persisting) user's credit availability using the same rules as updateUserCreditAvailability
     */
    static async computeCreditAvailability(userId) {
        const User = require('../models/User.model.js');
        const Order = require('../models/Order.model.js');
        const LedgerEntry = require('../models/LedgerEntry.model.js');
        const userIdObj = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
        const user = await User.findById(userIdObj);
        if (!user) return { creditLimitUsed: 0, amountOfCreditAvailable: 0, creditLimit: 0 };

        const creditOrders = await Order.find({
            userId: userIdObj,
            paymentType: 'credit',
            'tracking.dispatch.status': { $in: ['pending', 'dispatched', 'completed'] }
        }).select('amount totalAmount');
        const creditOrdersTotal = creditOrders.reduce((sum, o) => {
            // Use totalAmount if available, otherwise fall back to amount
            const orderAmount = o.totalAmount !== null && o.totalAmount !== undefined ? o.totalAmount : o.amount;
            return sum + (Number(orderAmount) || 0);
        }, 0);

        const creditPayments = await LedgerEntry.aggregate([
            { $match: { userId: userIdObj, type: 'credit', description: { $regex: /^Credit payment received/ } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const creditPaymentsTotal = creditPayments.length ? creditPayments[0].total : 0;

        const creditLimit = user.creditLimit || 0;
        const usedRaw = Math.max(0, creditOrdersTotal - creditPaymentsTotal);
        const creditLimitUsed = Math.min(usedRaw, creditLimit);
        const amountOfCreditAvailable = Math.max(0, creditLimit - creditLimitUsed);
        return { creditLimitUsed, amountOfCreditAvailable, creditLimit };
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
