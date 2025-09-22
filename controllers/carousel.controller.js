const Admin = require('../models/Admin.model');
const multer = require('multer');

// Set up multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Get carousel images for public use (no admin ID required)
const getCarouselImages = async (req, res) => {
    try {
        // Get the latest admin (or you can modify this logic as needed)
        const admin = await Admin.findOne().sort({ createdAt: -1 });
        
        if (!admin || !admin.images || admin.images.length === 0) {
            return res.json({
                success: true,
                message: 'No carousel images available',
                totalImages: 0,
                images: []
            });
        }

        // Map images to public URLs
        const images = admin.images.map((image, index) => ({
            id: index,
            url: `${req.protocol}://${req.get('host')}/api/images-carousel/image/${index}`,
            contentType: image.contentType,
            size: image.data.length,
            uploadedAt: image.uploadedAt || admin.createdAt
        }));

        res.json({
            success: true,
            message: 'Carousel images retrieved successfully',
            totalImages: admin.images.length,
            images: images
        });
    } catch (error) {
        console.error('Error fetching carousel images:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error fetching carousel images', 
            error: error.message 
        });
    }
};

// Get individual carousel image by index
const getCarouselImage = async (req, res) => {
    try {
        const imageIndex = parseInt(req.params.index);
        
        // Get the latest admin
        const admin = await Admin.findOne().sort({ createdAt: -1 });
        
        if (!admin || !admin.images || admin.images.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No images available'
            });
        }

        // Validate index
        if (isNaN(imageIndex) || imageIndex < 0 || imageIndex >= admin.images.length) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }

        const image = admin.images[imageIndex];
        
        // Set appropriate headers
        res.set({
            'Content-Type': image.contentType,
            'Content-Length': image.data.length,
            'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
        });

        res.send(image.data);
    } catch (error) {
        console.error('Error fetching carousel image:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error fetching image', 
            error: error.message 
        });
    }
};

// Upload image(s) to carousel (public endpoint)
const uploadCarouselImage = async (req, res) => {
    try {
        // Handle both single file (req.file) and multiple files (req.files)
        const files = req.files || (req.file ? [req.file] : []);
        
        if (files.length === 0) {
            return res.status(400).json({ 
                success: false,
                message: 'No image file(s) provided' 
            });
        }

        // Get the latest admin (or create one if none exists)
        let admin = await Admin.findOne().sort({ updatedAt: -1 });
        if (!admin) {
            // Create a default admin if none exists
            admin = new Admin({
                name: 'Default Admin',
                phone: '0000000000',
                email: 'admin@default.com',
                password: 'default123',
                dailyRate: 100,
                images: []
            });
        }

        // Check current image count and enforce 5-image limit
        const currentImageCount = admin.images ? admin.images.length : 0;
        const maxImages = 5;
        
        if (currentImageCount >= maxImages) {
            return res.status(400).json({ 
                success: false,
                message: `Maximum ${maxImages} images allowed. Please delete some images first.`,
                currentImages: currentImageCount,
                maxImages: maxImages
            });
        }

        // Check if adding new images would exceed the limit
        const newImageCount = currentImageCount + files.length;
        if (newImageCount > maxImages) {
            const allowedFiles = maxImages - currentImageCount;
            return res.status(400).json({ 
                success: false,
                message: `Cannot upload ${files.length} images. Only ${allowedFiles} more image(s) allowed (current: ${currentImageCount}/${maxImages})`,
                currentImages: currentImageCount,
                maxImages: maxImages,
                allowedFiles: allowedFiles
            });
        }

        // Add all uploaded images to the admin's images array
        files.forEach(file => {
            admin.images.push({
                data: file.buffer,
                contentType: file.mimetype,
                uploadedAt: new Date()
            });
        });

        await admin.save();
        
        const message = files.length === 1 
            ? 'Image uploaded successfully' 
            : `${files.length} images uploaded successfully`;
            
        res.json({ 
            success: true,
            message,
            uploadedCount: files.length,
            totalImages: admin.images.length,
            remainingSlots: maxImages - admin.images.length
        });
    } catch (error) {
        console.error('Error uploading carousel image:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error uploading image(s)', 
            error: error.message 
        });
    }
};

// Delete carousel image(s) (public endpoint)
const deleteCarouselImage = async (req, res) => {
    try {
        const admin = await Admin.findOne().sort({ updatedAt: -1 });
        if (!admin || !admin.images || admin.images.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'No images found to delete' 
            });
        }

        const imageIndex = req.query.index ? parseInt(req.query.index) : null;
        
        if (imageIndex !== null) {
            // Delete specific image by index
            if (imageIndex < 0 || imageIndex >= admin.images.length) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Image index out of range' 
                });
            }
            admin.images.splice(imageIndex, 1);
            await admin.save();
            res.json({ 
                success: true,
                message: `Image at index ${imageIndex} deleted successfully`,
                remainingImages: admin.images.length
            });
        } else {
            // Delete all images
            const deletedCount = admin.images.length;
            admin.images = [];
            await admin.save();
            res.json({ 
                success: true,
                message: `All ${deletedCount} images deleted successfully`,
                remainingImages: 0
            });
        }
    } catch (error) {
        console.error('Error deleting carousel image:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error deleting image(s)', 
            error: error.message 
        });
    }
};

module.exports = {
    upload,
    getCarouselImages,
    getCarouselImage,
    uploadCarouselImage,
    deleteCarouselImage
};