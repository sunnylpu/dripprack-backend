import mongoose from 'mongoose';

const authSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true
    },
    tokenHash: {
      type: String,
      required: [true, 'Token hash is required']
    },
    deviceInfo: {
      type: String,
      default: 'Unknown Device'
    },
    ipAddress: {
      type: String,
      default: null
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
authSessionSchema.index({ tokenHash: 1 }, { unique: true });
authSessionSchema.index({ user: 1, isRevoked: 1 });
// TTL index: MongoDB automatically removes documents after expiresAt timestamp
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSession = mongoose.model('AuthSession', authSessionSchema);
