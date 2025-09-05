const User = require('../models/User.model.js');
const UserLedger = require('../models/UserLedger.model.js');
const LedgerEntry = require('../models/LedgerEntry.model.js');
const mongoose = require('mongoose');

/**
 * @desc    Record credit payment (User pays back to admin)
 * @route   POST /api/credit/:userId/payment
 * @access  Private
 */
exports.recordCreditPayment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { id: userId } = req.params;
        const { date, amountReceived, amountRefId, paymentMethod } = req.body;
        const allowedMethods = ['ccavenue', 'cash', 'credit', 'bank_transfer', 'upi'];
        const resolvedPaymentMethod = allowedMethods.includes(paymentMethod) ? paymentMethod : 'credit';
        
        // Validate required fields
        if (!date || !amountReceived || !amountRefId) {
            return res.status(400).json({
                success: false,
                error: 'Date, amountReceived, and amountRefId are required'
            });
        }
        
        // Validate amount
        if (amountReceived <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Amount received must be greater than 0'
            });
        }
        
        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Find or create user ledger
        let userLedger = await UserLedger.findOne({ userId });
        if (!userLedger) {
            userLedger = new UserLedger({
                userId: userId,
                totalPaid: 0,
                totalOrders: 0,
                outstandingAmount: 0,
                currentBalance: 0,
                lastTransactionDate: new Date()
            });
        }
        
        // Create CREDIT ledger entry (money received from user)
        const creditEntry = new LedgerEntry({
            userId: userId,
            orderId: new mongoose.Types.ObjectId(), // Generate dummy orderId for credit payments
            type: 'credit', // Money received
            amount: amountReceived,
            balanceBefore: userLedger.outstandingAmount,
            // Admin perspective: outstanding = totalPaid - totalOrders
            balanceAfter: (userLedger.totalPaid + amountReceived) - userLedger.totalOrders,
            description: `Credit payment received - ${amountRefId}`,
            paymentMethod: resolvedPaymentMethod,
            paymentStatus: 'completed',
            transactionId: amountRefId,
            bankRefNo: amountRefId,
            trackingId: amountRefId
        });
        
        await creditEntry.save({ session });
        
        // Update user ledger (totals + outstanding)
        const previousOutstanding = userLedger.outstandingAmount;
        userLedger.totalPaid += amountReceived;  // ✅ Money received from user
        userLedger.outstandingAmount = userLedger.totalPaid - userLedger.totalOrders;
        userLedger.lastTransactionDate = new Date(date);
        
        await userLedger.save({ session });
        
        // Recompute credit capacity centrally (credit orders − credit repayments only)
        let amountOfCreditAvailable = 0;
        try {
            const LedgerService = require('../services/ledger.service.js');
            const { amountOfCreditAvailable: avail } = await LedgerService.updateUserCreditAvailability(userId);
            amountOfCreditAvailable = avail || 0;
        } catch (e) {
            console.warn('⚠️ Failed to refresh credit availability after credit payment:', e.message);
        }
        
        await session.commitTransaction();
        
        console.log('✅ Credit payment recorded successfully:', {
            userId,
            amountReceived,
            previousOutstanding,
            newOutstanding: userLedger.outstandingAmount,
            amountOfCreditAvailable
        });
        
        res.status(201).json({
            success: true,
            message: 'Credit payment recorded successfully',
            data: {
                paymentId: creditEntry._id,
                amountReceived,
                previousOutstanding,
                newOutstanding: userLedger.outstandingAmount,
                amountOfCreditAvailable,
                totalPaid: userLedger.totalPaid,
                totalOrders: userLedger.totalOrders
            }
        });
        
    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Error recording credit payment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to record credit payment',
            details: error.message
        });
    } finally {
        session.endSession();
    }
};

/**
 * @desc    Record debit payment (Admin pays user)
 * @route   POST /api/credit/:userId/debit
 * @access  Private
 */
