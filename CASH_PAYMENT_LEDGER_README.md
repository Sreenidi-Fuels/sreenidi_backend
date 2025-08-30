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
Driver Updates Order with CustomersCash (stored, no ledger entry yet)
    ↓
Invoice Confirmed (NO ledger entries created)
    ↓
Invoice Finalised
    ↓
System Creates BOTH Entries:
    - CREDIT Entry (using CustomersCash)
    - DEBIT Entry (using Total amount)
```

### 2. **Ledger Entry Creation**

#### **CREDIT Entry (Payment Received)**
- **When**: Invoice status is set to 'finalised' ONLY (for cash payments)
- **Amount**: Uses `CustomersCash` value from the order
- **Method**: `LedgerService.createPaymentEntry()` with `paymentMethod: 'cash'`
- **Description**: "Cash payment received - X liters fuel delivered"

#### **DEBIT Entry (Fuel Delivered)**
- **When**: Invoice status is set to 'finalised' ONLY
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
// ✅ Store CustomersCash for later ledger entry creation (when invoice is confirmed)
if (CustomersCash !== undefined && CustomersCash > 0 && order.paymentType === 'cash') {
    console.log('💰 Cash payment collected and stored for ledger entry');
    console.log('Note: CREDIT entry will be created when invoice is confirmed');
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

#### **Modified invoice update (BOTH entries for cash payments):**
```javascript
// For cash payments, create BOTH CREDIT and DEBIT entries
if (actualPaymentMethod === 'cash' && order && order.CustomersCash > 0) {
    // 1. Create CREDIT entry using CustomersCash
    const creditResult = await LedgerService.createPaymentEntry(
        invoice.userId._id,
        invoice.orderId._id,
        order.CustomersCash,
        `Cash payment received - ${order.fuelQuantity}L fuel delivered`,
        {
            paymentMethod: 'cash',
            transactionId: `CASH_${order._id}_${Date.now()}`,
            bankRefNo: `CASH_${order._id}`,
            trackingId: `CASH_${order._id}`,
            invoiceId: invoice._id
        }
    );
    
    // 2. Create DEBIT entry using order total amount
    const debitResult = await LedgerService.createDeliveryEntry(
        invoice.userId._id,
        invoice.orderId._id,
        order.amount, // Use order total amount for cash payments
        `Fuel delivered - ${order.fuelQuantity}L fuel (Total: ₹${order.amount}) - Status: ${status || invoice.status}`,
        {
            paymentMethod: 'cash',
            invoiceId: invoice._id
        }
    );
} else {
    // For non-cash payments, create only DEBIT entry as before
    const ledgerResult = await LedgerService.createDeliveryEntry(/* ... */);
}
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
2. Update delivery details with `CustomersCash` amount (no ledger entry created yet)
3. Confirm invoice (NO ledger entries should be created)
4. Finalise invoice to trigger BOTH entries
5. Verify CREDIT entry is created with `CustomersCash` amount
6. Verify DEBIT entry is created with order total amount
7. Check ledger balance calculations

## 🔧 Troubleshooting

### **Common Issues:**

1. **CREDIT entry not created**: Check if `CustomersCash > 0`, `paymentType === 'cash'`, and invoice is finalised
2. **Wrong amounts**: Verify order has correct `amount` and `CustomersCash` values
3. **Payment method mismatch**: Ensure `paymentMethod` is passed correctly to ledger service
4. **Missing order data**: Check if order is properly populated when creating ledger entries
5. **Both entries not created**: Ensure invoice status is set to 'finalised' ONLY
6. **Duplicate entries**: System now automatically prevents duplicates by checking existing entries before creation

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

