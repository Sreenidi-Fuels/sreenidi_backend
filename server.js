const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Body parser middleware
app.use(express.json());

// --- Define Routes Later ---
// app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/user.route'));
app.use('/api/drivers', require('./routes/driver.route'));
app.use('/api/orders', require('./routes/order.route'));
// app.use('/api/admin', require('./routes/adminRoutes'));

// --- Error Handling Middleware Later ---
// const { errorHandler } = require('./middleware/errorMiddleware');
// app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));