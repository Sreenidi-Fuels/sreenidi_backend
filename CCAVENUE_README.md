# CCAvenue Payment Integration

This document provides comprehensive information about the CCAvenue payment gateway integration in the Sreenidhi Fuels backend.

## 🚀 Features

- **Secure Payment Processing**: AES-128-CBC encryption for all payment data
- **Multiple Payment Modes**: Support for Card, UPI, NetBanking
- **Mobile Deep Linking**: Custom URL schemes for mobile app integration
- **Comprehensive Logging**: Secure logging without sensitive data exposure
- **Error Handling**: Robust error handling and validation
- **Rate Limiting**: Protection against payment abuse
- **Order Management**: Seamless integration with existing order system

## 📋 Prerequisites

1. **CCAvenue Merchant Account**: Obtain from CCAvenue
2. **SSL Certificate**: HTTPS required for production
3. **Node.js Environment**: Node.js 14+ with Express.js
4. **MongoDB Database**: For order and payment tracking

## 🔧 Setup Instructions

### 1. Environment Configuration

Copy the configuration from `ccavenue.config.example` to your `.env` file:

```bash
# Required CCAvenue Configuration
CCAVENUE_MERCHANT_ID=your_merchant_id
CCAVENUE_ACCESS_CODE=your_access_code
CCAVENUE_WORKING_KEY=your_working_key
BASE_URL=https://api.sreenidhifuels.com
```

### 2. Install Dependencies

No additional npm packages required - uses Node.js built-in `crypto` module.

### 3. Database Migration

The Order model has been updated with payment fields. No migration script needed as Mongoose handles schema updates automatically.

### 4. Server Configuration

The CCAvenue routes are automatically included in `server.js`.

## 📚 API Endpoints

### 1. Initiate Payment

```
POST /api/ccavenue/initiate-payment
```

**Request Body:**
```json
{
  "orderId": "60a5f1234567890123456789",
  "userId": "60a5f1234567890123456788",
  "amount": 1500.50,
  "currency": "INR",
  "billingAddressId": "60a5f1234567890123456787",
  "shippingAddressId": "60a5f1234567890123456786",
  "redirectUrl": "https://app.sreenidhifuels.com/payment-success",
  "cancelUrl": "https://app.sreenidhifuels.com/payment-cancel"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Payment request generated successfully",
  "data": {
    "paymentUrl": "https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction",
    "formData": {
      "merchant_id": "123456",
      "access_code": "AVXP01234567",
      "encRequest": "encrypted_payment_data..."
    },
    "orderId": "60a5f1234567890123456789",
    "amount": "1500.50",
    "currency": "INR"
  }
}
```

### 2. Payment Response Callback

```
POST /api/ccavenue/payment-response
```

**Request Body (from CCAvenue):**
```json
{
  "encResp": "encrypted_response_from_ccavenue"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Payment completed successfully",
  "data": {
    "orderId": "60a5f1234567890123456789",
    "transactionId": "TXN123456789",
    "amount": "1500.50",
    "paymentMode": "Credit Card",
    "bankRefNo": "REF123456",
    "deepLink": "sreedifuels://payment-success?orderId=..."
  }
}
```

### 3. Payment Cancellation Callback

```
POST /api/ccavenue/payment-cancel
```

**Request Body (from CCAvenue):**
```json
{
  "encResp": "encrypted_cancellation_response"
}
```

### 4. Get Payment Status

```
GET /api/ccavenue/payment-status/:orderId?userId=userId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "60a5f1234567890123456789",
    "paymentStatus": "completed",
    "paymentMethod": "ccavenue",
    "transactionId": "TXN123456789",
    "amount": 1500.50,
    "paidAt": "2024-01-15T10:30:00Z"
  }
}
```

### 5. Retry Payment

```
POST /api/ccavenue/retry-payment
```

**Request Body:**
```json
{
  "orderId": "60a5f1234567890123456789"
}
```

### 6. Test Configuration (Development Only)

```
GET /api/ccavenue/test-config
```

