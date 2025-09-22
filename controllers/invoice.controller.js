const Invoice = require('../models/Invoice.model.js');
const Order = require('../models/Order.model.js');
const Vehicle = require('../models/Vehicle.model.js');
const Address = require('../models/Address.model.js');
const LedgerService = require('../services/ledger.service.js');
const LedgerEntry = require('../models/LedgerEntry.model.js');  // ← Add LedgerEntry import

// Helpers
const roundTo2 = (num) => Math.round((Number(num || 0)) * 100) / 100;

const computeTaxes = (deliveryCharges) => {
  const dc = roundTo2(deliveryCharges || 0);
  const cgst = dc > 0 ? roundTo2(dc * 0.09) : 0;
  const sgst = dc > 0 ? roundTo2(dc * 0.09) : 0;
  return { deliveryCharges: dc, cgst, sgst };
};

/**
 * @desc    Create a new invoice
 * @route   POST /api/invoice
 * @access  Private
 */
const createInvoice = async (req, res) => {
  try {
    const {
      orderId,
      vehicleId,
      remarks = "",
      paymentMethod,
      destination,
      rate,
      amount,
      deliveryCharges,
      cgst: cgstOverride,
      sgst: sgstOverride,
      totalAmount,
      amountInChargeable,
      invoiceAmount,
      jcno
    } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Order ID is required' });
    }

    // amount is optional; frontend may send it later via update

    const order = await Order.findById(orderId)
      .populate('userId', 'name email mobile role creditFuelRate')
      .populate('shippingAddress')
      .populate('billingAddress');

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    let vehicle = null;
    if (vehicleId) {
      vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) {
        return res.status(404).json({ success: false, error: 'Vehicle not found' });
      }
    }

    const existingInvoice = await Invoice.findOne({ orderId });
    if (existingInvoice) {
      return res.status(400).json({ success: false, error: 'Invoice already exists for this order' });
    }

    const invoiceNo = await Invoice.generateInvoiceNumber();

    // Taxes: prefer explicit values from request, else inherit from order, else compute from deliveryCharges
    const deliveryChargesInput = (deliveryCharges !== undefined ? deliveryCharges : (order.deliveryCharges !== undefined ? order.deliveryCharges : 0));
    let taxes = {
      deliveryCharges: deliveryChargesInput,
      cgst: (cgstOverride !== undefined ? cgstOverride : (order.cgst !== undefined ? order.cgst : undefined)),
      sgst: (sgstOverride !== undefined ? sgstOverride : (order.sgst !== undefined ? order.sgst : undefined))
    };
    // If cgst/sgst are still undefined, compute them from deliveryChargesInput
    if (taxes.cgst === undefined || taxes.sgst === undefined) {
      const { deliveryCharges: dc, cgst, sgst } = computeTaxes(deliveryChargesInput);
      taxes.deliveryCharges = dc;
      taxes.cgst = taxes.cgst === undefined ? cgst : taxes.cgst;
      taxes.sgst = taxes.sgst === undefined ? sgst : taxes.sgst;
    }

    const effectiveAmount = amount ?? invoiceAmount ?? null;

    const derivedPaymentMethod = paymentMethod ?? order.paymentDetails?.method ?? order.paymentType ?? null;

    // Derive default rate for driver-initiated cash orders when not provided
    let defaultRate = null;
    try {
      if (order.paymentType === 'cash' && order.orderType === 'driver-initiated') {
        // Prefer driver's creditFuelRate if driver assigned
        let driverRate = null;
        try {
          const Driver = require('../models/Driver.model.js');
          const driverId = order?.tracking?.driverAssignment?.driverId;
          if (driverId) {
            const driver = await Driver.findById(driverId).select('creditFuelRate');
            if (driver && driver.creditFuelRate) driverRate = Number(driver.creditFuelRate);
          }
        } catch (_) {}

        if (driverRate != null) {
          defaultRate = driverRate;
        } else {
          // Fallbacks: credited user's rate, otherwise admin dailyRate
          if (order.userId && order.userId.role === 'credited' && order.userId.creditFuelRate) {
            defaultRate = Number(order.userId.creditFuelRate);
          } else {
            const Admin = require('../models/Admin.model.js');
            const admin = await Admin.findOne().select('dailyRate');
            if (admin && admin.dailyRate != null) defaultRate = Number(admin.dailyRate);
          }
        }
      }
    } catch (_) {}

    const invoiceData = {
      invoiceNo,
      invoiceDate: new Date(),
      orderId: order._id,
      userId: order.userId._id,
      vehicleId: vehicle ? vehicle._id : null,
      shippingAddress: order.shippingAddress?._id || null,
      billingAddress: order.billingAddress?._id || null,
      dispatchedThrough: null, // Will be updated later from frontend
      vehicleNO: vehicle ? vehicle.vehicleNo : null,
      jcno: jcno ?? order.jcno ?? null,
      fuelQuantity: order.fuelQuantity,
      // Values provided by frontend
      amount: effectiveAmount,
      rate: rate ?? defaultRate,
      totalAmount: totalAmount ?? null,
      amountInChargeable: amountInChargeable ?? "",
      // Other fields
      paymentMethod: derivedPaymentMethod,
      destination: destination ?? (order.shippingAddress?.city || ''),
      deliveryCharges: taxes.deliveryCharges,
      cgst: taxes.cgst,
      sgst: taxes.sgst,
      remarks,
      status: 'issued'
    };

    // Enforce JC NO uniqueness on create if provided (non-empty)
    if (invoiceData.jcno && invoiceData.jcno.trim() !== '') {
      const exists = await Invoice.findOne({ jcno: invoiceData.jcno }).select('_id');
      if (exists) {
        return res.status(400).json({ success: false, error: 'JC No already exists. Please use a unique JC No.' });
      }
    }

    const invoice = new Invoice(invoiceData);
    await invoice.save();

    // Create ledger credit entry for invoice creation
    if (effectiveAmount && effectiveAmount > 0) {
      try {
        // Use the actual payment method from the order
        const actualPaymentMethod = order.paymentType || 'credit';
        console.log('📋 Invoice creation - Order payment type:', actualPaymentMethod);
        console.log('💰 Using payment method for ledger entry:', actualPaymentMethod);
        
        await LedgerService.createCreditEntry(
          order.userId._id,
          order._id,
          effectiveAmount,
          `Invoice created - ${order.fuelQuantity}L fuel`,
          {
            paymentMethod: actualPaymentMethod,
            invoiceId: invoice._id
          }
        );
      } catch (ledgerError) {
        console.error('Ledger credit entry creation failed:', ledgerError);
        // Don't fail the invoice creation if ledger fails
      }
    }

    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate('orderId')
      .populate('userId', 'name email mobile')
      .populate('vehicleId')
      .populate('shippingAddress')
      .populate('billingAddress');

    res.status(201).json({ success: true, message: 'Invoice created successfully', data: populatedInvoice });

  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ success: false, error: 'Failed to create invoice', details: error.message });
  }
};

