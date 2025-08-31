# Credit System - Complete Guide

This document explains how the credit system works in your application, including all APIs, field mappings, and business logic.

## 🎯 **Overview**

The credit system allows users with `credited` role to place orders without immediate payment, up to their credit limit. The system tracks outstanding amounts, available credit, and payment history.

## 🏗️ **System Architecture**

### **Models Involved:**
1. **User Model** - Stores credit eligibility and limits
2. **UserLedger Model** - Tracks financial transactions and outstanding amounts
3. **LedgerEntry Model** - Records individual credit payments and fuel deliveries

### **Key Components:**
1. **Credit Controller** - Manages credit operations
2. **Credit Routes** - API endpoints for credit management
3. **Credit Middleware** - Validates credit orders and eligibility

## 📊 **Field Mapping & Business Logic**

### **User Model Fields:**
```javascript
{
  role: 'credited' | 'normal',           // Credit eligibility checkbox
  creditFuelRate: Number,                // User specific rate (special fuel rate)
  creditLimit: Number                    // Credit Amount (maximum credit allowed)
}
```

### **UserLedger Model Fields:**
```javascript
{
  outstandingAmount: Number,             // Current debt (totalOrders - totalPaid)
  totalOrders: Number,                   // Total fuel delivered value
  totalPaid: Number,                     // Total payments received
  currentBalance: Number                 // Net balance (can be negative)
}
```

### **Calculated Fields:**
```javascript
// Formula: amountOfCreditAvailable = creditLimit - outstandingAmount
// Formula: outstandingAmount = totalOrders - totalPaid

// Example:
// creditLimit: ₹500 (user can order up to ₹500)
// outstandingAmount: ₹200 (user owes ₹200)
// amountOfCreditAvailable: ₹300 (user can still order ₹300 worth)
```

## 🔄 **Credit Order Flow**

### **1. Credit Order Creation:**
```
User places credit order → Credit validation → Order created → Fuel delivered
    ↓
DEBIT entry created (fuel delivered)
    ↓
outstandingAmount increases
    ↓
amountOfCreditAvailable decreases
```

### **2. Credit Payment Flow:**
```
User pays admin → Credit payment recorded → CREDIT entry created
    ↓
totalPaid increases
    ↓
outstandingAmount decreases
    ↓
amountOfCreditAvailable increases
```

### **3. Credit Limit Management:**
```
Admin sets credit limit → User can order up to that amount
    ↓
Each order reduces available credit
    ↓
Each payment increases available credit
    ↓
User cannot exceed credit limit
```

## 📡 **API Endpoints**

### **1. Credit Details API**

#### **GET /api/credit/:id/details**
**Purpose**: Get comprehensive credit information for a user

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user_id",
    "name": "User Name",
    "companyName": "Company Ltd",
    "role": "credited",
    "userSpecificRate": 19,
    "creditLimit": 500,
    "isCreditEligible": true,
    "currentBalance": -2000,
    "totalPaid": 0,
    "totalOrders": 2000,
    "outstandingAmount": 2000,
    "amountOfCreditAvailable": 0,
    "canPlaceOrder": false
  }
}
```

#### **PUT /api/credit/:id/details**
**Purpose**: Update user's credit limit, fuel rate, or role

**Request Body:**
```json
{
  "creditLimit": 1000,
  "creditFuelRate": 20,
  "role": "credited"
}
```

### **2. Credit Payment API**

#### **POST /api/credit/:id/payment**
**Purpose**: Record a credit payment from user

**Request Body:**
```json
{
  "date": "2025-01-30",
  "amountReceived": 2000,
  "amountRefId": "CASH_001"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "payment": {
      "date": "2025-01-30",
      "amountReceived": 2000,
      "amountRefId": "CASH_001"
    },
    "updatedCredit": {
      "creditLimit": 500,
      "outstandingAmount": 0,
      "amountOfCreditAvailable": 500
    }
  }
}
```

#### **GET /api/credit/:id/payment**
**Purpose**: Get credit payment history

**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "amount": 2000,
        "description": "Credit payment received - CASH_001",
        "paymentMethod": "credit",
        "transactionId": "CASH_001",
        "createdAt": "2025-01-30T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 1,
      "itemsPerPage": 10
    }
  }
}
```

#### **PUT /api/credit/:id/payment**
**Purpose**: Update existing credit payment record

**Request Body:**
```json
{
  "paymentId": "payment_id",
  "date": "2025-01-30",
  "amountReceived": 2000,
  "amountRefId": "TXN123456"
}
```

### **3. Credit Validation API**

#### **POST /api/credit/:id/validate-order**
**Purpose**: Check if user can place a credit order

