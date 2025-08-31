const User = require('../models/User.model.js');
const UserLedger = require('../models/UserLedger.model.js');
const LedgerService = require('../services/ledger.service.js');
const LedgerEntry = require('../models/LedgerEntry.model.js');

/**
 * @desc    Get comprehensive credit information for a user
 * @route   GET /api/credit/:id/details
 * @access  Public
 */
const getCreditDetails = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get user with credit details
        const user = await User.findById(id).select('name companyName role creditFuelRate creditLimit');
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Get user's ledger information
        const userLedger = await UserLedger.findOne({ userId: id });
        
        // Calculate credit information
        const creditInfo = {
            userId: user._id,
            name: user.name,
            companyName: user.companyName,
            role: user.role,
            userSpecificRate: user.creditFuelRate,
            creditLimit: user.creditLimit || 0,
            isCreditEligible: user.role === 'credited',
            currentBalance: userLedger?.currentBalance || 0,
            totalPaid: userLedger?.totalPaid || 0,
            totalOrders: userLedger?.totalOrders || 0,
            outstandingAmount: userLedger?.outstandingAmount || 0,
            amountOfCreditAvailable: 0,
            canPlaceOrder: false
        };
        
        // Calculate amount of credit available
        if (user.role === 'credited' && user.creditLimit) {
            creditInfo.amountOfCreditAvailable = Math.max(0, user.creditLimit - creditInfo.outstandingAmount);
            creditInfo.canPlaceOrder = creditInfo.amountOfCreditAvailable > 0;
        }
        
        res.json({ success: true, data: creditInfo });
        
    } catch (err) {
        console.error('Error getting user credit info:', err);
        res.status(500).json({ success: false, error: 'Failed to get credit information' });
    }
};

/**
 * @desc    Update user credit details (creditLimit, creditFuelRate)
 * @route   PUT /api/credit/:id/details
 * @access  Public
 */
const updateCreditDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { creditLimit, creditFuelRate, role } = req.body;
        
        // Validate input
        if (creditLimit !== undefined && creditLimit < 0) {
            return res.status(400).json({ success: false, error: 'Credit limit cannot be negative' });
        }
        
        if (creditFuelRate !== undefined && creditFuelRate < 0) {
            return res.status(400).json({ success: false, error: 'Credit fuel rate cannot be negative' });
        }
        
        // Update user credit details
        const updateData = {};
        if (creditLimit !== undefined) updateData.creditLimit = creditLimit;
        if (creditFuelRate !== undefined) updateData.creditFuelRate = creditFuelRate;
        if (role !== undefined) updateData.role = role;
        
        const user = await User.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select('name companyName role creditFuelRate creditLimit');
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Get updated credit information
        const userLedger = await UserLedger.findOne({ userId: id });
        
        const updatedCreditInfo = {
            userId: user._id,
            name: user.name,
            companyName: user.companyName,
            role: user.role,
            userSpecificRate: user.creditFuelRate,
            creditLimit: user.creditLimit || 0,
            isCreditEligible: user.role === 'credited',
            outstandingAmount: userLedger?.outstandingAmount || 0,
            amountOfCreditAvailable: Math.max(0, (user.creditLimit || 0) - (userLedger?.outstandingAmount || 0))
        };
        
        res.json({ success: true, message: 'Credit details updated successfully', data: updatedCreditInfo });
        
    } catch (err) {
        console.error('Error updating credit details:', err);
        res.status(500).json({ success: false, error: 'Failed to update credit details' });
    }
};

/**
 * @desc    Record a credit payment from user
 * @route   POST /api/credit/:id/payment
 * @access  Public
 */
const recordCreditPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { date, amountReceived, amountRefId } = req.body;
        
        // Validate input
        if (!amountReceived || amountReceived <= 0) {
            return res.status(400).json({ success: false, error: 'Amount received must be positive' });
        }
        
        if (!amountRefId) {
            return res.status(400).json({ success: false, error: 'Transaction reference ID is required' });
        }
        
        // Get user and validate credit eligibility
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        if (user.role !== 'credited') {
            return res.status(400).json({ success: false, error: 'User is not eligible for credit' });
        }
        
        // Get or create user ledger
        let userLedger = await UserLedger.findOne({ userId: id });
        if (!userLedger) {
            userLedger = new UserLedger({ 
                userId: id, 
                currentBalance: 0,
                totalPaid: 0,
                totalOrders: 0,
                outstandingAmount: 0
            });
        }
        
        // Create CREDIT ledger entry for payment received
        const creditResult = await LedgerService.createPaymentEntry(
            id,
            null, // No specific order for credit payments
            amountReceived,
            `Credit payment received - ${amountRefId}`,
            {
                paymentMethod: 'credit',
                transactionId: amountRefId,
                bankRefNo: amountRefId,
                trackingId: amountRefId
            }
        );
        
        // Get updated credit information
        const updatedUserLedger = await UserLedger.findOne({ userId: id });
        
        const paymentInfo = {
            payment: {
                date: date || new Date(),
                amountReceived,
                amountRefId
            },
            updatedCredit: {
                creditLimit: user.creditLimit || 0,
                outstandingAmount: updatedUserLedger.outstandingAmount,
                amountOfCreditAvailable: Math.max(0, (user.creditLimit || 0) - updatedUserLedger.outstandingAmount)
            }
        };
        
        res.json({ 
            success: true, 
            message: 'Credit payment recorded successfully', 
            data: paymentInfo 
        });
        
    } catch (err) {
        console.error('Error recording credit payment:', err);
        res.status(500).json({ success: false, error: 'Failed to record credit payment' });
    }
};