/**
 * @desc    Get all invoices
 * @route   GET /api/invoice
 * @access  Private
 */
const getAllInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, userId } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (userId) query.userId = userId;

    const invoices = await Invoice.find(query)
      .populate('orderId')
      .populate('userId', 'name email mobile')
      .populate('vehicleId')
      .populate('shippingAddress')
      .populate('billingAddress')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Invoice.countDocuments(query);

    res.status(200).json({
      success: true,
      data: invoices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch invoices', details: error.message });
  }
};

/**
 * @desc    Get invoice by ID
 * @route   GET /api/invoice/:id
 * @access  Private
 */
const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findById(id)
      .populate({
        path: 'orderId',
        populate: { path: 'tracking.driverAssignment.driverId', select: 'name mobile role creditFuelRate' }
      })
      .populate('userId', 'name email mobile')
      .populate('vehicleId')
      .populate('shippingAddress')
      .populate('billingAddress');

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // Enrich response for driver-initiated cash orders
    let enriched = invoice;
    try {
      const ord = invoice?.orderId;
      if (ord && ord.paymentType === 'cash' && ord.orderType === 'driver-initiated') {
        const drv = ord?.tracking?.driverAssignment?.driverId;
        const driverInfo = drv ? {
          driverId: drv._id,
          name: drv.name,
          mobile: drv.mobile,
          role: drv.role,
          creditFuelRate: drv.creditFuelRate || null
        } : null;
        enriched = invoice.toObject ? invoice.toObject() : invoice;
        enriched.driverInfo = driverInfo;
      }
    } catch (_) {}

    res.status(200).json({ success: true, data: enriched });

  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch invoice', details: error.message });
  }
};

