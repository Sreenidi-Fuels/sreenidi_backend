const express = require('express');
const router = express.Router();
const { upload, uploadImage, getAdminImage, createAdmin, getAllAdmins, getAdminById, updateAdmin, deleteAdmin, deleteImage } = require('../controllers/admin.controller');

// CRUD routes
router.post('/', createAdmin);
router.get('/', getAllAdmins);
router.get('/:id', getAdminById);
router.put('/:id', updateAdmin);
router.delete('/:id', deleteAdmin);

// POST /admin/:id/upload-image
router.post('/:id/upload-image', upload.single('image'), uploadImage);

// GET /admin/:id/image
router.get('/:id/image', getAdminImage);

// DELETE /admin/:id/image/:imgId
router.delete('/:id/image/:imgId', deleteImage);

module.exports = router;
