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

        // If dailyRate was updated, propagate to all normal users and drivers
        if (req.body.dailyRate !== undefined) {
            try {
                const User = require('../models/User.model.js');
                const Driver = require('../models/Driver.model.js');

                // Update all users with role 'normal' to use the new dailyRate
                await User.updateMany(
                    { role: 'normal' },
                    { $unset: { creditFuelRate: 1 } } // Remove creditFuelRate for normal users
                );

                // Update all drivers to use the new dailyRate
                await Driver.updateMany(
                    {},
                    { $unset: { creditFuelRate: 1 } } // Remove creditFuelRate for drivers
                );

                console.log(`✅ Daily rate updated to ${req.body.dailyRate} for all normal users and drivers`);
            } catch (propagationError) {
                console.error('Error propagating daily rate:', propagationError);
                // Don't fail the admin update if propagation fails
            }
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

// Upload admin image(s)
const uploadImage = async (req, res) => {
    try {
        // Handle both single file (req.file) and multiple files (req.files)
        const files = req.files || (req.file ? [req.file] : []);

        if (files.length === 0) {
            return res.status(400).json({ message: 'No image file(s) provided' });
        }

        const admin = await Admin.findById(req.params.id);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Check current image count and enforce 5-image limit
        const currentImageCount = admin.images ? admin.images.length : 0;
        const maxImages = 5;

        if (currentImageCount >= maxImages) {
            return res.status(400).json({
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
            message,
            uploadedCount: files.length,
            totalImages: admin.images.length,
            remainingSlots: maxImages - admin.images.length
        });
    } catch (error) {
        res.status(500).json({ message: 'Error uploading image(s)', error: error.message });
    }
};

// Get admin image
const getAdminImage = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);
        if (!admin || !admin.images || admin.images.length === 0) {
            return res.status(404).json({ message: 'Image not found' });
        }

        // Get image by index (query parameter) or latest image by default
        const imageIndex = req.query.index ? parseInt(req.query.index) : admin.images.length - 1;

        if (imageIndex < 0 || imageIndex >= admin.images.length) {
            return res.status(404).json({ message: 'Image index out of range' });
        }

        const image = admin.images[imageIndex];

        // Set proper headers for image serving
        res.set({
            'Content-Type': image.contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cache-Control': 'no-cache'
        });

        res.send(image.data);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching image', error: error.message });
    }
};

// Get admin images metadata
const getAdminImagesMetadata = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        const imagesMetadata = admin.images.map((image, index) => ({
            index,
            contentType: image.contentType,
            size: image.data.length,
            uploadedAt: image.uploadedAt || 'Unknown'
        }));

        res.json({
            totalImages: admin.images.length,
            images: imagesMetadata
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching images metadata', error: error.message });
    }
};

// Get all admin images for carousel (JSON format)
const getAdminImagesForCarousel = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);
        if (!admin || !admin.images || admin.images.length === 0) {
            return res.json({
                success: false,
                message: 'No images found',
                images: []
            });
        }

        const images = admin.images.map((image, index) => ({
            id: index,
            url: `${req.protocol}://${req.get('host')}/api/admin/${req.params.id}/image?index=${index}`,
            contentType: image.contentType,
            size: image.data.length,
            uploadedAt: image.uploadedAt || new Date()
        }));

        res.json({
            success: true,
            totalImages: admin.images.length,
            images: images
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching images for carousel',
            error: error.message
        });
    }
};

