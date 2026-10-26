import mongoose from 'mongoose';
import { ApiResponse } from '../../utils/ApiResponse.js';

export const healthController = {
  /**
   * Liveness probe: returns 200 if the Node.js server process is running
   */
  live(req, res) {
    return ApiResponse.success(res, {
      message: 'Server process is alive',
      data: {
        status: 'UP',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      }
    });
  },

  /**
   * Readiness probe: checks database connectivity
   */
  ready(req, res) {
    const isDbConnected = mongoose.connection.readyState === 1;

    const data = {
      database: isDbConnected ? 'CONNECTED' : 'DISCONNECTED',
      timestamp: new Date().toISOString()
    };

    if (!isDbConnected) {
      return res.status(503).json({
        success: false,
        statusCode: 503,
        message: 'Service is not ready - Database connection down',
        data
      });
    }

    return ApiResponse.success(res, {
      message: 'Service is healthy and ready to accept traffic',
      data
    });
  }
};
