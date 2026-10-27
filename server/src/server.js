import 'dotenv/config';
import app from './app.js';

const port = Number(process.env.PORT) || 3001;
// Start the Express server and listen on the specified port
app.listen(port, () => {
    console.log(`LensFlow API running on http://localhost:${port}`);
});