**Request Body:**
```json
{
  "orderAmount": 300
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "canPlaceOrder": true,
    "orderAmount": 300,
    "creditLimit": 500,
    "outstandingAmount": 0,
    "amountOfCreditAvailable": 500,
    "remainingCreditAfterOrder": 200
  }
}
```

## 🛡️ **Credit Validation Middleware**

### **1. validateCreditOrder**
- **Purpose**: Prevents orders exceeding available credit
- **Usage**: Add to order creation routes
- **Validation**: Checks if order amount ≤ amountOfCreditAvailable

### **2. checkCreditEligibility**
- **Purpose**: Basic credit eligibility check
- **Usage**: Simple validation before order creation
- **Validation**: Checks user role and credit limit existence

### **3. getCreditStatus**
- **Purpose**: Adds credit information to request
- **Usage**: Get credit status without validation
- **Output**: Adds `req.userCreditStatus` to request object

## 💡 **Business Rules**

### **Credit Order Rules:**
1. **User must have `role: 'credited'`**
2. **User must have positive `creditLimit`**
3. **Order amount ≤ amountOfCreditAvailable**
4. **Credit orders create DEBIT ledger entries**

### **Credit Payment Rules:**
1. **Only credited users can make credit payments**
2. **Payments create CREDIT ledger entries**
3. **Payments reduce outstanding amounts**
4. **Payments increase available credit**

### **Credit Limit Rules:**
1. **Credit limit cannot be negative**
2. **Credit limit is independent of outstanding amounts**
3. **Changing credit limit affects future order capacity**
4. **Credit limit doesn't affect existing debt**

## 🔍 **Example Scenarios**

### **Scenario 1: New Credit User**
```javascript
// Initial state
creditLimit: 500
outstandingAmount: 0
amountOfCreditAvailable: 500

// User orders ₹300 worth of fuel
outstandingAmount: 300
amountOfCreditAvailable: 200

// User can still order up to ₹200 more
```

### **Scenario 2: Existing Debt User**
```javascript
// User owes ₹2000, credit limit ₹500
creditLimit: 500
outstandingAmount: 2000
amountOfCreditAvailable: 0 (negative, can't order)

// User pays ₹2000
outstandingAmount: 0
amountOfCreditAvailable: 500 (can order up to ₹500)
```

### **Scenario 3: Credit Limit Increase**
```javascript
// User has ₹500 limit, owes ₹200
creditLimit: 500
outstandingAmount: 200
amountOfCreditAvailable: 300

// Admin increases limit to ₹1000
creditLimit: 1000
outstandingAmount: 200
amountOfCreditAvailable: 800 (can order ₹800 more)
```

## 🚀 **Integration with Existing System**

### **Order Creation:**
- Credit orders use existing order creation flow
- Credit validation happens before order creation
- Ledger entries created when invoice is finalised

### **Invoice System:**
- Credit orders create DEBIT entries on invoice finalisation
- Credit payments create CREDIT entries immediately
- All entries use existing LedgerService

### **User Management:**
- Existing user endpoints work with credit system
- Credit information added to user responses
- No changes to existing user creation/update flow

## ⚠️ **Important Notes**

### **Data Consistency:**
1. **Credit limit changes don't affect existing debt**
2. **Payments immediately update available credit**
3. **Orders immediately reduce available credit**
4. **All calculations use real-time data**

### **Error Handling:**
1. **Invalid credit orders return 400 with details**
2. **Credit validation failures don't break other systems**
3. **Payment recording failures are logged and reported**
4. **Database transactions ensure data integrity**

### **Performance:**
1. **Credit validation happens on every order**
2. **Payment history supports pagination**
3. **Credit calculations are optimized**
4. **Middleware can be disabled if needed**

## 🔧 **Testing the Credit System**

### **1. Test Credit User Creation:**
```bash
# Create user with credit role
PUT /api/users/:id
{
  "role": "credited",
  "creditLimit": 500,
  "creditFuelRate": 19
}
```

### **2. Test Credit Order Validation:**
```bash
# Validate credit order
POST /api/credit/:id/validate-order
{
  "orderAmount": 300
}
```

### **3. Test Credit Payment:**
```bash
# Record credit payment
POST /api/credit/:id/payment
{
  "amountReceived": 2000,
  "amountRefId": "CASH_001"
}
```

### **4. Test Credit Details:**
```bash
# Get credit information
GET /api/credit/:id/details
```

## 🎯 **Summary**

The credit system provides:
- **Comprehensive credit management** for users
- **Real-time credit validation** for orders
- **Flexible payment recording** with transaction tracking
- **Seamless integration** with existing order and ledger systems
- **Robust validation** preventing credit limit violations

All credit operations maintain data consistency and provide detailed feedback for better user experience.

