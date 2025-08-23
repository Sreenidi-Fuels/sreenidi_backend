# Cash Payment Ledger System

This document explains how the cash payment system works in the ledger after the recent modifications.

## 🎯 Overview

The system now handles cash payments differently in the ledger:
- **DEBIT entries** (fuel delivered) use the **Total amount** from the order
- **CREDIT entries** (payment received) use the **CustomersCash** amount
- This only applies when `paymentMethod` is `cash`

## 🔄 How It Works

### 1. **Cash Payment Flow**

```
Order Created (paymentType: 'cash') 
    ↓
Driver Delivers Fuel + Collects Cash
    ↓
Driver Updates Order with CustomersCash
    ↓
System Creates CREDIT Entry (using CustomersCash)
    ↓
Invoice Confirmed
    ↓
System Creates DEBIT Entry (using Total amount)
```

### 2. **Ledger Entry Creation**

#### **CREDIT Entry (Payment Received)**
- **When**: Driver updates delivery details with `CustomersCash`
- **Amount**: Uses `CustomersCash` value from the order
- **Method**: `LedgerService.createPaymentEntry()` with `paymentMethod: 'cash'`
- **Description**: "Cash payment received - X liters fuel delivered"

#### **DEBIT Entry (Fuel Delivered)**
- **When**: Invoice status is set to 'confirmed' or 'finalised'
- **Amount**: Uses order's `total amount` (not the passed amount)
- **Method**: `LedgerService.createDeliveryEntry()` with `paymentMethod: 'cash'`
- **Description**: "Fuel delivered - X liters fuel (Total: ₹X)"

## 📝 Code Changes Made

### 1. **Ledger Service (`services/ledger.service.js`)**

#### **Modified `createPaymentEntry` method:**
```javascript
// For cash payments, use CustomersCash amount instead of the passed amount
let paymentAmount = amount;
if (paymentMethod === 'cash' && order && order.CustomersCash !== null && order.CustomersCash !== undefined) {
    paymentAmount = order.CustomersCash;
    console.log(`💰 Cash payment detected: Using CustomersCash (₹${paymentAmount}) instead of passed amount (₹${amount})`);
}
```

#### **Modified `createDeliveryEntry` method:**
```javascript
// For cash payments, use the order's total amount instead of the passed amount
let deliveryAmount = amount;
if (paymentMethod === 'cash' && order && order.amount !== null && order.amount !== undefined) {
    deliveryAmount = order.amount;
    console.log(`🚛 Cash delivery detected: Using order total amount (₹${deliveryAmount}) instead of passed amount (₹${amount})`);
}
```

#### **Added backward compatibility methods:**
```javascript
static async createCreditEntry(userId, orderId, amount, description, options) {
    return this.createPaymentEntry(userId, orderId, amount, description, options);
}

static async createDebitEntry(userId, orderId, amount, description, options) {
    return this.createDeliveryEntry(userId, orderId, amount, description, options);
}
```

### 2. **Order Controller (`controllers/order.controller.js`)**

#### **Modified `updateDriverDeliveryDetails` method:**
```javascript
// ✅ Create CREDIT entry for cash payment when CustomersCash is provided
if (CustomersCash !== undefined && CustomersCash > 0 && order.paymentType === 'cash') {
    await LedgerService.createPaymentEntry(
        order.userId,
        order._id,
        CustomersCash,
        `Cash payment received - ${order.fuelQuantity}L fuel delivered`,
        {
            paymentMethod: 'cash',
            transactionId: `CASH_${order._id}_${Date.now()}`,
            bankRefNo: `CASH_${order._id}`,
            trackingId: `CASH_${order._id}`
        }
    );
}
```

### 3. **Invoice Controller (`controllers/invoice.controller.js`)**

#### **Modified invoice creation:**
```javascript
// Use the actual payment method from the order
const actualPaymentMethod = order.paymentType || 'credit';
await LedgerService.createCreditEntry(
    order.userId._id,
    order._id,
    amount,
    `Invoice created - ${order.fuelQuantity}L fuel`,
    {
        paymentMethod: actualPaymentMethod,
        invoiceId: invoice._id
    }
);
```

#### **Modified invoice update (delivery entry):**
```javascript
// Get the actual payment method from the order
const Order = require('../models/Order.model.js');
const order = await Order.findById(invoice.orderId._id);
const actualPaymentMethod = order ? order.paymentType : 'credit';

const ledgerResult = await LedgerService.createDeliveryEntry(
    invoice.userId._id,
    invoice.orderId._id,
    deliveryAmount,
    `Fuel delivered - ${invoice.fuelQuantity}L fuel (Total: ₹${deliveryAmount}) - Status: ${status || invoice.status}`,
    {
        paymentMethod: actualPaymentMethod,
        invoiceId: invoice._id
    }
);
```

## 🧮 Example Calculation

### **Scenario**: Cash Order for 100L fuel at ₹50/L

```
Order Amount: ₹5,000
CustomersCash: ₹4,800 (driver collected)
```

#### **Ledger Entries:**

1. **CREDIT Entry (Payment Received)**
   - Amount: ₹4,800 (CustomersCash)
   - Type: credit
   - Description: "Cash payment received - 100L fuel delivered"

2. **DEBIT Entry (Fuel Delivered)**
   - Amount: ₹5,000 (Order total amount)
   - Type: debit
   - Description: "Fuel delivered - 100L fuel (Total: ₹5,000)"

#### **Result:**
- **Total Paid**: ₹4,800
- **Total Orders**: ₹5,000
- **Outstanding**: ₹200 (company owes user ₹200 worth of fuel)

## 🔍 Monitoring and Logging

The system now provides detailed logging for cash payments:

```
💰 Cash payment detected: Using CustomersCash (₹4800) instead of passed amount (₹5000)
🚛 Cash delivery detected: Using order total amount (₹5000) instead of passed amount (₹4800)
📋 Order payment type: cash
💰 Using payment method for ledger entry: cash
```

## ⚠️ Important Notes

1. **Cash payments only**: This logic only applies when `paymentMethod` is `cash`
2. **Credit/Online payments**: Continue to use the passed amounts as before
3. **Backward compatibility**: All existing methods continue to work
4. **Error handling**: Ledger failures don't break order/invoice operations
5. **Duplicate prevention**: System prevents duplicate ledger entries

## 🚀 Testing

To test the cash payment system:

1. Create an order with `paymentType: 'cash'`
2. Update delivery details with `CustomersCash` amount
3. Verify CREDIT entry is created with `CustomersCash` amount
4. Confirm invoice to trigger DEBIT entry
5. Verify DEBIT entry is created with order total amount
6. Check ledger balance calculations

## 🔧 Troubleshooting

### **Common Issues:**

1. **CREDIT entry not created**: Check if `CustomersCash > 0` and `paymentType === 'cash'`
2. **Wrong amounts**: Verify order has correct `amount` and `CustomersCash` values
3. **Payment method mismatch**: Ensure `paymentMethod` is passed correctly to ledger service
4. **Missing order data**: Check if order is properly populated when creating ledger entries

### **Debug Commands:**

```javascript
// Check order payment details
console.log('Order payment type:', order.paymentType);
console.log('Order amount:', order.amount);
console.log('CustomersCash:', order.CustomersCash);

// Check ledger entries
const ledgerEntries = await LedgerEntry.find({ orderId: order._id });
console.log('Ledger entries:', ledgerEntries);
```

