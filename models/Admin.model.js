const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    images: [{
        data: Buffer,
        contentType: String
    }]
});

module.exports = mongoose.model('Admin', AdminSchema);
