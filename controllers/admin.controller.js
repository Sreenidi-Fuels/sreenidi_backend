const Admin = require('../models/Admin.model');
const multer = require('multer');

// Set up multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Create Admin
const createAdmin = async (req, res) => {
    try {
        const admin = new Admin(req.body);
        await admin.save();
        res.status(201).json(admin);
    } catch (error) {
        res.status(500).json({ message: 'Error creating admin', error: error.message });
    }
};

// Get all Admins
const getAllAdmins = async (req, res) => {
    try {
        const admins = await Admin.find({}, 'name phone email images');
        // Only return image _ids, not binary data
        const adminsWithImageIds = admins.map(admin => {
            return {
                _id: admin._id,
                name: admin.name,
                phone: admin.phone,
                email: admin.email,
                images: admin.images.map(img => ({ _id: img._id }))
            };
        });
        res.json(adminsWithImageIds);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching admins', error: error.message });
    }
};

// Get Admin by ID
const getAdminById = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id, 'name phone email images');
        if (!admin) return res.status(404).json({ message: 'Admin not found' });
        // Only return image _ids, not binary data
        const adminWithImageIds = {
            _id: admin._id,
            name: admin.name,
            phone: admin.phone,
            email: admin.email,
            images: admin.images.map(img => ({ _id: img._id }))
        };
        res.json(adminWithImageIds);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching admin', error: error.message });
    }
};

// Update Admin
const updateAdmin = async (req, res) => {
    try {
        // Allow updating all fields in req.body
        const admin = await Admin.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!admin) return res.status(404).json({ message: 'Admin not found' });
        res.json(admin);
    } catch (error) {
        res.status(500).json({ message: 'Error updating admin', error: error.message });
    }
};

// Delete Admin
const deleteAdmin = async (req, res) => {
    try {
        const admin = await Admin.findByIdAndDelete(req.params.id);
        if (!admin) return res.status(404).json({ message: 'Admin not found' });
        res.json({ message: 'Admin deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting admin', error: error.message });
    }
};

// Express route handler for image upload (multiple images per admin)
const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const admin = await Admin.findById(req.body.id || req.params.id);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }
        admin.images.push({
            data: req.file.buffer,
            contentType: req.file.mimetype
        });
        await admin.save();
        res.status(200).json({ message: 'Image uploaded successfully', adminId: admin._id });
    } catch (error) {
        res.status(500).json({ message: 'Error uploading image', error: error.message });
    }
};

// Get admin image by ID
const getAdminImage = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);
        if (!admin || !admin.image || !admin.image.data) {
            return res.status(404).json({ message: 'Image not found' });
        }
        res.set('Content-Type', admin.image.contentType);
        res.send(admin.image.data);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving image', error: error.message });
    }
};

// Delete an image from an admin's images array by image _id
const deleteImage = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }
        const imgId = req.params.imgId;
        const imgIndex = admin.images.findIndex(img => img._id.toString() === imgId);
        if (imgIndex === -1) {
            return res.status(404).json({ message: 'Image not found' });
        }
        admin.images.splice(imgIndex, 1);
        await admin.save();
        res.json({ message: 'Image deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting image', error: error.message });
    }
};

module.exports = {
    upload,
    uploadImage,
    getAdminImage,
    createAdmin,
    getAllAdmins,
    getAdminById,
    updateAdmin,
    deleteAdmin,
    deleteImage
};
