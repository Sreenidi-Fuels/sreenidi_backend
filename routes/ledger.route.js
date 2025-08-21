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

module.exports = router;

