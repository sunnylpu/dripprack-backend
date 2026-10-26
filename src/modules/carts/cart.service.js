import { Cart } from './cart.model.js';
import { Product } from '../products/product.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';

export const cartService = {
  /**
   * Format populated cart with real-time product eligibility and informational subtotals
   */
  _formatCartResponse(cart, userId) {
    if (!cart || !cart.items || cart.items.length === 0) {
      return {
        _id: cart?._id || null,
        user: userId,
        items: [],
        itemCount: 0,
        estimatedSubtotalCents: 0,
        currency: env.CURRENCY_CODE,
        isAuthoritative: false,
        updatedAt: cart?.updatedAt || new Date().toISOString()
      };
    }

    let itemCount = 0;
    let estimatedSubtotalCents = 0;

    const formattedItems = cart.items.map((item) => {
      const product = item.product;
      const quantity = item.quantity;
      itemCount += quantity;

      // Handle product that was hard-deleted from database
      if (!product || !product._id) {
        return {
          _id: item._id,
          product: {
            _id: product?._id || item.product,
            name: 'Unavailable Product',
            isRemoved: true
          },
          quantity,
          unitPriceCents: 0,
          lineTotalCents: 0,
          isAvailableForPurchase: false,
          unavailableReason: 'Product no longer exists in catalog',
          addedAt: item.addedAt
        };
      }

      // Check current availability rules
      const isPublished = product.status === 'published';
      const isCategoryActive = Boolean(product.category && product.category.isActive);
      const availableStock = product.stock?.available ?? 0;

      let isAvailableForPurchase = true;
      let unavailableReason = null;

      if (!isPublished) {
        isAvailableForPurchase = false;
        unavailableReason = `Product is currently ${product.status}`;
      } else if (!isCategoryActive) {
        isAvailableForPurchase = false;
        unavailableReason = 'Product category is inactive';
      } else if (availableStock === 0) {
        isAvailableForPurchase = false;
        unavailableReason = 'Product is out of stock';
      } else if (availableStock < quantity) {
        isAvailableForPurchase = false;
        unavailableReason = `Only ${availableStock} units available in stock`;
      }

      const unitPriceCents = product.priceCents;
      const lineTotalCents = unitPriceCents * quantity;

      if (isAvailableForPurchase) {
        estimatedSubtotalCents += lineTotalCents;
      }

      return {
        _id: item._id,
        product: {
          _id: product._id,
          sku: product.sku,
          name: product.name,
          slug: product.slug,
          images: product.images,
          priceCents: product.priceCents,
          compareAtPriceCents: product.compareAtPriceCents,
          status: product.status,
          category: product.category,
          availableStock
        },
        quantity,
        unitPriceCents,
        lineTotalCents,
        isAvailableForPurchase,
        unavailableReason,
        addedAt: item.addedAt
      };
    });

    return {
      _id: cart._id,
      user: userId,
      items: formattedItems,
      itemCount,
      estimatedSubtotalCents,
      currency: env.CURRENCY_CODE,
      isAuthoritative: false,
      updatedAt: cart.updatedAt
    };
  },

  /**
   * Get the authenticated customer's shopping cart
   */
  async getCart(userId) {
    const cart = await Cart.findOne({ user: userId }).populate({
      path: 'items.product',
      populate: { path: 'category', select: 'name slug isActive' }
    });

    return this._formatCartResponse(cart, userId);
  },

  /**
   * Add item to cart with stock validation and atomic increment/upsert
   */
  async addItem({ userId, productId, quantity = 1 }) {
    // 1. Verify product storefront eligibility
    const product = await Product.findById(productId).populate('category', 'name slug isActive');
    if (!product) {
      throw ApiError.notFound('Product not found');
    }

    if (product.status !== 'published') {
      throw ApiError.conflict('Cannot add unpublished product to cart', 'PRODUCT_UNAVAILABLE');
    }

    if (!product.category || !product.category.isActive) {
      throw ApiError.conflict('Cannot add product from an inactive category to cart', 'CATEGORY_INACTIVE');
    }

    if (product.stock.available === 0) {
      throw ApiError.conflict('Product is out of stock', 'OUT_OF_STOCK');
    }

    // 2. Fetch or initialize cart to inspect existing line items
    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      // First item in a new cart
      if (quantity > product.stock.available) {
        throw ApiError.conflict(
          `Requested quantity (${quantity}) exceeds available stock (${product.stock.available})`,
          'INSUFFICIENT_STOCK'
        );
      }

      cart = await Cart.create({
        user: userId,
        items: [{ product: productId, quantity, addedAt: new Date() }]
      });

      return this.getCart(userId);
    }

    // Cart already exists: check if product is already in items array
    const existingItem = cart.items.find(
      (item) => item.product.toString() === productId.toString()
    );

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (newQuantity > 99) {
        throw ApiError.badRequest('Cart item quantity cannot exceed 99 units', 'QUANTITY_LIMIT_EXCEEDED');
      }

      if (newQuantity > product.stock.available) {
        throw ApiError.conflict(
          `Cannot add ${quantity} more units. Available stock is ${product.stock.available}, cart would have ${newQuantity}`,
          'INSUFFICIENT_STOCK'
        );
      }

      // Atomic increment on existing item
      await Cart.findOneAndUpdate(
        { user: userId, 'items.product': productId },
        { $inc: { 'items.$.quantity': quantity } },
        { new: true }
      );
    } else {
      // New line item in existing cart
      if (quantity > product.stock.available) {
        throw ApiError.conflict(
          `Requested quantity (${quantity}) exceeds available stock (${product.stock.available})`,
          'INSUFFICIENT_STOCK'
        );
      }

      // Atomic push with duplicate-line protection ($ne)
      const updated = await Cart.findOneAndUpdate(
        { user: userId, 'items.product': { $ne: productId } },
        { $push: { items: { product: productId, quantity, addedAt: new Date() } } },
        { new: true }
      );

      // If concurrent request added the product first, fall back to atomic increment
      if (!updated) {
        await Cart.findOneAndUpdate(
          { user: userId, 'items.product': productId },
          { $inc: { 'items.$.quantity': quantity } },
          { new: true }
        );
      }
    }

    return this.getCart(userId);
  },

  /**
   * Update item quantity in cart
   */
  async updateItemQuantity({ userId, productId, quantity }) {
    // 1. Verify product storefront eligibility
    const product = await Product.findById(productId).populate('category', 'name slug isActive');
    if (!product) {
      throw ApiError.notFound('Product not found');
    }

    if (product.status !== 'published') {
      throw ApiError.conflict('Product is not published', 'PRODUCT_UNAVAILABLE');
    }

    if (!product.category || !product.category.isActive) {
      throw ApiError.conflict('Product category is inactive', 'CATEGORY_INACTIVE');
    }

    if (quantity > product.stock.available) {
      throw ApiError.conflict(
        `Requested quantity (${quantity}) exceeds available stock (${product.stock.available})`,
        'INSUFFICIENT_STOCK'
      );
    }

    // 2. Atomic quantity update
    const updated = await Cart.findOneAndUpdate(
      { user: userId, 'items.product': productId },
      { $set: { 'items.$.quantity': quantity } },
      { new: true }
    );

    if (!updated) {
      throw ApiError.notFound('Product is not in your shopping cart');
    }

    return this.getCart(userId);
  },

  /**
   * Remove item from cart
   * Works regardless of whether product is published, archived, or deleted
   */
  async removeItem({ userId, productId }) {
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      throw ApiError.notFound('Cart is empty');
    }

    const hasItem = cart.items.some((i) => i.product.toString() === productId.toString());
    if (!hasItem) {
      throw ApiError.notFound('Product not found in shopping cart');
    }

    await Cart.findOneAndUpdate(
      { user: userId },
      { $pull: { items: { product: productId } } },
      { new: true }
    );

    return this.getCart(userId);
  },

  /**
   * Clear all items from cart
   */
  async clearCart(userId) {
    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { items: [] } },
      { new: true }
    );

    return this.getCart(userId);
  }
};