exports.recordDebitPayment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { id: userId } = req.params;
        const { date, amountPaid, amountRefId, paymentMethod } = req.body;
        const allowedMethods = ['ccavenue', 'cash', 'credit', 'bank_transfer', 'upi'];
        const resolvedPaymentMethod = allowedMethods.includes(paymentMethod) ? paymentMethod : 'credit';
        
        // Validate required fields
        if (!date || !amountPaid || !amountRefId) {
            return res.status(400).json({
                success: false,
                error: 'Date, amountPaid, and amountRefId are required'
            });
        }
        
        // Validate amount
        if (amountPaid <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Amount paid must be greater than 0'
            });
        }
        
        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Find or create user ledger
        let userLedger = await UserLedger.findOne({ userId });
        if (!userLedger) {
            userLedger = new UserLedger({
                userId: userId,
                totalPaid: 0,
                totalOrders: 0,
                outstandingAmount: 0,
                currentBalance: 0,
                lastTransactionDate: new Date()
            });
        }
        
        // Create DEBIT ledger entry (money paid to user)
        const debitEntry = new LedgerEntry({
            userId: userId,
            orderId: new mongoose.Types.ObjectId(), // Generate dummy orderId for debit payments
            type: 'debit', // Fuel/order delivered
            amount: amountPaid,
            balanceBefore: userLedger.outstandingAmount,
            // Admin perspective: outstanding = totalPaid - totalOrders; increasing totalOrders reduces outstanding
            balanceAfter: (userLedger.totalPaid) - (userLedger.totalOrders + amountPaid),
            description: `Debit payment made - ${amountRefId}`,
            paymentMethod: resolvedPaymentMethod,
            paymentStatus: 'completed',
            transactionId: amountRefId,
            bankRefNo: amountRefId,
            trackingId: amountRefId
        });
        
        await debitEntry.save({ session });
        
        // Update user ledger (totals + outstanding only; capacity unaffected)
        const previousOutstanding = userLedger.outstandingAmount;
        userLedger.totalOrders += amountPaid;  // ✅ Increases delivered value
        userLedger.outstandingAmount = userLedger.totalPaid - userLedger.totalOrders;
        userLedger.lastTransactionDate = new Date(date);
        
        await userLedger.save({ session });
        
        // Recompute credit capacity centrally (should remain unaffected by debit payments)
        let amountOfCreditAvailable = 0;
        try {
            const LedgerService = require('../services/ledger.service.js');
            const { amountOfCreditAvailable: avail } = await LedgerService.updateUserCreditAvailability(userId);
            amountOfCreditAvailable = avail || 0;
        } catch (e) {
            console.warn('⚠️ Failed to refresh credit availability after debit payment:', e.message);
        }
        
        await session.commitTransaction();
        
        console.log('✅ Debit payment recorded successfully:', {
            userId,
            amountPaid,
            previousOutstanding,
            newOutstanding: userLedger.outstandingAmount,
            amountOfCreditAvailable
        });
        
        res.status(201).json({
            success: true,
            message: 'Debit payment recorded successfully',
            data: {
                paymentId: debitEntry._id,
                amountPaid,
                previousOutstanding,
                newOutstanding: userLedger.outstandingAmount,
                amountOfCreditAvailable,
                totalPaid: userLedger.totalPaid,
                totalOrders: userLedger.totalOrders
            }
        });
        
    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Error recording debit payment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to record debit payment',
            details: error.message
        });
    } finally {
        session.endSession();
    }
};

/**
 * @desc    Get credit payment history for a user
 * @route   GET /api/credit/:userId/payments
 * @access  Private
 */
exports.getCreditPaymentHistory = async (req, res) => {
    try {
        const { id: userId } = req.params;
        
        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Get credit and debit entries from our payment APIs
        const payments = await LedgerEntry.find({
            userId: userId,
            type: { $in: ['credit', 'debit'] },
            description: { $regex: /(Credit payment received|Debit payment made)/ }
        }).sort({ createdAt: -1 });
        
        res.json({
            success: true,
            data: {
                userId,
                userName: user.name,
                totalPayments: payments.length,
                payments: payments.map(payment => ({
                    id: payment._id,
                    type: payment.type,
                    amount: payment.amount,
                    description: payment.description,
                    transactionId: payment.transactionId,
                    date: payment.createdAt,
                    paymentMethod: payment.paymentMethod
                }))
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching credit payment history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment history',
            details: error.message
        });
    }
};
