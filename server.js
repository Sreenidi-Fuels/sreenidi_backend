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

// --- Error Handling Middleware Later ---
// const { errorHandler } = require('./middleware/errorMiddleware');
// app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));