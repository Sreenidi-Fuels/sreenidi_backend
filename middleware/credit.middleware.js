const User = require('../models/User.model.js');
const UserLedger = require('../models/UserLedger.model.js');

/**
 * Middleware to validate credit orders before creation
 * Prevents users from placing orders that exceed their available credit
 */
const validateCreditOrder = async (req, res, next) => {
    try {
        const { userId, amount, paymentType } = req.body;
        
        // Only validate credit orders
        if (paymentType !== 'credit') {
            return next();
        }
        
        // Validate required fields
        if (!userId || !amount) {
            return res.status(400).json({
                success: false,
                error: 'User ID and amount are required for credit validation'
            });
        }
        
        // Get user credit information
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Check if user is eligible for credit
        if (user.role !== 'credited') {
            return res.status(400).json({
                success: false,
                error: 'User is not eligible for credit orders'
            });
        }
        
        // Get user's current credit status
        const userLedger = await UserLedger.findOne({ userId });
        const outstandingAmount = userLedger?.outstandingAmount || 0;
        const creditLimit = user.creditLimit || 0;
        
        // Calculate available credit
        const amountOfCreditAvailable = Math.max(0, creditLimit - outstandingAmount);
        
        // Check if order amount exceeds available credit
        if (amount > amountOfCreditAvailable) {
            return res.status(400).json({
                success: false,
                error: `Order amount (₹${amount}) exceeds available credit (₹${amountOfCreditAvailable})`,
                creditInfo: {
                    creditLimit,
                    outstandingAmount,
                    amountOfCreditAvailable,
                    requestedAmount: amount
                }
            });
        }
        
        // Add credit information to request for controller use
        req.creditInfo = {
            creditLimit,
            outstandingAmount,
            amountOfCreditAvailable,
            remainingCreditAfterOrder: amountOfCreditAvailable - amount
        };
        
        next();
        
    } catch (error) {
        console.error('Credit validation error:', error);
        res.status(500).json({
            success: false,
            error: 'Credit validation failed'
        });
    }
};

/**
 * Middleware to check credit limit before order creation
 * This is a simpler version that just checks if user can place any credit order
 */
const checkCreditEligibility = async (req, res, next) => {
    try {
        const { userId, paymentType } = req.body;
        
        // Only check credit orders
        if (paymentType !== 'credit') {
            return next();
        }
        
        // Get user credit information
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Check if user is eligible for credit
        if (user.role !== 'credited') {
            return res.status(400).json({
                success: false,
                error: 'User is not eligible for credit orders'
            });
        }
        
        // Check if user has a credit limit set
        if (!user.creditLimit || user.creditLimit <= 0) {
            return res.status(400).json({
                success: false,
                error: 'User does not have a valid credit limit set'
            });
        }
        
        next();
        
    } catch (error) {
        console.error('Credit eligibility check error:', error);
        res.status(500).json({
            success: false,
            error: 'Credit eligibility check failed'
        });
    }
};

/**
 * Middleware to get user's current credit status
 * Adds credit information to request object for controllers to use
 */
const getCreditStatus = async (req, res, next) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return next();
        }
        
        // Get user credit information
        const user = await User.findById(userId);
        if (!user || user.role !== 'credited') {
            return next();
        }
        
        // Get user's current credit status
        const userLedger = await UserLedger.findOne({ userId });
        const outstandingAmount = userLedger?.outstandingAmount || 0;
        const creditLimit = user.creditLimit || 0;
        
        // Add credit information to request
        req.userCreditStatus = {
            creditLimit,
            outstandingAmount,
            amountOfCreditAvailable: Math.max(0, creditLimit - outstandingAmount),
            canPlaceOrder: (creditLimit - outstandingAmount) > 0
        };
        
        next();
        
    } catch (error) {
        console.error('Credit status check error:', error);
        // Don't fail the request, just continue without credit info
        next();
    }
};

module.exports = {
    validateCreditOrder,
    checkCreditEligibility,
    getCreditStatus
};

