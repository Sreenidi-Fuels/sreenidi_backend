const LedgerService = require('../services/ledger.service.js');

/**
 * @desc    Get user's current ledger balance and outstanding amount
 * @route   GET /api/ledger/users/:userId/balance
 * @access  Private
 */
const getUserBalance = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const balance = await LedgerService.getUserBalance(userId);
        
        res.status(200).json({
            success: true,
            data: {
                currentBalance: balance.currentBalance,
                totalPaid: balance.totalPaid,           // ← CHANGED: totalPaid
                totalOrders: balance.totalOrders,       // ← CHANGED: totalOrders
                outstandingAmount: balance.outstandingAmount,
                status: balance.status,
                lastTransactionDate: balance.lastTransactionDate,
                lastPaymentDate: balance.lastPaymentDate
            }
        });
    } catch (error) {
        console.error('Error getting user balance:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get user balance',
            details: error.message 
        });
    }
};

/**
 * @desc    Export user's transaction history (all transactions, no pagination)
 * @route   GET /api/ledger/users/:userId/transactions/export
 * @access  Private
 */
const exportUserTransactions = async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        const transactions = await LedgerService.getUserTransactionsForExport(userId);
        
        res.status(200).json({
            success: true,
            data: {
                transactions,
                totalTransactions: transactions.length,
                exportedAt: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Error exporting user transactions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export user transactions'
        });
    }
};

/**
 * @desc    Get user's transaction history
 * @route   GET /api/ledger/users/:userId/transactions
 * @access  Private
 */
const getUserTransactions = async (req, res) => {
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
const getUserOutstanding = async (req, res) => {
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
const getAdminSummary = async (req, res) => {
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
const getAllUsersLedger = async (req, res) => {
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

/**
 * @desc    Recalculate user ledger totals and outstanding amount
 * @route   POST /api/ledger/users/:userId/recalculate
 * @access  Private
 */
const recalculateUserLedger = async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        console.log('🔄 Recalculating user ledger for:', userId);
        const result = await LedgerService.recalculateUserLedger(userId);
        
        res.status(200).json({
            success: true,
            data: result,
            message: 'User ledger recalculated successfully'
        });
        
    } catch (error) {
        console.error('Error recalculating user ledger:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to recalculate user ledger',
            details: error.message
        });
    }
};

/**
 * @desc    Manually create missing CREDIT entry for completed payment
 * @route   POST /api/ledger/users/:userId/create-credit
 * @access  Private
 */
const createMissingCredit = async (req, res) => {
    try {
        const { userId } = req.params;
        const { orderId, amount, description, transactionId, bankRefNo, trackingId } = req.body;
        
        if (!userId || !orderId || !amount) {
            return res.status(400).json({
                success: false,
                error: 'User ID, Order ID, and Amount are required'
            });
        }
        
        console.log('🔧 Creating missing CREDIT entry for:', { userId, orderId, amount });
        
        const result = await LedgerService.createPaymentEntry(
            userId,
            orderId,
            amount,
            description || 'Payment received (Manual Fix)',
            {
                paymentMethod: 'ccavenue',
                transactionId,
                bankRefNo,
                trackingId
            }
        );
        
        // Recalculate ledger after creating entry
        await LedgerService.recalculateUserLedger(userId);
        
        res.status(200).json({
            success: true,
            data: result,
            message: 'Missing CREDIT entry created successfully'
        });
        
    } catch (error) {
        console.error('Error creating missing credit entry:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create missing credit entry',
            details: error.message
        });
    }
};

/**
 * @desc    🔧 PRODUCTION-GRADE: Auto-recover missing ledger entries
 * @route   POST /api/ledger/users/:userId/auto-recover
 * @access  Private
 */
const autoRecoverMissingEntries = async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        console.log('🔧 Auto-recovering missing ledger entries for user:', userId);
        
        const result = await LedgerService.autoRecoverMissingEntries(userId);
        
        res.status(200).json({
            success: true,
            data: result,
            message: `Auto-recovery completed. Recovered ${result.recoveredCount} entries.`
        });
        
    } catch (error) {
        console.error('Error in auto-recovery:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to auto-recover missing entries',
            details: error.message
        });
    }
};

/**
 * @desc    🔧 DEBUG: Manually create DEBIT entry for fuel delivery
 * @route   POST /api/ledger/users/:userId/create-debit
 * @access  Private
 */
const createMissingDebit = async (req, res) => {
    try {
        const { userId } = req.params;
        const { orderId, invoiceId, amount, description } = req.body;
        
        if (!userId || !orderId || !amount) {
            return res.status(400).json({
                success: false,
                error: 'User ID, Order ID, and Amount are required'
            });
        }
        
        console.log('🔧 Creating missing DEBIT entry for fuel delivery:', { userId, orderId, amount });
        
        const result = await LedgerService.createDeliveryEntry(
            userId,
            orderId,
            amount,
            description || 'Fuel delivered (Manual Fix)',
            {
                paymentMethod: 'credit',
                invoiceId
            }
        );
        
        // Recalculate ledger after creating entry
        await LedgerService.recalculateUserLedger(userId);
        
        res.status(200).json({
            success: true,
            data: result,
            message: 'Missing DEBIT entry created successfully'
        });
        
    } catch (error) {
        console.error('Error creating missing debit entry:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create missing debit entry',
            details: error.message
        });
    }
};

// Export all controller functions
module.exports = {
    getUserBalance,
    getUserTransactions,
    exportUserTransactions,
    getUserOutstanding,
    getAdminSummary,
    getAllUsersLedger,
    recalculateUserLedger,
    createMissingCredit,
    autoRecoverMissingEntries,
    createMissingDebit
};

