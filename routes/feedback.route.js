const express = require('express');
const router = express.Router();
const {
    submitFeedback,
    getAllFeedback,
    getFeedbackById,
    updateFeedbackStatus,
    deleteFeedback
} = require('../controllers/feedback.controller.js');

// Public routes
router.post('/', submitFeedback);

// Admin routes
router.get('/', getAllFeedback);
router.get('/:id', getFeedbackById);
router.put('/:id', updateFeedbackStatus);
router.delete('/:id', deleteFeedback);

module.exports = router;
