const express = require('express');
const router = express.Router();
const { 
    upload, 
    uploadImage, 
    getAdminImage, 
    getAdminImagesMetadata,
    getAdminImagesForCarousel,
    getAllAdminImages,
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
router.post('/:id/upload-images', upload.array('images', 5), uploadImage); // Support up to 5 images
router.get('/:id/image', getAdminImage); // Get single image (latest or by index)
router.get('/:id/images', getAllAdminImages); // Get all images in gallery view
router.get('/:id/images-carousel', getAdminImagesForCarousel); // Get images for carousel (JSON)
router.get('/:id/images-metadata', getAdminImagesMetadata); // Get all images metadata
router.delete('/:id/image', deleteImage); // Delete single image by index or all images

module.exports = router;