## 🔄 Payment Flow

### 1. Frontend Integration

```javascript
// Initiate payment
const initiatePayment = async (orderData) => {
  try {
    const response = await fetch('/api/ccavenue/initiate-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Create form and submit to CCAvenue
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = result.data.paymentUrl;
      
      Object.keys(result.data.formData).forEach(key => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = result.data.formData[key];
        form.appendChild(input);
      });
      
      document.body.appendChild(form);
      form.submit();
    }
  } catch (error) {
    console.error('Payment initiation failed:', error);
  }
};
```

### 2. Mobile App Integration

The integration provides deep links for mobile app handling:

```
// Success
sreenidhifuels://payment-success?orderId=123&status=completed&transactionId=TXN123

// Failure  
sreenidhifuels://payment-failed?orderId=123&status=failed&reason=insufficient_funds

// Cancelled
sreenidhifuels://payment-failed?orderId=123&status=cancelled&reason=cancelled_by_user
```

## 📊 Order Model Updates

The Order model now includes comprehensive payment tracking:

```javascript
{
  // Existing fields...
  paymentType: {
    type: String,
    enum: ['credit', 'cash', 'online']
  },
  paymentDetails: {
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled',
    method: 'ccavenue' | 'cash' | 'credit',
    transactionId: String,
    bankRefNo: String,
    trackingId: String,
    paymentMode: String, // Card, NetBanking, UPI
    bankName: String,
    amount: Number,
    currency: String,
    paidAt: Date,
    failureReason: String,
    retryCount: Number
  }
}
```

## 🔒 Security Features

### 1. Encryption
- AES-128-CBC encryption for all payment data
- MD5 hashing of working key
- Secure handling of sensitive information

### 2. Validation
- Order ownership validation
- Amount tampering prevention
- Payment status verification
- Retry limit enforcement

### 3. Logging
- Comprehensive operation logging
- No sensitive data in logs
- IP address tracking
- Rate limiting protection

### 4. Error Handling
- Secure error responses
- No information leakage
- Proper HTTP status codes
- Development/production error handling

## 🚀 Deployment

### Render.com Configuration

1. **Environment Variables**: Set all required CCAvenue variables
2. **HTTPS**: Ensure SSL certificate is configured
3. **Database**: Configure MongoDB connection
4. **Logs**: Monitor payment logs for issues

### Health Check

Use the test configuration endpoint to verify setup:

```bash
curl -X GET https://your-api-domain.com/api/ccavenue/test-config
```

## 🔍 Monitoring and Logging

### Payment Logs
All payment operations are logged with:
- Timestamp
- Operation type
- Order ID and amount
- IP address
- Success/failure status

### Error Monitoring
- Payment failures are logged with reasons
- Configuration errors are captured
- Rate limiting violations are tracked

## 🛠️ Troubleshooting

### Common Issues

1. **Configuration Errors**
   - Verify all environment variables are set
   - Check CCAvenue credentials validity
   - Ensure BASE_URL is accessible

2. **Payment Failures**
   - Check amount formatting (must be decimal)
   - Verify order exists and belongs to user
   - Check payment hasn't already been completed

3. **Callback Issues**
   - Ensure callback URLs are accessible via HTTPS
   - Verify working key matches CCAvenue configuration
   - Check for proper encryption/decryption

### Testing

1. Use CCAvenue test credentials for development
2. Test all payment scenarios (success, failure, cancellation)
3. Verify deep link functionality
4. Test rate limiting behavior

## 📞 Support

For CCAvenue-specific issues:
- CCAvenue Technical Support
- CCAvenue Documentation: https://www.ccavenue.com/developers.jsp

For implementation issues:
- Check server logs for detailed error messages
- Verify all configuration steps
- Test with minimal payload first

## 🔄 Version History

- **v1.0.0**: Initial CCAvenue integration
  - Basic payment flow
  - AES-128-CBC encryption
  - Mobile deep linking
  - Comprehensive error handling
  - Security middleware 