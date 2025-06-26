const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller.js');

// Create a new user
router.post('/', userController.createUser);

// Get all users
router.get('/', userController.getUsers);

// Get a single user by ID
router.get('/:id', userController.getUserById);

// Update a user by ID
router.put('/:id', userController.updateUser);

// Delete a user by ID
router.delete('/:id', userController.deleteUser);

// Add assets to a user
router.patch('/:id/newAsset', userController.addAssetsToUser);

// add address to a user
router.patch('/:id/newAddress', userController.addAddressToUser);

// get addresses of a user
router.get('/:id/getAddresses', userController.getUserAddresses);

// get addresses of a user
router.get('/:id/getAssets', userController.getUserAssets);

// Get a single address of a user by userId and addressId
router.get('/:userId/address/:addressId', userController.getUserAddressById);

// Get a single asset of a user by userId and assetId
router.get('/:userId/asset/:assetId', userController.getUserAssetById);

module.exports = router;