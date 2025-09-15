const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        trim: true
    },
    issueType: { 
        type: String, 
        required: true,
        trim: true
    },
    message: { 
        type: String, 
        required: false,
        trim: true
    },
    userEmail: {
        type: String,
        required: false,
        trim: true
    },
    userPhone: {
        type: String,
        required: false,
        trim: true
    },
    status: {
        type: String,
        enum: ['new', 'in_progress', 'resolved', 'closed'],
        default: 'new'
    }
}, { timestamps: true });

module.exports = mongoose.model('Feedback', FeedbackSchema);
