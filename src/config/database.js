import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let isConnected = false;

/**
 * Connect to MongoDB with production-grade connection options
 */
export async function connectDB(customUri) {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const uri = customUri || env.MONGODB_URI;

  const options = {
    autoIndex: env.NODE_ENV !== 'production', // Build indexes in dev, manage externally or carefully in prod
    maxPoolSize: 20, // Maintain up to 20 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000 // Close sockets after 45 seconds of inactivity
  };

  try {
    const conn = await mongoose.connect(uri, options);
    isConnected = true;
    logger.info({ host: conn.connection.host, name: conn.connection.name }, 'Connected to MongoDB successfully');
    return conn.connection;
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to connect to MongoDB');
    throw error;
  }
}

/**
 * Disconnect from MongoDB gracefully
 */
export async function disconnectDB() {
  if (!isConnected && mongoose.connection.readyState === 0) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Disconnected from MongoDB');
  } catch (error) {
    logger.error({ err: error }, 'Error disconnecting from MongoDB');
    throw error;
  }
}

// Connection event hooks for health monitoring
mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn('MongoDB connection disconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error({ err }, 'MongoDB connection error occurred');
});
