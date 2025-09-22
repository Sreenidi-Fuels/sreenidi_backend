const express = require('express');
const router = express.Router();
const { 
    upload,
    getCarouselImages, 
    getCarouselImage,
    uploadCarouselImage,
    deleteCarouselImage
} = require('../controllers/carousel.controller');

// Get all carousel images (public endpoint)
router.get('/', getCarouselImages);

// Get individual carousel image by index (public endpoint)
router.get('/image/:index', getCarouselImage);

// Upload single image (public endpoint)
router.post('/upload-image', upload.single('image'), uploadCarouselImage);

// Upload multiple images (public endpoint)
router.post('/upload-images', upload.array('images', 5), uploadCarouselImage);

// Delete image(s) (public endpoint)
// Use ?index=0 to delete specific image, or no query to delete all
router.delete('/image', deleteCarouselImage);

module.exports = router;