/**
 * @desc    Get invoices by order ID
 * @route   GET /api/invoice/order/:orderId
 * @access  Private
 */
const getInvoicesByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;

    const invoices = await Invoice.find({ orderId })
      .populate('orderId')
      .populate('userId', 'name email mobile')
      .populate('vehicleId')
      .populate('shippingAddress')
      .populate('billingAddress')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: invoices });

  } catch (error) {
    console.error('Error fetching invoices by order:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch invoices', details: error.message });
  }
};

/**
 * @desc    Update invoice
 * @route   PUT /api/invoice/:id
 * @access  Private
 */
const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks, status, paymentMethod, destination, rate, amount, invoiceAmount, deliveryCharges, cgst, sgst, totalAmount, amountInChargeable, vehicleId, vehicleNO, dispatchedThrough, jcno } = req.body;

    const updateData = {};
    if (remarks !== undefined) updateData.remarks = remarks;
    if (status !== undefined) updateData.status = status;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (destination !== undefined) updateData.destination = destination;
    if (jcno !== undefined) {
      // Enforce uniqueness before attempting update
      const exists = await Invoice.findOne({ jcno, _id: { $ne: id } }).select('_id');
      if (exists) {
        return res.status(400).json({ success: false, error: 'JC No already exists. Please use a unique JC No.' });
      }
      updateData.jcno = jcno;
    }
    if (rate !== undefined) updateData.rate = rate;
    if (amount !== undefined || invoiceAmount !== undefined) updateData.amount = amount ?? invoiceAmount;
    if (vehicleId !== undefined) {
      // Verify that the vehicle exists
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) {
        return res.status(404).json({ success: false, error: 'Vehicle not found' });
      }
      updateData.vehicleId = vehicleId;
      // Derive linked fields
      updateData.vehicleNO = vehicle.vehicleNo;
      updateData.dispatchedThrough = vehicle.fuelCapacity;
    } else {
      // Allow direct override if provided without changing the vehicle reference
      if (vehicleNO !== undefined) updateData.vehicleNO = vehicleNO;
      if (dispatchedThrough !== undefined) updateData.dispatchedThrough = dispatchedThrough;
    }

    // If deliveryCharges/cgst/sgst provided: respect explicit values; otherwise compute taxes from deliveryCharges
    if (deliveryCharges !== undefined || cgst !== undefined || sgst !== undefined) {
      const dcVal = deliveryCharges !== undefined ? deliveryCharges : undefined;
      if (dcVal !== undefined && (cgst === undefined || sgst === undefined)) {
        const t = computeTaxes(dcVal);
        updateData.deliveryCharges = t.deliveryCharges;
        if (cgst === undefined) updateData.cgst = t.cgst; else updateData.cgst = cgst;
        if (sgst === undefined) updateData.sgst = t.sgst; else updateData.sgst = sgst;
      } else {
        if (deliveryCharges !== undefined) updateData.deliveryCharges = deliveryCharges;
        if (cgst !== undefined) updateData.cgst = cgst;
        if (sgst !== undefined) updateData.sgst = sgst;
      }
    }

    if (totalAmount !== undefined) updateData.totalAmount = totalAmount;
    if (amountInChargeable !== undefined) updateData.amountInChargeable = amountInChargeable;

    const invoice = await Invoice.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('orderId')
      .populate('userId', 'name email mobile')
      .populate('vehicleId')
      .populate('shippingAddress')
      .populate('billingAddress');

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // ✅ FIX: Create ledger entries ONLY when status is set to 'finalised'
    // This prevents duplicate entries when status changes from 'confirmed' to 'finalised'
    console.log('=== DEBUG: Invoice Status Check ===');
    console.log('Request body status:', status);
    console.log('Updated invoice status:', invoice.status);
    console.log('Status comparison (status === "finalised"):', status === 'finalised');
    
    // Check if we need to create ledger entries
    // ONLY create entries when status is being set to 'finalised'
    const shouldHandleDeliveryEntry = status === 'finalised';
    
    console.log('Should handle delivery entry:', shouldHandleDeliveryEntry);
    console.log('Reason:', shouldHandleDeliveryEntry ? 'Status being set to finalised' : 'Status not finalised - no ledger entries needed');
    
    if (shouldHandleDeliveryEntry) {
      // 🚨 CRITICAL FIX: Validate invoice amounts before creating ledger entries
      const deliveryAmount = invoice.totalAmount || invoice.amount;
      
      // Validate that invoice amount makes sense
      if (!deliveryAmount || deliveryAmount <= 0) {
        console.log('⚠️ Invalid delivery amount:', deliveryAmount);
        return;
      }
      

      
      try {
        console.log('=== Creating BOTH CREDIT and DEBIT Entries for Cash Payment ===');
        console.log('Invoice ID:', invoice._id);
        console.log('Order ID:', invoice.orderId._id);
        console.log('User ID:', invoice.userId._id);
        console.log('Base Amount:', invoice.amount);
        console.log('Total Amount:', invoice.totalAmount);
        console.log('Delivery Amount:', deliveryAmount);
        console.log('Status:', status);
        console.log('Invoice Status:', invoice.status);

        // Get the actual payment method and order details
        const Order = require('../models/Order.model.js');
        const order = await Order.findById(invoice.orderId._id);
        const actualPaymentMethod = order ? order.paymentType : 'credit';
        
        console.log('📋 Order payment type:', actualPaymentMethod);
        console.log('💰 Using payment method for ledger entry:', actualPaymentMethod);
        
        // For cash payments, create BOTH CREDIT and DEBIT entries
        if (actualPaymentMethod === 'cash' && order && order.CustomersCash > 0) {
          console.log('💰 Cash payment detected - Creating BOTH entries');
          console.log('CustomersCash:', order.CustomersCash);
          console.log('Order Total Amount:', order.amount);
          
          // 🚨 CRITICAL: Check for existing entries to prevent duplicates
          const existingCreditEntries = await LedgerEntry.find({
            invoiceId: invoice._id,
            type: 'credit',
            paymentMethod: 'cash'
          });
          
          const existingDebitEntries = await LedgerEntry.find({
            invoiceId: invoice._id,
            type: 'debit',
            paymentMethod: 'cash'
          });
          
          if (existingCreditEntries.length > 0) {
            console.log('🚨 DUPLICATE CREDIT ENTRIES DETECTED for invoice:', invoice._id);
            console.log('Existing entries:', existingCreditEntries.map(e => ({ id: e._id, amount: e.amount, description: e.description })));
            console.log('🗑️ Deleting duplicate CREDIT entries...');
            await LedgerEntry.deleteMany({
              invoiceId: invoice._id,
              type: 'credit',
              paymentMethod: 'cash'
            });
            console.log('✅ Duplicate CREDIT entries deleted');
          }
          
          if (existingDebitEntries.length > 0) {
            console.log('🚨 DUPLICATE DEBIT ENTRIES DETECTED for invoice:', invoice._id);
            console.log('Existing entries:', existingDebitEntries.map(e => ({ id: e._id, amount: e.amount, description: e.description })));
            console.log('🗑️ Deleting duplicate DEBIT entries...');
            await LedgerEntry.deleteMany({
              invoiceId: invoice._id,
              type: 'debit',
              paymentMethod: 'cash'
            });
            console.log('✅ Duplicate DEBIT entries deleted');
          }
          
          // 1. Create CREDIT entry using CustomersCash
          console.log('🆕 Creating CREDIT entry for cash payment received');
          const creditResult = await LedgerService.createPaymentEntry(
            invoice.userId._id,
            invoice.orderId._id,
            order.CustomersCash,
            `Cash payment received - ${order.fuelQuantity}L fuel delivered`,
            {
              paymentMethod: 'cash',
              transactionId: `CASH_${order._id}_${Date.now()}`,
              invoiceId: invoice._id
            }
          );
          console.log('✅ CREDIT entry created successfully for cash payment:', creditResult);
          
          // 2. Create DEBIT entry using invoice total amount (includes taxes and delivery charges)
          console.log('🆕 Creating DEBIT entry for fuel delivery');
          const debitResult = await LedgerService.createDeliveryEntry(
            invoice.userId._id,
            invoice.orderId._id,
            deliveryAmount, // Use invoice total amount (includes taxes) for cash payments
            `Fuel delivered - ${order.fuelQuantity}L fuel (Total: ₹${deliveryAmount}) - Status: ${status || invoice.status}`,
            {
              paymentMethod: 'cash',
              invoiceId: invoice._id
            }
          );
          console.log('✅ DEBIT entry created successfully for fuel delivery:', debitResult);
          
        } else if (actualPaymentMethod === 'credit') {
          // For credit orders, create ONLY DEBIT entry (fuel delivered)
          // CREDIT entry will be created later when user pays via credit payment API
          console.log('💳 Credit order detected - Creating ONLY DEBIT entry');
          console.log('Order Amount:', order.amount);
          
          // 🚨 CRITICAL: Check for existing entries to prevent duplicates
          const existingDebitEntries = await LedgerEntry.find({
            invoiceId: invoice._id,
            type: 'debit',
            paymentMethod: 'credit'
          });
          
          if (existingDebitEntries.length > 0) {
            console.log('🚨 DUPLICATE DEBIT ENTRIES DETECTED for credit invoice:', invoice._id);
            console.log('Existing entries:', existingDebitEntries.map(e => ({ id: e._id, amount: e.amount, description: e.description })));
            console.log('🗑️ Deleting duplicate DEBIT entries...');
            await LedgerEntry.deleteMany({
              invoiceId: invoice._id,
              type: 'debit',
              paymentMethod: 'credit'
            });
            console.log('✅ Duplicate DEBIT entries deleted');
          }
          
          // Create DEBIT entry for fuel delivery (credit order)
          console.log('🆕 Creating DEBIT entry for credit order fuel delivery');
          const debitResult = await LedgerService.createDeliveryEntry(
            invoice.userId._id,
            invoice.orderId._id,
            deliveryAmount,
            `Fuel delivered - ${invoice.fuelQuantity}L fuel (Total: ₹${deliveryAmount}) - Status: ${status || invoice.status}`,
            {
              paymentMethod: 'credit',
              invoiceId: invoice._id
            }
          );
          console.log('✅ DEBIT entry created successfully for credit order fuel delivery:', debitResult);
          
        } else {
          // For other payment types (ccavenue, online), create only DEBIT entry as before
          console.log('🆕 Creating DEBIT entry for fuel delivery (other payment type)');
          
          // 🚨 CRITICAL: Check for existing entries to prevent duplicates
          const existingDebitEntries = await LedgerEntry.find({
            invoiceId: invoice._id,
            type: 'debit'
          });
          
          if (existingDebitEntries.length > 0) {
            console.log('🚨 DUPLICATE DEBIT ENTRIES DETECTED for invoice:', invoice._id);
            console.log('Existing entries:', existingDebitEntries.map(e => ({ id: e._id, amount: e.amount, description: e.description })));
            console.log('🗑️ Deleting duplicate DEBIT entries...');
            await LedgerEntry.deleteMany({
              invoiceId: invoice._id,
              type: 'debit'
            });
            console.log('✅ Duplicate DEBIT entries deleted');
          }
          
          // Map payment method for ledger entry (convert "online" to "ccavenue")
          const ledgerPaymentMethod = actualPaymentMethod === 'online' ? 'ccavenue' : actualPaymentMethod;
          console.log('💰 Mapped payment method for ledger:', actualPaymentMethod, '→', ledgerPaymentMethod);
          
          const ledgerResult = await LedgerService.createDeliveryEntry(
            invoice.userId._id,
            invoice.orderId._id,
            deliveryAmount,
            `Fuel delivered - ${invoice.fuelQuantity}L fuel (Total: ₹${deliveryAmount}) - Status: ${status || invoice.status}`,
            {
              paymentMethod: ledgerPaymentMethod,
              invoiceId: invoice._id
            }
          );
          console.log('✅ DEBIT entry created successfully for fuel delivery:', ledgerResult);
        }

        // Phase 2: For driver-initiated cash orders, also write to CashLedger
        try {
          const OrderModel = require('../models/Order.model.js');
          const baseOrder = await OrderModel.findById(invoice.orderId._id);
          if (baseOrder && baseOrder.paymentType === 'cash' && baseOrder.orderType === 'driver-initiated') {
            const LedgerService = require('../services/ledger.service.js');
            await LedgerService.createCashLedgerEntries(invoice.orderId._id, invoice._id, {
              method: (invoice.paymentMethod === 'qr') ? 'qr' : 'cash'
            });
            console.log('✅ Cash ledger entries created for driver-initiated cash order');
          }
        } catch (cashLedgerErr) {
          console.warn('⚠️ Failed to create cash ledger entries:', cashLedgerErr.message);
        }
        
        // Recalculate user ledger after creating entries
        await LedgerService.recalculateUserLedger(invoice.userId._id);
        
      } catch (ledgerError) {
        console.error('❌ Ledger entry creation failed:', ledgerError);
        console.error('Error details:', {
          message: ledgerError.message,
          stack: ledgerError.stack,
          invoiceId: invoice._id,
          orderId: invoice.orderId._id,
          userId: invoice.userId._id,
          amount: invoice.amount,
          totalAmount: invoice.totalAmount,
          deliveryAmount: deliveryAmount
        });
        // Don't fail the invoice update if ledger fails
      }
    }

    res.status(200).json({ success: true, message: 'Invoice updated successfully', data: invoice });

  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ success: false, error: 'Failed to update invoice', details: error.message });
  }
};

