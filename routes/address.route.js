const express = require('express');
const router = express.Router();
const addressController = require('../controllers/address.controller');

// Update address by ID
router.patch('/:id', addressController.updateAddressById);

// Delete address by ID
router.delete('/:id', addressController.deleteAddressById);

module.exports = router;
