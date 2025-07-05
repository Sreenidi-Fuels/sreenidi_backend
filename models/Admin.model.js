const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: {
        type: String,
        required: true,
        validate: {
            validator: function(v) {
                // Allow only +91 followed by 10 digits, total length 13
                return /^\+91\d{10}$/.test(v);
            },
            message: props => `${props.value} is not a valid phone number! It must only be 10 digits.`
        },
        maxlength: 13
    },
    email: { type: String, required: true, unique: true },
    images: [{
        data: Buffer,
        contentType: String
    }],
    dailyRate: { type: Number, required: true}
}, { timestamps: true });

module.exports = mongoose.model('Admin', AdminSchema);
