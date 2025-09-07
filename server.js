const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const morgan = require('morgan');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

const cors = require('cors');
app.use(cors());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Body parser middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan(':method :url :status length-:res[content-length]  time-:response-time ms'));

// --- Define Routes Later ---
// app.use('/api/auth', require('./routes/auth.route'));
app.use('/api/users', require('./routes/user.route'));
app.use('/api/drivers', require('./routes/driver.route'));
app.use('/api/orders', require('./routes/order.route'));
app.use('/api/otpless', require('./routes/otpless.route'));
app.use('/api/admin', require('./routes/admin.route'));
app.use('/api/assets', require('./routes/asset.route'));
app.use('/api/addresses', require('./routes/address.route'));
app.use('/api/vehicle', require('./routes/vehicle.route'));
app.use('/api/ccavenue', require('./routes/ccavenue.route'));
app.use('/api/invoice', require('./routes/invoice.route'));
app.use('/api/ledger', require('./routes/ledger.route'));
app.use('/api/cash-ledger', require('./routes/cash-ledger.route'));
app.use('/api/credit', require('./routes/credit.route'));

// --- Error Handling Middleware Later ---
// const { errorHandler } = require('./middleware/errorMiddleware');
// app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Listen on both localhost and network IP
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Server accessible on your network at http://192.168.0.2:${PORT}`);
  console.log(`Flutter app should use: 192.168.0.2:${PORT}`);
  console.log(`Postman can use: http://localhost:${PORT} or http://192.168.0.2:${PORT}`);
});