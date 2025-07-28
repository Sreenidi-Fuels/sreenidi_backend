const Admin = require('../models/Admin.model');
const multer = require('multer');

// Set up multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Admin Login
const loginAdmin = async (req, res) => {
    try {
        const { phone, password } = req.body;

        // Check if phone and password are provided
        if (!phone || !password) {
            return res.status(400).json({ error: 'Phone number and password are required' });
        }

        // Find admin by phone number
        const admin = await Admin.findOne({ phone });
        
        // Check if admin exists
        if (!admin) {
            return res.status(404).json({ error: 'Admin not found' });
        }

        // Check if password matches
        if (admin.password !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Login successful
        res.status(200).json({ 
            message: 'Login successful',
            admin: {
                id: admin._id,
                name: admin.name,
                phone: admin.phone,
                email: admin.email,
                dailyRate: admin.dailyRate
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error during login', error: error.message });
    }
};

// Create Admin
const createAdmin = async (req, res) => {
    try {
        const admin = new Admin(req.body);
        await admin.save();
        res.status(201).json({
            id: admin._id,
            name: admin.name,
            phone: admin.phone,
            email: admin.email,
            password: admin.password,  // Now including password in response
            dailyRate: admin.dailyRate
        });
    } catch (error) {
        res.status(500).json({ message: 'Error creating admin', error: error.message });
    }
};

// Get all admins
const getAllAdmins = async (req, res) => {
    try {
        const admins = await Admin.find();
        const sanitizedAdmins = admins.map(admin => ({
            id: admin._id,
            name: admin.name,
            phone: admin.phone,
            email: admin.email,
            password: admin.password,  // Including password
            dailyRate: admin.dailyRate
        }));
        res.json(sanitizedAdmins);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching admins', error: error.message });
    }
};

// Get admin by ID
const getAdminById = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }
        res.json({
            id: admin._id,
            name: admin.name,
            phone: admin.phone,
            email: admin.email,
            password: admin.password,  // Including password
            dailyRate: admin.dailyRate
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching admin', error: error.message });
    }
};

// Update admin
const updateAdmin = async (req, res) => {
    try {
        // If newPassword is present, it's a password update
        if (req.body.newPassword) {
            const admin = await Admin.findByIdAndUpdate(
                req.params.id,
                { password: req.body.newPassword },
                { new: true, runValidators: true }
            );
            if (!admin) {
                return res.status(404).json({ message: 'Admin not found' });
            }
            return res.json({
                message: 'Password updated successfully',
                admin: {
                    id: admin._id,
                    name: admin.name,
                    phone: admin.phone,
                    email: admin.email,
                    password: admin.password,
                    dailyRate: admin.dailyRate
                }
            });
        }

        // For other updates
        const admin = await Admin.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        res.json({
            id: admin._id,
            name: admin.name,
            phone: admin.phone,
            email: admin.email,
            password: admin.password,
            dailyRate: admin.dailyRate
        });
    } catch (error) {
        res.status(400).json({ message: 'Error updating admin', error: error.message });
    }
};

// Set/Reset admin password (similar to driver implementation)
const setAdminPassword = async (req, res) => {
    try {
        const { newPassword } = req.body;
        
        if (!newPassword) {
            return res.status(400).json({ error: 'New password is required' });
        }

        const admin = await Admin.findByIdAndUpdate(
            req.params.id,
            { password: newPassword },
            { new: true }
        );

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        res.json({
            message: 'Password updated successfully',
            admin: {
                id: admin._id,
                name: admin.name,
                phone: admin.phone,
                email: admin.email,
                password: admin.password,
                dailyRate: admin.dailyRate
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating password', error: error.message });
    }
};

// Delete admin
const deleteAdmin = async (req, res) => {
    try {
        const admin = await Admin.findByIdAndDelete(req.params.id);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }
        res.json({ message: 'Admin deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting admin', error: error.message });
    }
};

// Upload admin image
const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided' });
        }

        const admin = await Admin.findById(req.params.id);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        admin.images.push({
            data: req.file.buffer,
            contentType: req.file.mimetype
        });

        await admin.save();
        res.json({ message: 'Image uploaded successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error uploading image', error: error.message });
    }
};

// Get admin image
const getAdminImage = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);
        if (!admin || !admin.images || admin.images.length === 0) {
            return res.status(404).json({ message: 'Image not found' });
        }

        const image = admin.images[admin.images.length - 1]; // Get the latest image
        res.set('Content-Type', image.contentType);
        res.send(image.data);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching image', error: error.message });
    }
};

// Delete admin image
const deleteImage = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        admin.images = [];
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
    deleteImage,
    loginAdmin,
    setAdminPassword  // Changed from changePassword to setAdminPassword
};
