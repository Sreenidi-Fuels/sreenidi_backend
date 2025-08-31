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
            balanceAfter: Math.max(0, userLedger.totalOrders - (userLedger.totalPaid + amountReceived)),
            description: `Credit payment received - ${amountRefId}`,
            paymentMethod: resolvedPaymentMethod,
            paymentStatus: 'completed',
            transactionId: amountRefId,
            bankRefNo: amountRefId,
            trackingId: amountRefId
        });
        
        await creditEntry.save({ session });
        
        // Update user ledger
        const previousOutstanding = userLedger.outstandingAmount;
        userLedger.totalPaid += amountReceived;  // ✅ Money received from user (like cash/ccavenue)
        userLedger.outstandingAmount = Math.max(0, userLedger.totalOrders - userLedger.totalPaid);
        userLedger.lastTransactionDate = new Date(date);
        
        await userLedger.save({ session });
        
        // Calculate new credit availability with automatic credit release
        let amountOfCreditAvailable = 0;
        if (user.role === 'credited' && user.creditLimit > 0) {
            // Get credit orders total - but exclude orders with finalised invoices that have been paid
            const Order = require('../models/Order.model.js');
            const Invoice = require('../models/Invoice.model.js');
            
            // Get all credit orders
            const creditOrders = await Order.find({
                userId: userId,
                paymentType: 'credit',
                'tracking.dispatch.status': { $in: ['pending', 'dispatched', 'completed'] }
            });
            
            let creditLimitUsed = 0;
            
            // Check each order to see if it should still count toward credit limit
            for (const order of creditOrders) {
                // Check if this order has a finalised invoice
                const invoice = await Invoice.findOne({ 
                    orderId: order._id, 
                    status: 'finalised' 
                });
                
                if (invoice) {
                    // Order has finalised invoice - check if it's been paid
                    // If the payment amount covers this order, don't count it toward credit limit
                    const orderAmount = order.amount || 0;
                    if (amountReceived >= orderAmount) {
                        // This order is fully paid, don't count it toward credit limit
                        console.log(`✅ Order ${order._id} (₹${orderAmount}) is fully paid - not counting toward credit limit`);
                    } else {
                        // This order is partially paid, count remaining amount
                        const remainingAmount = orderAmount - amountReceived;
                        creditLimitUsed += remainingAmount;
                        console.log(`⚠️ Order ${order._id} (₹${orderAmount}) is partially paid - counting ₹${remainingAmount} toward credit limit`);
                    }
                } else {
                    // Order doesn't have finalised invoice yet - count it toward credit limit
                    creditLimitUsed += (order.amount || 0);
                    console.log(`💳 Order ${order._id} (₹${order.amount}) has no finalised invoice - counting toward credit limit`);
                }
            }
            
            amountOfCreditAvailable = Math.max(0, user.creditLimit - creditLimitUsed);
            console.log(`💰 Credit calculation: Limit: ₹${user.creditLimit}, Used: ₹${creditLimitUsed}, Available: ₹${amountOfCreditAvailable}`);
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
            balanceAfter: Math.max(0, (userLedger.totalOrders + amountPaid) - userLedger.totalPaid),
            description: `Debit payment made - ${amountRefId}`,
            paymentMethod: resolvedPaymentMethod,
            paymentStatus: 'completed',
            transactionId: amountRefId,
            bankRefNo: amountRefId,
            trackingId: amountRefId
        });
        
        await debitEntry.save({ session });
        
        // Update user ledger
        const previousOutstanding = userLedger.outstandingAmount;
        userLedger.totalOrders += amountPaid;  // ✅ Fuel/order delivered (like cash/ccavenue)
        userLedger.outstandingAmount = Math.max(0, userLedger.totalOrders - userLedger.totalPaid);
        userLedger.lastTransactionDate = new Date(date);
        
        await userLedger.save({ session });
        
        // Calculate new credit availability
        let amountOfCreditAvailable = 0;
        if (user.role === 'credited' && user.creditLimit > 0) {
            // Get credit orders total
            const Order = require('../models/Order.model.js');
            const creditOrders = await Order.find({
                userId: userId,
                paymentType: 'credit',
                'tracking.dispatch.status': { $in: ['pending', 'dispatched', 'completed'] }
            });
            
            const creditLimitUsed = creditOrders.reduce((sum, order) => sum + (order.amount || 0), 0);
            amountOfCreditAvailable = Math.max(0, user.creditLimit - creditLimitUsed);
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
