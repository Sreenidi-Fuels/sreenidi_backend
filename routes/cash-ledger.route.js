const express = require('express');
const router = express.Router();
const controller = require('../controllers/cash-ledger.controller.js');

// Global ledger
router.get('/', controller.listAll);

// By order
router.get('/order/:orderId', controller.getByOrder);
router.get('/order/:orderId/summary', controller.getOrderSummary);

// By invoice
router.get('/invoice/:invoiceId', controller.getByInvoice);

// By user (via orders)
router.get('/user/:userId', controller.getByUser);

module.exports = router;


