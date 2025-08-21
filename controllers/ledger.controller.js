const LedgerService = require('../services/ledger.service.js');

/**
 * @desc    Get user's current balance and outstanding amount
 * @route   GET /api/ledger/users/:userId/balance
 * @access  Private
 */
exports.getUserBalance = async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        const balance = await LedgerService.getUserBalance(userId);
        
        res.status(200).json({
            success: true,
            data: balance
        });
        
    } catch (error) {
        console.error('Error getting user balance:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user balance'
        });
    }
};

/**
 * @desc    Get user's transaction history
 * @route   GET /api/ledger/users/:userId/transactions
 * @access  Private
 */
exports.getUserTransactions = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        const transactions = await LedgerService.getUserTransactions(
            userId, 
            parseInt(page), 
            parseInt(limit)
        );
        
        res.status(200).json({
            success: true,
            data: transactions
        });
        
    } catch (error) {
        console.error('Error getting user transactions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user transactions'
        });
    }
};

/**
 * @desc    Get user's outstanding amount
 * @route   GET /api/ledger/users/:userId/outstanding
 * @access  Private
 */
exports.getUserOutstanding = async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        const outstanding = await LedgerService.getOutstandingAmount(userId);
        
        res.status(200).json({
            success: true,
            data: { outstandingAmount: outstanding }
        });
        
    } catch (error) {
        console.error('Error getting user outstanding:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user outstanding amount'
        });
    }
};

/**
 * @desc    Get admin dashboard summary
 * @route   GET /api/ledger/admin/summary
 * @access  Private (Admin only)
 */
exports.getAdminSummary = async (req, res) => {
    try {
        const summary = await LedgerService.getAdminDashboardSummary();
        
        res.status(200).json({
            success: true,
            data: summary
        });
        
    } catch (error) {
        console.error('Error getting admin summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get admin summary'
        });
    }
};

/**
 * @desc    Get all users ledger summary (for admin)
 * @route   GET /api/ledger/admin/users
 * @access  Private (Admin only)
 */
exports.getAllUsersLedger = async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const UserLedger = require('../models/UserLedger.model.js');
        
        const users = await UserLedger.find()
            .sort({ outstandingAmount: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('userId', 'name email phoneNumber companyName')
            .lean();
            
        const total = await UserLedger.countDocuments();
        
        res.status(200).json({
            success: true,
            data: {
                users,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalUsers: total,
                    hasNext: parseInt(page) * parseInt(limit) < total,
                    hasPrev: parseInt(page) > 1
                }
            }
        });
        
    } catch (error) {
        console.error('Error getting all users ledger:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get all users ledger'
        });
    }
};

