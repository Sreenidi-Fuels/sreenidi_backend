const express = require('express');
const router = express.Router();
const creditController = require('../controllers/credit.controller.js');

// Credit Details Routes
router.get('/:id/details', creditController.getCreditDetails);
router.put('/:id/details', creditController.updateCreditDetails);

// Credit Payment Routes
router.get('/:id/payment', creditController.getCreditPaymentHistory);
router.post('/:id/payment', creditController.recordCreditPayment);
router.put('/:id/payment', creditController.updateCreditPayment);

// Credit Payment and Debit Payment Routes (New)
router.post('/:id/credit-payment', require('../controllers/credit-payment.controller.js').recordCreditPayment);
router.post('/:id/debit-payment', require('../controllers/credit-payment.controller.js').recordDebitPayment);
router.get('/:id/payment-history', require('../controllers/credit-payment.controller.js').getCreditPaymentHistory);

// Credit Validation Routes
router.post('/:id/validate-order', creditController.validateCreditOrder);

module.exports = router;