/**
 * @desc    Delete invoice
 * @route   DELETE /api/invoice/:id
 * @access  Private
 */
const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findByIdAndDelete(id);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    res.status(200).json({ success: true, message: 'Invoice deleted successfully' });

  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ success: false, error: 'Failed to delete invoice', details: error.message });
  }
};

/**
 * @desc    Auto-generate invoice when order is completed
 * @access  Internal (called from order controller)
 */
const generateInvoiceForCompletedOrder = async (orderId, vehicleId, remarks = "") => {
  try {
    const existingInvoice = await Invoice.findOne({ orderId });
    if (existingInvoice) {
      return { success: false, error: 'Invoice already exists for this order' };
    }

    const order = await Order.findById(orderId)
      .populate('userId', 'name email mobile role creditFuelRate')
      .populate('shippingAddress')
      .populate('billingAddress');

    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    let vehicle = null;
    if (vehicleId) {
      vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) {
        return { success: false, error: 'Vehicle not found' };
      }
    }

    const invoiceNo = await Invoice.generateInvoiceNumber();

    const invoiceData = {
      invoiceNo,
      invoiceDate: new Date(),
      orderId: order._id,
      userId: order.userId._id,
      vehicleId: vehicle ? vehicle._id : null,
      shippingAddress: order.shippingAddress ? order.shippingAddress._id : null,
      billingAddress: order.billingAddress ? order.billingAddress._id : null,
      dispatchedThrough: vehicle ? vehicle.fuelCapacity : null,
      vehicleNO: vehicle ? vehicle.vehicleNo : null,
      fuelQuantity: order.fuelQuantity,
      // Neutral defaults for frontend to update later
      amount: null,
      rate: null,
      totalAmount: null,
      amountInChargeable: "",
      paymentMethod: order.paymentDetails?.method || order.paymentType || null,
      destination: order.shippingAddress?.city || '',
      deliveryCharges: 0,
      cgst: 0,
      sgst: 0,
      remarks,
      status: 'issued'
    };

    const invoice = new Invoice(invoiceData);
    await invoice.save();

    return { success: true, message: 'Invoice generated successfully', invoiceId: invoice._id };

  } catch (error) {
    console.error('Error generating invoice:', error);
    return { success: false, error: 'Failed to generate invoice', details: error.message };
  }
};

module.exports = {
  createInvoice,
  getAllInvoices,
  getInvoiceById,
  getInvoicesByOrderId,
  updateInvoice,
  deleteInvoice,
  generateInvoiceForCompletedOrder
};