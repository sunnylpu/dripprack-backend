import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { User } from '../src/modules/users/user.model.js';
import { Category } from '../src/modules/categories/category.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { Cart } from '../src/modules/carts/cart.model.js';
import { Address } from '../src/modules/addresses/address.model.js';
import { Order } from '../src/modules/orders/order.model.js';
import { InventoryMovement } from '../src/modules/inventory/inventoryMovement.model.js';

describe('End-to-End Customer-to-Admin Order Lifecycle Verification', () => {
  let replSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    await connectDB(uri);
  }, 60000);

  afterAll(async () => {
    await disconnectDB();
    if (replSet) {
      await replSet.stop();
    }
  });

  it('should complete the entire lifecycle from admin product setup to customer purchase and admin fulfillment', async () => {
    // 1. Create and authenticate Admin
    const adminPasswordHash = await User.hashPassword('AdminMaster123!');
    const adminUser = await User.create({
      email: 'admin_flow@driprack.internal',
      passwordHash: adminPasswordHash,
      firstName: 'Ops',
      lastName: 'Director',
      role: 'admin',
      status: 'active'
    });

    const adminLoginRes = await request(app)
      .post('/api/v1/auth/admin/login')
      .send({
        email: 'admin_flow@driprack.internal',
        password: 'AdminMaster123!'
      });

    expect(adminLoginRes.status).toBe(200);
    const adminToken = adminLoginRes.body.data.accessToken;
    expect(adminToken).toBeTruthy();

    // 2. Admin creates Category
    const categoryRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Streetwear Tops',
        slug: 'streetwear-tops',
        description: 'Premium oversized tees and heavy hoodies'
      });

    expect(categoryRes.status).toBe(201);
    const categoryId = categoryRes.body.data.category._id;

    // 3. Admin creates Product with Size & Color variant attributes
    const productRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'DRIP-HWT-VBLK-M',
        name: 'Heavyweight Fleece Hoodie - Vintage Black (M)',
        slug: 'heavyweight-fleece-hoodie-vintage-black-m',
        description: '500 GSM custom fleece with ribbed trims and drop shoulders.',
        category: categoryId,
        priceCents: 9500,
        compareAtPriceCents: 12000,
        images: ['https://cdn.driprack.internal/hoodie-black.jpg'],
        attributes: {
          size: 'M',
          color: 'Vintage Black'
        },
        status: 'published'
      });

    expect(productRes.status).toBe(201);
    const productId = productRes.body.data.product._id;
    expect(productRes.body.data.product.attributes.size).toBe('M');
    expect(productRes.body.data.product.attributes.color).toBe('Vintage Black');

    // 4. Admin adjusts stock: receives +25 units into warehouse
    const adjustRes = await request(app)
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        productId,
        quantityDelta: 25,
        reason: 'Initial production batch arrival PO-99128'
      });

    expect(adjustRes.status).toBe(200);
    expect(adjustRes.body.data.product.stock.physical).toBe(25);
    expect(adjustRes.body.data.product.stock.available).toBe(25);
    expect(adjustRes.body.data.product.stock.reserved).toBe(0);

    // 5. Customer registers
    const customerRegisterRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'alex.shopper@example.com',
        password: 'ShopperPassword123!',
        firstName: 'Alex',
        lastName: 'Vance'
      });

    expect(customerRegisterRes.status).toBe(201);
    expect(customerRegisterRes.body.data.user.role).toBe('customer');

    // 6. Customer logs in
    const customerLoginRes = await request(app)
      .post('/api/v1/auth/customer/login')
      .send({
        email: 'alex.shopper@example.com',
        password: 'ShopperPassword123!'
      });

    expect(customerLoginRes.status).toBe(200);
    const customerToken = customerLoginRes.body.data.accessToken;

    // 7. Customer views public product catalog
    const catalogRes = await request(app).get('/api/v1/products');
    expect(catalogRes.status).toBe(200);
    expect(catalogRes.body.data.products.length).toBeGreaterThanOrEqual(1);

    const targetProduct = catalogRes.body.data.products.find((p) => p._id === productId);
    expect(targetProduct).toBeDefined();
    expect(targetProduct.stock.available).toBe(25);
    expect(targetProduct.attributes.size).toBe('M');

    // 8. Customer adds 2 units to shopping cart
    const addToCartRes = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        productId,
        quantity: 2
      });

    expect(addToCartRes.status).toBe(200);
    expect(addToCartRes.body.data.cart.itemCount).toBe(2);
    expect(addToCartRes.body.data.cart.estimatedSubtotalCents).toBe(19000); // 9500 * 2

    // 9. Customer creates a delivery address
    const addressRes = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        recipientName: 'Alex Vance',
        phone: '+15559876543',
        streetAddress1: '124 Conch Street',
        streetAddress2: 'Floor 2',
        city: 'Pacific Grove',
        state: 'CA',
        postalCode: '93950',
        country: 'US',
        isDefault: true
      });

    expect(addressRes.status).toBe(201);
    const addressId = addressRes.body.data.address._id;

    // 10. Customer gets checkout quote
    const quoteRes = await request(app)
      .post('/api/v1/orders/quote')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressId });

    expect(quoteRes.status).toBe(200);
    expect(quoteRes.body.data.subtotalCents).toBe(19000);
    expect(quoteRes.body.data.shippingCents).toBe(0); // Free shipping threshold is 5000 cents ($50)
    expect(quoteRes.body.data.totalCents).toBe(19000);

    // 11. Customer places order with Idempotency-Key and COD
    const orderIdempotencyKey = crypto.randomUUID();
    const placeOrderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', orderIdempotencyKey)
      .send({
        addressId,
        paymentMethod: 'cod'
      });

    expect(placeOrderRes.status).toBe(201);
    const orderData = placeOrderRes.body.data;
    const orderReference = orderData.orderReference;
    expect(orderReference).toMatch(/^ORD-/);
    expect(orderData.orderStatus).toBe('confirmed');
    expect(orderData.paymentStatus).toBe('cod_due');
    expect(orderData.totalCents).toBe(19000);

    // 12. Verify customer cart is now empty
    const cartAfterOrder = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(cartAfterOrder.body.data.cart.itemCount).toBe(0);
    expect(cartAfterOrder.body.data.cart.items).toHaveLength(0);

    // 13. Verify inventory was atomically reserved (anti-overselling ACID guarantee)
    const productAfterOrder = await Product.findById(productId);
    expect(productAfterOrder.stock.physical).toBe(25);
    expect(productAfterOrder.stock.reserved).toBe(2);
    expect(productAfterOrder.stock.available).toBe(23);

    // 14. Customer views their order history
    const customerOrdersRes = await request(app)
      .get('/api/v1/orders/my-orders')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerOrdersRes.status).toBe(200);
    expect(customerOrdersRes.body.data.orders).toHaveLength(1);
    expect(customerOrdersRes.body.data.orders[0].orderReference).toBe(orderReference);

    // 15. Customer views single order detail
    const customerOrderDetailRes = await request(app)
      .get(`/api/v1/orders/my-orders/${orderReference}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerOrderDetailRes.status).toBe(200);
    expect(customerOrderDetailRes.body.data.order.orderReference).toBe(orderReference);

    // 16. Admin finds order in Admin Order Management
    const adminOrdersRes = await request(app)
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminOrdersRes.status).toBe(200);
    const foundAdminOrder = adminOrdersRes.body.data.orders.find(
      (o) => o.orderReference === orderReference
    );
    expect(foundAdminOrder).toBeDefined();

    // 17. Admin advances order fulfillment: confirmed -> processing
    const processingRes = await request(app)
      .patch(`/api/v1/admin/orders/${orderReference}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'processing' });
    expect(processingRes.status).toBe(200);
    expect(processingRes.body.data.order.orderStatus).toBe('processing');

    // 18. Admin advances order fulfillment: processing -> shipped with carrier tracking
    const shippedRes = await request(app)
      .patch(`/api/v1/admin/orders/${orderReference}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'shipped',
        tracking: {
          carrier: 'FedEx Express',
          trackingNumber: 'FX-8899001122',
          trackingUrl: 'https://fedex.com/track/FX-8899001122'
        }
      });
    expect(shippedRes.status).toBe(200);
    expect(shippedRes.body.data.order.orderStatus).toBe('shipped');
    expect(shippedRes.body.data.order.tracking.trackingNumber).toBe('FX-8899001122');

    // 19. Admin advances order fulfillment: shipped -> delivered with COD collection
    const deliveredRes = await request(app)
      .patch(`/api/v1/admin/orders/${orderReference}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'delivered',
        codPaymentCollected: true
      });
    expect(deliveredRes.status).toBe(200);
    expect(deliveredRes.body.data.order.orderStatus).toBe('delivered');
    expect(deliveredRes.body.data.order.paymentStatus).toBe('paid');

    // 20. Customer re-queries order and sees delivered and paid status with tracking
    const customerFinalOrderRes = await request(app)
      .get(`/api/v1/orders/my-orders/${orderReference}`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerFinalOrderRes.status).toBe(200);
    expect(customerFinalOrderRes.body.data.order.orderStatus).toBe('delivered');
    expect(customerFinalOrderRes.body.data.order.paymentStatus).toBe('paid');
    expect(customerFinalOrderRes.body.data.order.tracking.trackingNumber).toBe('FX-8899001122');
  });
});
