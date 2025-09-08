const CashLedgerEntry = require('../models/CashLedgerEntry.model.js');
const Order = require('../models/Order.model.js');
const mongoose = require('mongoose');

// GET /api/cash-ledger/order/:orderId
exports.getByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const entries = await CashLedgerEntry.find({ orderId })
      .sort({ createdAt: 1 })
      .populate('invoiceId', 'invoiceNo totalAmount')
      .lean();
    res.status(200).json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch cash ledger', message: err.message });
  }
};

// GET /api/cash-ledger/invoice/:invoiceId
exports.getByInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const entries = await CashLedgerEntry.find({ invoiceId })
      .sort({ createdAt: 1 })
      .populate('orderId', 'userId amount paymentType orderType')
      .lean();
    res.status(200).json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch cash ledger by invoice', message: err.message });
  }
};

// GET /api/cash-ledger/order/:orderId/summary
exports.getOrderSummary = async (req, res) => {
  try {
    const { orderId } = req.params;
    const [agg] = await CashLedgerEntry.aggregate([
      { $match: { orderId: require('mongoose').Types.ObjectId.createFromHexString(orderId) } },
      { $group: {
          _id: '$orderId',
          totalCredit: { $sum: { $cond: [{ $eq: ['$entryType', 'credit'] }, '$amount', 0] } },
          totalDebit:  { $sum: { $cond: [{ $eq: ['$entryType', 'debit'] },  '$amount', 0] } },
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        orderId,
        totalCredit: agg?.totalCredit || 0,
        totalDebit: agg?.totalDebit || 0,
        net: (agg?.totalCredit || 0) - (agg?.totalDebit || 0),
        entries: agg?.count || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to compute summary', message: err.message });
  }
};

// GET /api/cash-ledger/user/:userId (via orders)
exports.getByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const orders = await Order.find({ userId, paymentType: 'cash', orderType: 'driver-initiated' }).select('_id').lean();
    const orderIds = orders.map(o => o._id);
    const entries = await CashLedgerEntry.find({ orderId: { $in: orderIds } })
      .sort({ createdAt: -1 })
      .populate('orderId', 'amount')
      .populate('invoiceId', 'invoiceNo')
      .lean();

    res.status(200).json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch user cash ledger', message: err.message });
  }
};

// GET /api/cash-ledger
// Global driver cash/qr ledger with enrichments and pagination
exports.listAll = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const match = {};
    if (req.query.entryType) match.entryType = req.query.entryType; // credit|debit
    if (req.query.method) match.method = req.query.method; // cash|qr

    const pipeline = [
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            // Join order
            { $lookup: { from: 'orders', localField: 'orderId', foreignField: '_id', as: 'order' } },
            { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
            // Join invoice (optional)
            { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'invoice' } },
            { $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } },
            // Join driver (from order.tracking.driverAssignment.driverId)
            { $addFields: { driverId: '$order.tracking.driverAssignment.driverId' } },
            { $lookup: { from: 'drivers', localField: 'driverId', foreignField: '_id', as: 'driver' } },
            { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },
            // Join user for phone
            { $lookup: { from: 'users', localField: 'order.userId', foreignField: '_id', as: 'user' } },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            { $project: {
                _id: 1,
                entryType: 1,
                amount: 1,
                method: 1,
                createdAt: 1,
                orderId: 1,
                invoiceId: 1,
                description: 1,
                // Enrichments
                driver: { _id: '$driver._id', name: '$driver.name', mobile: '$driver.mobile' },
                order: {
                  _id: '$order._id',
                  amount: '$order.amount',
                  fuelQuantity: '$order.fuelQuantity',
                  deliveredLiters: '$order.deliveredLiters',
                  receiverDetails: '$order.receiverDetails',
                  paymentType: '$order.paymentType',
                  orderType: '$order.orderType'
                },
                invoice: { _id: '$invoice._id', invoiceNo: '$invoice.invoiceNo', totalAmount: '$invoice.totalAmount' },
                receiverPhone: '$order.receiverDetails.phoneNo',
                userPhone: '$user.phoneNumber'
            } }
          ],
          meta: [
            { $count: 'total' }
          ]
        }
      }
    ];

    const agg = await CashLedgerEntry.aggregate(pipeline);
    const data = agg[0]?.data || [];
    const total = agg[0]?.meta?.[0]?.total || 0;

    // Totals summary for this filter window
    // Recompute totals using the same filter AND a bounded time/page window if needed
    const totalsAgg = await CashLedgerEntry.aggregate([
      { $match: match },
      { $group: {
          _id: null,
          totalCredit: { $sum: { $cond: [{ $eq: ['$entryType', 'credit'] }, '$amount', 0] } },
          totalDebit:  { $sum: { $cond: [{ $eq: ['$entryType', 'debit'] },  '$amount', 0] } }
      } }
    ]);
    const totalCredit = totalsAgg[0]?.totalCredit || 0;
    const totalDebit = totalsAgg[0]?.totalDebit || 0;
    const outstanding = totalDebit - totalCredit; // Positive means shortfall pending to reconcile

    res.status(200).json({
      success: true,
      data,
      totals: { totalCredit, totalDebit, net: totalCredit - totalDebit, outstanding },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit) || 1,
        totalItems: total,
        pageSize: limit
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch cash ledger', message: err.message });
  }
};


