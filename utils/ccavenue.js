const crypto = require('crypto');

/**
 * CCAvenue utility functions for payment processing
 * Implements AES-128-CBC encryption/decryption as required by CCAvenue
 */

/**
 * Encrypt data using AES-128-CBC encryption
 * @param {string} plainText - The data to encrypt
 * @param {string} workingKey - CCAvenue working key
 * @returns {string} - Encrypted data in hex format
 */
function encrypt(plainText, workingKey) {
    try {
        const m = crypto.createHash('md5');
        m.update(workingKey);
        const key = m.digest();
        
        const iv = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f';
        const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
        
        let encoded = cipher.update(plainText, 'utf8', 'hex');
        encoded += cipher.final('hex');
        
        return encoded;
    } catch (error) {
        console.error('CCAvenue Encryption Error:', error.message);
        throw new Error('Payment data encryption failed');
    }
}

/**
 * Decrypt data using AES-128-CBC decryption
 * @param {string} encText - The encrypted data to decrypt
 * @param {string} workingKey - CCAvenue working key
 * @returns {string} - Decrypted plain text
 */
function decrypt(encText, workingKey) {
    try {
        const m = crypto.createHash('md5');
        m.update(workingKey);
        const key = m.digest();
        
        const iv = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f';
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        
        let decoded = decipher.update(encText, 'hex', 'utf8');
        decoded += decipher.final('utf8');
        
        return decoded;
    } catch (error) {
        console.error('CCAvenue Decryption Error:', error.message);
        throw new Error('Payment response decryption failed');
    }
}

/**
 * Parse CCAvenue response string into object
 * @param {string} responseString - The decrypted response from CCAvenue
 * @returns {object} - Parsed response object
 */
function parseResponse(responseString) {
    const responseObj = {};
    const pairs = responseString.split('&');
    
    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
            responseObj[key] = decodeURIComponent(value);
        }
    });
    
    return responseObj;
}

/**
 * Generate CCAvenue payment form data
 * @param {object} orderData - Order details
 * @param {string} merchantId - CCAvenue merchant ID
 * @param {string} accessCode - CCAvenue access code
 * @returns {object} - Form data for payment
 */
function generatePaymentRequest(orderData, merchantId, accessCode) {
    const {
        orderId,
        amount,
        currency = 'INR',
        redirectUrl,
        cancelUrl,
        language = 'EN',
        billingName,
        billingAddress,
        billingCity,
        billingState,
        billingZip,
        billingCountry,
        billingTel,
        billingEmail,
        deliveryName,
        deliveryAddress,
        deliveryCity,
        deliveryState,
        deliveryZip,
        deliveryCountry,
        deliveryTel
    } = orderData;
    
    // Create the data string for CCAvenue
    const paymentData = [
        `merchant_id=${merchantId}`,
        `order_id=${orderId}`,
        `amount=${amount}`,
        `currency=${currency}`,
        `redirect_url=${encodeURIComponent(redirectUrl)}`,
        `cancel_url=${encodeURIComponent(cancelUrl)}`,
        `language=${language}`,
        `billing_name=${encodeURIComponent(billingName || '')}`,
        `billing_address=${encodeURIComponent(billingAddress || '')}`,
        `billing_city=${encodeURIComponent(billingCity || '')}`,
        `billing_state=${encodeURIComponent(billingState || '')}`,
        `billing_zip=${billingZip || ''}`,
        `billing_country=${encodeURIComponent(billingCountry || 'India')}`,
        `billing_tel=${billingTel || ''}`,
        `billing_email=${encodeURIComponent(billingEmail || '')}`,
        `delivery_name=${encodeURIComponent(deliveryName || '')}`,
        `delivery_address=${encodeURIComponent(deliveryAddress || '')}`,
        `delivery_city=${encodeURIComponent(deliveryCity || '')}`,
        `delivery_state=${encodeURIComponent(deliveryState || '')}`,
        `delivery_zip=${deliveryZip || ''}`,
        `delivery_country=${encodeURIComponent(deliveryCountry || 'India')}`,
        `delivery_tel=${deliveryTel || ''}`,
        `merchant_param1=${orderId}`, // Store order ID for reference
        `merchant_param2=sreenidi_fuel_order`, // App identifier
        `promo_code=`,
        `customer_identifier=${billingEmail || billingTel || orderId}`
    ].join('&');
    
    // DEBUG: Log the exact payload being encrypted (temporarily for debugging)
    console.log('=== CCAvenue Encryption Debug ===');
    console.log('Raw Payment Data Length:', paymentData.length);
    console.log('Raw Payment Data (first 200 chars):', paymentData.substring(0, 200));
    console.log('Merchant ID in payload:', merchantId);
    console.log('Access Code in payload:', accessCode);
    console.log('Working Key length for encryption:', process.env.CCAVENUE_WORKING_KEY ? process.env.CCAVENUE_WORKING_KEY.length : 'undefined');
    console.log('=== End Encryption Debug ===');
    
    return {
        merchant_id: merchantId,
        access_code: accessCode,
        encRequest: encrypt(paymentData, process.env.CCAVENUE_WORKING_KEY),
        paymentData // For logging purposes (without sensitive data)
    };
}

/**
 * Validate CCAvenue response signature
 * @param {object} responseData - Parsed response data
 * @returns {boolean} - True if response is valid
 */
function validateResponse(responseData) {
    const requiredFields = ['order_id', 'order_status', 'tracking_id', 'bank_ref_no', 'amount'];
    
    for (const field of requiredFields) {
        if (!responseData[field]) {
            console.error(`Missing required field in payment response: ${field}`);
            return false;
        }
    }
    
    return true;
}

/**
 * Get payment status mapping
 * @param {string} ccavenueStatus - CCAvenue payment status
 * @returns {string} - Mapped internal status
 */
function mapPaymentStatus(ccavenueStatus) {
    const statusMap = {
        'Success': 'completed',
        'Failure': 'failed',
        'Aborted': 'cancelled',
        'Invalid': 'failed',
        'Awaited': 'pending'
    };
    
    return statusMap[ccavenueStatus] || 'failed';
}

/**
 * Generate deep link URL for mobile app
 * @param {string} status - Payment status (success/failure)
 * @param {string} orderId - Order ID
 * @param {object} additionalData - Additional data to pass
 * @returns {string} - Deep link URL
 */
function generateDeepLink(status, orderId, additionalData = {}) {
    const baseScheme = 'sreenidhifuels://payment-';
    const statusUrl = status === 'completed' ? 'success' : 'failed';
    
    const params = new URLSearchParams({
        orderId,
        status,
        timestamp: new Date().toISOString(),
        ...additionalData
    });
    
    return `${baseScheme}${statusUrl}?${params.toString()}`;
}

module.exports = {
    encrypt,
    decrypt,
    parseResponse,
    generatePaymentRequest,
    validateResponse,
    mapPaymentStatus,
    generateDeepLink
}; 