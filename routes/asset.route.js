const express = require('express');
const router = express.Router();
const assetController = require('../controllers/asset.controller');

// Update asset by ID
router.patch('/:id', assetController.updateAssetById);

// Delete asset by ID
router.delete('/:id', assetController.deleteAssetById);

module.exports = router;
