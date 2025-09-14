const express = require('express');
const router = express.Router();
const { 
    upload, 
    uploadImage, 
    getAdminImage, 
    createAdmin, 
    getAllAdmins, 
    getAdminById, 
    updateAdmin, 
    deleteAdmin, 
    deleteImage,
    loginAdmin,
    getDailyRate
} = require('../controllers/admin.controller');

// Authentication routes
router.post('/login', loginAdmin);

// CRUD routes
router.post('/', createAdmin);
router.get('/', getAllAdmins);
router.get('/daily-rate', getDailyRate);  // Get current daily rate
router.get('/:id', getAdminById);
router.put('/:id', updateAdmin);  // Single endpoint for all updates
router.delete('/:id', deleteAdmin);

// Image routes
router.post('/:id/upload-image', upload.single('image'), uploadImage);
router.get('/:id/image', getAdminImage);
router.delete('/:id/image', deleteImage);

module.exports = router;
