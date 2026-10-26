import mongoose from 'mongoose';
import { Address } from './address.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';

function isReplicaSetSupported() {
  return Boolean(
    mongoose.connection?.client?.topology?.description?.setName ||
    mongoose.connection?.client?.topology?.description?.type === 'ReplicaSetWithPrimary' ||
    mongoose.connection?.client?.topology?.description?.type === 'Sharded'
  );
}

export const addressService = {
  /**
   * Get all delivery addresses owned by the authenticated customer
   * Ordered: default address first, then newest
   */
  async getUserAddresses(userId) {
    return Address.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 });
  },

  /**
   * Create a new delivery address for the customer
   * - If first address for customer: automatically set as default
   * - If subsequent address marked as default: unset previous default transactionally
   */
  async createAddress(userId, addressData) {
    const existingCount = await Address.countDocuments({ user: userId });
    const isFirstAddress = existingCount === 0;
    const shouldBeDefault = isFirstAddress || Boolean(addressData.isDefault);

    const supportsTransactions = isReplicaSetSupported();
    const session = await mongoose.startSession();

    let createdAddress;

    try {
      if (shouldBeDefault && !isFirstAddress) {
        if (supportsTransactions) {
          await session.withTransaction(async () => {
            await Address.updateMany(
              { user: userId, isDefault: true },
              { isDefault: false },
              { session }
            );

            const [doc] = await Address.create(
              [
                {
                  ...addressData,
                  user: userId,
                  isDefault: true
                }
              ],
              { session }
            );
            createdAddress = doc;
          });
        } else {
          logger.warn('Replica set not detected; executing default address switch sequentially');
          await Address.updateMany({ user: userId, isDefault: true }, { isDefault: false });
          createdAddress = await Address.create({
            ...addressData,
            user: userId,
            isDefault: true
          });
        }
      } else {
        // Simple insert (either first address or non-default address)
        createdAddress = await Address.create({
          ...addressData,
          user: userId,
          isDefault: isFirstAddress
        });
      }
    } finally {
      await session.endSession();
    }

    return createdAddress;
  },

  /**
   * Update fields of an owned delivery address
   */
  async updateAddress({ userId, addressId, updateData }) {
    const address = await Address.findOne({ _id: addressId, user: userId });
    if (!address) {
      throw ApiError.notFound('Delivery address not found');
    }

    // If client requested default status change, handle through default flow
    if (updateData.isDefault === true && !address.isDefault) {
      await this.setDefaultAddress({ userId, addressId });
      address.isDefault = true;
    }

    if (updateData.recipientName !== undefined) address.recipientName = updateData.recipientName.trim();
    if (updateData.phone !== undefined) address.phone = updateData.phone.trim();
    if (updateData.streetAddress1 !== undefined) address.streetAddress1 = updateData.streetAddress1.trim();
    if (updateData.streetAddress2 !== undefined) address.streetAddress2 = updateData.streetAddress2.trim();
    if (updateData.city !== undefined) address.city = updateData.city.trim();
    if (updateData.state !== undefined) address.state = updateData.state.trim();
    if (updateData.postalCode !== undefined) address.postalCode = updateData.postalCode.trim();
    if (updateData.country !== undefined) address.country = updateData.country.trim().toUpperCase();

    await address.save();
    return address;
  },

  /**
   * Set specific owned address as default and unset previous default
   */
  async setDefaultAddress({ userId, addressId }) {
    const address = await Address.findOne({ _id: addressId, user: userId });
    if (!address) {
      throw ApiError.notFound('Delivery address not found');
    }

    if (address.isDefault) {
      return address;
    }

    const supportsTransactions = isReplicaSetSupported();
    const session = await mongoose.startSession();
    let updatedAddress;

    try {
      if (supportsTransactions) {
        await session.withTransaction(async () => {
          // Unset any previous default
          await Address.updateMany(
            { user: userId, isDefault: true, _id: { $ne: addressId } },
            { isDefault: false },
            { session }
          );

          updatedAddress = await Address.findOneAndUpdate(
            { _id: addressId, user: userId },
            { isDefault: true },
            { session, new: true }
          );
        });
      } else {
        logger.warn('Replica set not detected; executing set default address sequentially');
        await Address.updateMany(
          { user: userId, isDefault: true, _id: { $ne: addressId } },
          { isDefault: false }
        );
        updatedAddress = await Address.findOneAndUpdate(
          { _id: addressId, user: userId },
          { isDefault: true },
          { new: true }
        );
      }
    } finally {
      await session.endSession();
    }

    return updatedAddress;
  },

  /**
   * Delete owned delivery address
   * - If deleted address was default: promote newest remaining address to default
   */
  async deleteAddress({ userId, addressId }) {
    const address = await Address.findOne({ _id: addressId, user: userId });
    if (!address) {
      throw ApiError.notFound('Delivery address not found');
    }

    const wasDefault = address.isDefault;
    const supportsTransactions = isReplicaSetSupported();
    const session = await mongoose.startSession();
    let promotedDefaultAddress = null;

    try {
      if (supportsTransactions) {
        await session.withTransaction(async () => {
          await Address.deleteOne({ _id: addressId, user: userId }, { session });

          if (wasDefault) {
            // Promote most recently created remaining address
            const newest = await Address.findOne({ user: userId })
              .sort({ createdAt: -1 })
              .session(session);

            if (newest) {
              newest.isDefault = true;
              await newest.save({ session });
              promotedDefaultAddress = newest;
            }
          }
        });
      } else {
        logger.warn('Replica set not detected; executing address deletion sequentially');
        await Address.deleteOne({ _id: addressId, user: userId });

        if (wasDefault) {
          const newest = await Address.findOne({ user: userId }).sort({ createdAt: -1 });
          if (newest) {
            newest.isDefault = true;
            await newest.save();
            promotedDefaultAddress = newest;
          }
        }
      }
    } finally {
      await session.endSession();
    }

    return {
      deletedAddressId: addressId,
      promotedDefaultAddress
    };
  }
};
