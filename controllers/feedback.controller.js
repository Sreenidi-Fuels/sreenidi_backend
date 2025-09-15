const Feedback = require('../models/Feedback.model.js');
const User = require('../models/User.model.js');
const nodemailer = require('nodemailer');

// Create email transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
};

// Send feedback email
const sendFeedbackEmail = async (feedbackData) => {
    try {
        const transporter = createTransporter();

        // Log non-sensitive mail details
        const toAddress = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
        console.log('[FeedbackEmail] Preparing to send', {
            from: process.env.EMAIL_USER ? 'set' : 'missing',
            to: toAddress,
        });

        // Verify transporter configuration before sending
        try {
            await transporter.verify();
            console.log('[FeedbackEmail] SMTP transporter verified');
        } catch (verifyErr) {
            console.error('[FeedbackEmail] SMTP verify failed:', verifyErr.message);
        }
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: toAddress,
            subject: `New Feedback: ${feedbackData.issueType} - ${feedbackData.name}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
                        New Feedback Received
                    </h2>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #007bff; margin-top: 0;">Feedback Details</h3>
                        
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold; width: 30%;">Name:</td>
                                <td style="padding: 8px 0;">${feedbackData.name}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold;">Issue Type:</td>
                                <td style="padding: 8px 0;">
                                    <span style="background-color: #007bff; color: white; padding: 4px 8px; border-radius: 4px;">
                                        ${feedbackData.issueType}
                                    </span>
                                </td>
                            </tr>
                            ${feedbackData.userEmail ? `
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold;">Email:</td>
                                <td style="padding: 8px 0;"><a href="mailto:${feedbackData.userEmail}">${feedbackData.userEmail}</a></td>
                            </tr>
                            ` : ''}
                            ${feedbackData.userPhone ? `
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold;">Phone:</td>
                                <td style="padding: 8px 0;"><a href="tel:${feedbackData.userPhone}">${feedbackData.userPhone}</a></td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td style="padding: 8px 0; font-weight: bold;">Date:</td>
                                <td style="padding: 8px 0;">${new Date(feedbackData.createdAt).toLocaleString()}</td>
                            </tr>
                        </table>
                    </div>
                    
                    ${feedbackData.message ? `
                    <div style="background-color: #fff; border: 1px solid #dee2e6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #333; margin-top: 0;">Message</h3>
                        <p style="line-height: 1.6; color: #555; white-space: pre-wrap;">${feedbackData.message}</p>
                    </div>
                    ` : ''}
                    
                    <div style="background-color: #e9ecef; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
                        <p style="margin: 0; color: #6c757d; font-size: 14px;">
                            Feedback ID: ${feedbackData._id}
                        </p>
                    </div>
                </div>
            `
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('Feedback email sent successfully:', result.messageId);
        return result;
    } catch (error) {
        console.error('Error sending feedback email:', error);
        throw error;
    }
};

// Submit feedback
exports.submitFeedback = async (req, res) => {
    try {
        const { name, issueType, message, userId } = req.body;

        // Validate required fields
        if (!name || !issueType) {
            return res.status(400).json({ 
                error: 'Name and issue type are required' 
            });
        }

        let userEmail = '';
        let userPhone = '';

        // Get user details if userId is provided
        if (userId) {
            try {
                const user = await User.findById(userId);
                if (user) {
                    userEmail = user.email || '';
                    userPhone = user.phoneNumber || '';
                }
            } catch (userError) {
                console.log('Could not fetch user details:', userError.message);
            }
        }

        // Create feedback
        const feedback = new Feedback({
            name,
            issueType,
            message: message || '',
            userEmail,
            userPhone
        });

        await feedback.save();

        // Send email notification
        try {
            await sendFeedbackEmail(feedback);
            console.log('Feedback email sent successfully for feedback:', feedback._id);
        } catch (emailError) {
            console.error('Failed to send feedback email:', emailError);
            // Don't fail the request if email fails, just log it
        }

        res.status(201).json({
            success: true,
            message: 'Feedback submitted successfully',
            feedback: {
                id: feedback._id,
                name: feedback.name,
                issueType: feedback.issueType,
                status: feedback.status,
                createdAt: feedback.createdAt
            }
        });

    } catch (err) {
        console.error('Error submitting feedback:', err);
        res.status(500).json({ 
            error: 'Failed to submit feedback',
            details: err.message 
        });
    }
};

// Get all feedback (admin only)
exports.getAllFeedback = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        
        // Build filter
        const filter = {};
        if (status) filter.status = status;

        // Calculate pagination
        const skip = (page - 1) * limit;

        const feedback = await Feedback.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Feedback.countDocuments(filter);

        res.json({
            feedback,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: parseInt(limit)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get feedback by ID
exports.getFeedbackById = async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) {
            return res.status(404).json({ error: 'Feedback not found' });
        }
        res.json(feedback);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Update feedback status (admin only)
exports.updateFeedbackStatus = async (req, res) => {
    try {
        const { status } = req.body;
        
        const validStatuses = ['new', 'in_progress', 'resolved', 'closed'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ 
                error: 'Invalid status. Must be one of: new, in_progress, resolved, closed' 
            });
        }

        const feedback = await Feedback.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true, runValidators: true }
        );

        if (!feedback) {
            return res.status(404).json({ error: 'Feedback not found' });
        }

        res.json({
            success: true,
            message: 'Feedback updated successfully',
            feedback
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Delete feedback (admin only)
exports.deleteFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.findByIdAndDelete(req.params.id);
        if (!feedback) {
            return res.status(404).json({ error: 'Feedback not found' });
        }
        res.json({ 
            success: true,
            message: 'Feedback deleted successfully' 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
