import 'dotenv/config';
import app from './app.js';
import { connectDB } from './config/db.js';
import { startNotificationScheduler } from './utils/notificationScheduler.js';

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  connectDB().catch((err) => {
    console.warn('DB background connection error:', err.message);
  });
  startNotificationScheduler();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`True Power Solutions API server running on port ${PORT}`);
  });
};

startServer();