// Get all admin images in a gallery view
const getAllAdminImages = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);
        if (!admin || !admin.images || admin.images.length === 0) {
            return res.status(404).send(`
                <html>
                    <head><title>No Images Found</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2>No images found for this admin</h2>
                        <p>Admin ID: ${req.params.id}</p>
                    </body>
                </html>
            `);
        }

        // Create HTML gallery
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Images Gallery</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 20px; 
                        background: #f5f5f5; 
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 30px; 
                        background: white; 
                        padding: 20px; 
                        border-radius: 10px; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .gallery { 
                        display: grid; 
                        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); 
                        gap: 20px; 
                    }
                    .image-card { 
                        background: white; 
                        border-radius: 10px; 
                        padding: 15px; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        text-align: center;
                    }
                    .image-card img { 
                        max-width: 100%; 
                        max-height: 250px; 
                        border-radius: 8px; 
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    }
                    .image-info { 
                        margin-top: 10px; 
                        font-size: 12px; 
                        color: #666; 
                    }
                    .image-actions {
                        margin-top: 10px;
                    }
                    .btn {
                        background: #007bff;
                        color: white;
                        border: none;
                        padding: 5px 10px;
                        border-radius: 4px;
                        cursor: pointer;
                        text-decoration: none;
                        font-size: 12px;
                        margin: 0 5px;
                    }
                    .btn:hover { background: #0056b3; }
                    .btn-danger { background: #dc3545; }
                    .btn-danger:hover { background: #c82333; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🖼️ Admin Images Gallery</h1>
                    <p>Admin ID: ${req.params.id}</p>
                    <p>Total Images: ${admin.images.length}</p>
                </div>
                <div class="gallery">
        `;

        admin.images.forEach((image, index) => {
            const base64Image = `data:${image.contentType};base64,${image.data.toString('base64')}`;
            const uploadDate = image.uploadedAt ? new Date(image.uploadedAt).toLocaleString() : 'Unknown';
            const sizeKB = Math.round(image.data.length / 1024);

            html += `
                <div class="image-card">
                    <img src="${base64Image}" alt="Admin Image ${index + 1}">
                    <div class="image-info">
                        <strong>Image ${index + 1}</strong><br>
                        Type: ${image.contentType}<br>
                        Size: ${sizeKB} KB<br>
                        Uploaded: ${uploadDate}
                    </div>
                    <div class="image-actions">
                        <a href="/api/admin/${req.params.id}/image?index=${index}" class="btn" target="_blank">View Full Size</a>
                        <button class="btn btn-danger" onclick="deleteImage(${index})">Delete</button>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <script>
                    function deleteImage(index) {
                        if (confirm('Are you sure you want to delete this image?')) {
                            fetch('/api/admin/${req.params.id}/image?index=' + index, {
                                method: 'DELETE'
                            })
                            .then(response => response.json())
                            .then(data => {
                                alert(data.message);
                                location.reload();
                            })
                            .catch(error => {
                                alert('Error deleting image: ' + error.message);
                            });
                        }
                    }
                </script>
            </body>
            </html>
        `;

        res.send(html);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching images gallery', error: error.message });
    }
};

// Delete admin image(s)
const deleteImage = async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        const imageIndex = req.query.index ? parseInt(req.query.index) : null;

        if (imageIndex !== null) {
            // Delete specific image by index
            if (imageIndex < 0 || imageIndex >= admin.images.length) {
                return res.status(404).json({ message: 'Image index out of range' });
            }
            admin.images.splice(imageIndex, 1);
            await admin.save();
            res.json({ message: `Image at index ${imageIndex} deleted successfully` });
        } else {
            // Delete all images
            admin.images = [];
            await admin.save();
            res.json({ message: 'All images deleted successfully' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error deleting image(s)', error: error.message });
    }
};

// Get current daily rate
const getDailyRate = async (req, res) => {
    try {
        // Get the most recently updated admin to get the latest dailyRate
        const admin = await Admin.findOne().sort({ updatedAt: -1 });
        if (!admin) {
            return res.status(404).json({ error: 'Admin data not found' });
        }

        res.json({
            dailyRate: admin.dailyRate,
            lastUpdated: admin.updatedAt,
            adminId: admin._id
        });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching daily rate', details: error.message });
    }
};

module.exports = {
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
    setAdminPassword,  // Changed from changePassword to setAdminPassword
    getDailyRate
};
