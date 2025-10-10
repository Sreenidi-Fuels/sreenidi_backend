const express = require('express');
const invoiceController = require('../controllers/invoice.controller.js');
const router = express.Router();

/**
 * @route   POST /api/invoice
 * @desc    Create a new invoice
 * @access  Private
 * @body    { orderId, vehicleId, remarks?, particulars? }
 */
router.post('/', invoiceController.createInvoice);

/**
 * @route   GET /api/invoice
 * @desc    Get all invoices with pagination and filtering
 * @access  Private
 * @query   { page?, limit?, status?, userId? }
 */
router.get('/', invoiceController.getAllInvoices);

/**
 * @route   GET /api/invoice/:id
 * @desc    Get invoice by ID
 * @access  Private
 * @params  id
 */
router.get('/:id', invoiceController.getInvoiceById);

/**
 * @route   GET /api/invoice/order/:orderId
 * @desc    Get invoices by order ID
 * @access  Private
 * @params  orderId
 */
router.get('/order/:orderId', invoiceController.getInvoicesByOrderId);

/**
 * @route   PUT /api/invoice/:id
 * @desc    Update invoice
 * @access  Private
 * @params  id
 * @body    { remarks?, particulars?, status? }
 */
router.put('/:id', invoiceController.updateInvoice);

/**
 * @route   DELETE /api/invoice/:id
 * @desc    Delete invoice
 * @access  Private
 * @params  id
 */
router.delete('/:id', invoiceController.deleteInvoice);

module.exports = router; 