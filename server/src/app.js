import express from 'express';
import healthRoutes from './routes/healthRoutes.js';

const app = express();

app.use(express.json());

app.use('/api/health', healthRoutes);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: 'API endpoint not found.'
        }
    });
});

export default app;
