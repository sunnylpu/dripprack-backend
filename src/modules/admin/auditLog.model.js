import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Actor reference is required']
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      uppercase: true,
      trim: true
    },
    resourceType: {
      type: String,
      required: [true, 'Resource type is required'],
      lowercase: true,
      trim: true
    },
    resourceId: {
      type: String,
      required: [true, 'Resource ID is required'],
      trim: true
    },
    ipAddress: {
      type: String,
      default: null,
      trim: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Compound and single-field indexes for administrative auditing queries
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });
auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema, 'audit_logs');
