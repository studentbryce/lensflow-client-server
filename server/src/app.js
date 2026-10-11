import express from 'express';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import clientBookingRoutes from './routes/clientBookingRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import photographerClientsRoutes from './routes/photographerClientsRoutes.js';
import photographerServicesRoutes from './routes/photographerServicesRoutes.js';
import photographerInvoicesRoutes from './routes/photographerInvoicesRoutes.js';
import photographerGalleriesRoutes from './routes/photographerGalleriesRoutes.js';
import photographerWebsiteRoutes from './routes/photographerWebsiteRoutes.js';
import photographerSettingsRoutes from './routes/photographerSettingsRoutes.js';
import clientAccountRoutes from './routes/clientAccountRoutes.js';
import clientInvoicesRoutes from './routes/clientInvoicesRoutes.js';
import clientGalleriesRoutes from './routes/clientGalleriesRoutes.js';
import clientMessagesRoutes from './routes/clientMessagesRoutes.js';
import clientReviewsRoutes from './routes/clientReviewsRoutes.js';

const app = express();

app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/client/bookings', clientBookingRoutes);
app.use('/api/client', clientAccountRoutes);
app.use('/api/client/invoices', clientInvoicesRoutes);
app.use('/api/client/galleries', clientGalleriesRoutes);
app.use('/api/client/messages', clientMessagesRoutes);
app.use('/api/client/reviews', clientReviewsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/photographer/clients', photographerClientsRoutes);
app.use('/api/photographer/services', photographerServicesRoutes);
app.use('/api/photographer/invoices', photographerInvoicesRoutes);
app.use('/api/photographer/galleries', photographerGalleriesRoutes);
app.use('/api/photographer/website', photographerWebsiteRoutes);
app.use('/api/photographer/settings', photographerSettingsRoutes);

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
