const express = require('express');
const ledgerController = require('../controllers/ledger.controller.js');
const router = express.Router();

/**
 * @route   GET /api/ledger/users/:userId/balance
 * @desc    Get user's current balance and outstanding amount
 * @access  Private
 */
router.get('/users/:userId/balance', ledgerController.getUserBalance);

/**
 * @route   GET /api/ledger/users/:userId/transactions
 * @desc    Get user's transaction history
 * @access  Private
 */
router.get('/users/:userId/transactions', ledgerController.getUserTransactions);

/**
 * @route   GET /api/ledger/users/:userId/transactions/export
 * @desc    Export user's transaction history (all transactions, no pagination)
 * @access  Private
 */
router.get('/users/:userId/transactions/export', ledgerController.exportUserTransactions);

/**
 * @route   GET /api/ledger/users/:userId/outstanding
 * @desc    Get user's outstanding amount
 * @access  Private
 */
router.get('/users/:userId/outstanding', ledgerController.getUserOutstanding);

/**
 * @route   GET /api/ledger/admin/summary
 * @desc    Get admin dashboard summary
 * @access  Private (Admin only)
 */
router.get('/admin/summary', ledgerController.getAdminSummary);

/**
 * @route   GET /api/ledger/admin/users
 * @desc    Get all users ledger summary
 * @access  Private (Admin only)
 */
router.get('/admin/users', ledgerController.getAllUsersLedger);

/**
 * @route   POST /api/ledger/users/:userId/recalculate
 * @desc    Recalculate user ledger totals and outstanding amount
 * @access  Private
 */
router.post('/users/:userId/recalculate', ledgerController.recalculateUserLedger);

/**
 * @route   POST /api/ledger/users/:userId/create-credit
 * @desc    Manually create missing CREDIT entry for completed payment
 * @access  Private
 */
router.post('/users/:userId/create-credit', ledgerController.createMissingCredit);

/**
 * @route   POST /api/ledger/users/:userId/auto-recover
 * @desc    🔧 PRODUCTION-GRADE: Auto-recover missing ledger entries
 * @access  Private
 */
router.post('/users/:userId/auto-recover', ledgerController.autoRecoverMissingEntries);

/**
 * @route   POST /api/ledger/users/:userId/create-debit
 * @desc    🔧 DEBUG: Manually create DEBIT entry for fuel delivery
 * @access  Private
 */
router.post('/users/:userId/create-debit', ledgerController.createMissingDebit);

module.exports = router;

