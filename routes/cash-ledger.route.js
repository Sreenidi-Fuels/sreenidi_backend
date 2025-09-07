const express = require('express');
const router = express.Router();
const controller = require('../controllers/cash-ledger.controller.js');

router.get('/order/:orderId', controller.getByOrder);
router.get('/order/:orderId/summary', controller.getOrderSummary);
router.get('/invoice/:invoiceId', controller.getByInvoice);
router.get('/user/:userId', controller.getByUser);
router.get('/', controller.listAll);

module.exports = router;


