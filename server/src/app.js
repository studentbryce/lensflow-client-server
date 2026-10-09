import express from 'express';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';

const app = express();

app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: 'API endpoint not found.',
        },
    });
});

// Consistent server-side error response. Avoid leaking internal details.
app.use((error, req, res, next) => {
    console.error('API request failed:', error.message);
    if (error.cause?.code) {
        console.error('Database error code:', error.cause.code);
    }
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected server error occurred.',
        },
    });
});

export default app;