/**
 * @desc    Get credit payment history for a user
 * @route   GET /api/credit/:id/payment
 * @access  Public
 */
const getCreditPaymentHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        
        // Validate user exists
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Get credit payment history from ledger entries
        const payments = await LedgerEntry.find({
            userId: id,
            type: 'credit',
            paymentMethod: 'credit'
        })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .select('amount description paymentMethod transactionId createdAt');
        
        const total = await LedgerEntry.countDocuments({
            userId: id,
            type: 'credit',
            paymentMethod: 'credit'
        });
        
        res.json({
            success: true,
            data: {
                payments,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    itemsPerPage: parseInt(limit)
                }
            }
        });
        
    } catch (err) {
        console.error('Error getting credit payment history:', err);
        res.status(500).json({ success: false, error: 'Failed to get payment history' });
    }
};

/**
 * @desc    Update existing credit payment record
 * @route   PUT /api/credit/:id/payment
 * @access  Public
 */
const updateCreditPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentId, date, amountReceived, amountRefId } = req.body;
        
        if (!paymentId) {
            return res.status(400).json({ success: false, error: 'Payment ID is required' });
        }
        
        // Find and update the payment record
        const payment = await LedgerEntry.findOneAndUpdate(
            {
                _id: paymentId,
                userId: id,
                type: 'credit',
                paymentMethod: 'credit'
            },
            {
                amount: amountReceived,
                description: `Credit payment received - ${amountRefId}`,
                transactionId: amountRefId,
                bankRefNo: amountRefId,
                trackingId: amountRefId
            },
            { new: true }
        );
        
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment record not found' });
        }
        
        // Recalculate user ledger
        await LedgerService.recalculateUserLedger(id);
        
        // Get updated credit information
        const user = await User.findById(id);
        const userLedger = await UserLedger.findOne({ userId: id });
        
        const updatedInfo = {
            payment: {
                id: payment._id,
                date: date || payment.createdAt,
                amountReceived: payment.amount,
                amountRefId: payment.transactionId
            },
            updatedCredit: {
                creditLimit: user.creditLimit || 0,
                outstandingAmount: userLedger.outstandingAmount,
                amountOfCreditAvailable: Math.max(0, (user.creditLimit || 0) - userLedger.outstandingAmount)
            }
        };
        
        res.json({ 
            success: true, 
            message: 'Credit payment updated successfully', 
            data: updatedInfo 
        });
        
    } catch (err) {
        console.error('Error updating credit payment:', err);
        res.status(500).json({ success: false, error: 'Failed to update credit payment' });
    }
};

/**
 * @desc    Validate if user can place credit order
 * @route   POST /api/credit/:id/validate-order
 * @access  Public
 */
const validateCreditOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { orderAmount } = req.body;
        
        if (!orderAmount || orderAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Order amount must be positive' });
        }
        
        // Get user credit information
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        if (user.role !== 'credited') {
            return res.status(400).json({ 
                success: false, 
                error: 'User is not eligible for credit orders',
                canPlaceOrder: false 
            });
        }
        
        // Get user ledger
        const userLedger = await UserLedger.findOne({ userId: id });
        const outstandingAmount = userLedger?.outstandingAmount || 0;
        const creditLimit = user.creditLimit || 0;
        const amountOfCreditAvailable = Math.max(0, creditLimit - outstandingAmount);
        
        const canPlaceOrder = orderAmount <= amountOfCreditAvailable;
        
        const validationResult = {
            canPlaceOrder,
            orderAmount,
            creditLimit,
            outstandingAmount,
            amountOfCreditAvailable,
            remainingCreditAfterOrder: canPlaceOrder ? amountOfCreditAvailable - orderAmount : amountOfCreditAvailable
        };
        
        if (!canPlaceOrder) {
            validationResult.error = `Order amount (₹${orderAmount}) exceeds available credit (₹${amountOfCreditAvailable})`;
        }
        
        res.json({ 
            success: true, 
            data: validationResult 
        });
        
    } catch (err) {
        console.error('Error validating credit order:', err);
        res.status(500).json({ success: false, error: 'Failed to validate credit order' });
    }
};

module.exports = {
    getCreditDetails,
    updateCreditDetails,
    recordCreditPayment,
    getCreditPaymentHistory,
    updateCreditPayment,
    validateCreditOrder
};

