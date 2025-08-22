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
      amountInChargeable
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

    // Taxes: compute from deliveryCharges only if not explicitly provided
    const taxes = {
      deliveryCharges: deliveryCharges ?? 0,
      cgst: cgstOverride,
      sgst: sgstOverride
    };
    if (taxes.cgst === undefined || taxes.sgst === undefined) {
      const { deliveryCharges: dc, cgst, sgst } = computeTaxes(deliveryCharges);
      taxes.deliveryCharges = dc;
      taxes.cgst = taxes.cgst === undefined ? cgst : taxes.cgst;
      taxes.sgst = taxes.sgst === undefined ? sgst : taxes.sgst;
    }

    const invoiceData = {
      invoiceNo,
      invoiceDate: new Date(),
      orderId: order._id,
      userId: order.userId._id,
      vehicleId: vehicle ? vehicle._id : null,
      shippingAddress: order.shippingAddress._id,
      billingAddress: order.billingAddress._id,
      dispatchedThrough: null, // Will be updated later from frontend
      vehicleNO: vehicle ? vehicle.vehicleNo : null,
      fuelQuantity: order.fuelQuantity,
      // Values provided by frontend
      amount: amount ?? null,
      rate: rate ?? null,
      totalAmount: totalAmount ?? null,
      amountInChargeable: amountInChargeable ?? "",
      // Other fields
      paymentMethod: paymentMethod ?? null,
      destination: destination ?? (order.shippingAddress?.city || ''),
      deliveryCharges: taxes.deliveryCharges,
      cgst: taxes.cgst,
      sgst: taxes.sgst,
      remarks,
      status: 'issued'
    };

    const invoice = new Invoice(invoiceData);
    await invoice.save();

    // Create ledger credit entry for invoice creation
    if (amount && amount > 0) {
      try {
        await LedgerService.createCreditEntry(
          order.userId._id,
          order._id,
          amount,
          `Invoice created - ${order.fuelQuantity}L fuel`,
          {
            paymentMethod: 'credit',
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
      .populate('orderId')
      .populate('userId', 'name email mobile')
      .populate('vehicleId')
      .populate('shippingAddress')
      .populate('billingAddress');

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    res.status(200).json({ success: true, data: invoice });

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
    const { remarks, status, paymentMethod, destination, rate, amount, deliveryCharges, cgst, sgst, totalAmount, amountInChargeable, vehicleId, vehicleNO, dispatchedThrough } = req.body;

    const updateData = {};
    if (remarks !== undefined) updateData.remarks = remarks;
    if (status !== undefined) updateData.status = status;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (destination !== undefined) updateData.destination = destination;
    if (rate !== undefined) updateData.rate = rate;
    if (amount !== undefined) updateData.amount = amount;
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

    // ✅ FIX: Create/Update CREDIT entry when:
    // 1. Invoice status changes to "confirmed" OR
    // 2. Amount changes for already confirmed invoice
    console.log('=== DEBUG: Invoice Status Check ===');
    console.log('Request body status:', status);
    console.log('Updated invoice status:', invoice.status);
    console.log('Status comparison (status === "confirmed"):', status === 'confirmed');
    console.log('Invoice already confirmed:', invoice.status === 'confirmed');
    
    // Check if we need to create/update credit entry
    const shouldHandleCreditEntry = (status === 'confirmed') || (invoice.status === 'confirmed');
    
    if (shouldHandleCreditEntry) {
      // Use totalAmount if available, otherwise fallback to amount
      const creditAmount = invoice.totalAmount || invoice.amount;
      
      if (creditAmount && creditAmount > 0) {
        try {
          console.log('=== Creating/Updating CREDIT Entry ===');
          console.log('Invoice ID:', invoice._id);
          console.log('Order ID:', invoice.orderId._id);
          console.log('User ID:', invoice.userId._id);
          console.log('Base Amount:', invoice.amount);
          console.log('Total Amount:', invoice.totalAmount);
          console.log('Credit Amount:', creditAmount);
          console.log('Status:', status);
          console.log('Invoice Status:', invoice.status);

          // Check if CREDIT entry already exists for this invoice
          const existingCreditEntry = await LedgerEntry.findOne({
            invoiceId: invoice._id,
            type: 'credit'
          });

          if (existingCreditEntry) {
            console.log('✅ CREDIT entry already exists, updating amount if needed');
            
            // Update existing credit entry if amount changed
            if (existingCreditEntry.amount !== creditAmount) {
              console.log('🔄 Updating existing credit entry amount from', existingCreditEntry.amount, 'to', creditAmount);
              
              // Update the existing credit entry
              existingCreditEntry.amount = creditAmount;
              existingCreditEntry.description = `Invoice confirmed - ${invoice.fuelQuantity}L fuel (Total: ₹${creditAmount})`;
              await existingCreditEntry.save();
              
              // Recalculate user ledger
              await LedgerService.recalculateUserLedger(invoice.userId._id);
              
              console.log('✅ CREDIT entry updated successfully');
            } else {
              console.log('✅ CREDIT entry amount unchanged, no update needed');
            }
          } else {
            console.log('🆕 Creating new CREDIT entry for invoice confirmation');
            
            const ledgerResult = await LedgerService.createCreditEntry(
              invoice.userId._id,
              invoice.orderId._id,
              creditAmount,  // ← Use totalAmount or amount
              `Invoice confirmed - ${invoice.fuelQuantity}L fuel (Total: ₹${creditAmount})`,
              {
                paymentMethod: 'credit',
                invoiceId: invoice._id
              }
            );

            console.log('✅ CREDIT entry created successfully for invoice confirmation:', ledgerResult);
          }

        } catch (ledgerError) {
          console.error('❌ CREDIT entry creation failed for invoice confirmation:', ledgerError);
          console.error('Error details:', {
            message: ledgerError.message,
            stack: ledgerError.stack,
            invoiceId: invoice._id,
            orderId: invoice.orderId._id,
            userId: invoice.userId._id,
            amount: invoice.amount,
            totalAmount: invoice.totalAmount,
            creditAmount: creditAmount
          });
          // Don't fail the invoice update if ledger fails
        }
      } else {
        console.log('⚠️ Invoice status changed to confirmed but no amount available for ledger entry');
        console.log('Amount details:', {
          amount: invoice.amount,
          totalAmount: invoice.totalAmount,
          creditAmount: creditAmount
        });
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

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return { success: false, error: 'Vehicle not found' };
    }

    const invoiceNo = await Invoice.generateInvoiceNumber();

    const invoiceData = {
      invoiceNo,
      invoiceDate: new Date(),
      orderId: order._id,
      userId: order.userId._id,
      vehicleId: vehicle._id,
      shippingAddress: order.shippingAddress._id,
      billingAddress: order.billingAddress._id,
      dispatchedThrough: vehicle.fuelCapacity,
      vehicleNO: vehicle.vehicleNo,
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