import { Router } from 'express';
import { env } from '../config/env.js';
import healthRoutes from '../modules/health/health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import categoryRoutes from '../modules/categories/category.routes.js';
import productRoutes from '../modules/products/product.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import cartRoutes from '../modules/carts/cart.routes.js';
import addressRoutes from '../modules/addresses/address.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import orderRoutes from '../modules/orders/order.routes.js';
import paymentRoutes from '../modules/payments/payment.routes.js';
import collectionRoutes from '../modules/collections/collection.routes.js';
import projectRoutes from '../modules/projects/project.routes.js';
import sectionRoutes from '../modules/sections/section.routes.js';
import { ApiResponse } from '../utils/ApiResponse.js';

const router = Router();

// Base API information endpoint
router.get('/', (req, res) => {
  return ApiResponse.success(res, {
    message: 'Welcome to DripRack E-Commerce REST API v1',
    data: {
      version: '1.0.0',
      docs: '/api/v1/docs',
      status: 'operational',
      timestamp: new Date().toISOString()
    }
  });
});

// Public storefront safe configuration (no secrets exposed)
router.get('/config', (req, res) => {
  return ApiResponse.success(res, {
    message: 'Storefront public configuration retrieved successfully',
    data: {
      currency: env.CURRENCY_CODE,
      shipping: {
        flatFeeCents: env.SHIPPING_FLAT_FEE_CENTS,
        freeShippingThresholdCents: env.FREE_SHIPPING_THRESHOLD_CENTS
      },
      taxRatePercent: env.TAX_RATE_PERCENT,
      payments: {
        codEnabled: true,
        onlineEnabled: env.ENABLE_ONLINE_PAYMENTS,
        provider: env.ENABLE_ONLINE_PAYMENTS ? env.PAYMENT_PROVIDER : 'cod'
      },
      announcement: {
        text: 'All prices include duties and taxes. No surprises at delivery.',
        link: '/support'
      },
      editorial: {
        tagline: 'The Art of Doing Nothing',
        subheading: 'Unisex elevated contemporary streetwear and living space essentials engineered between Montreal and Seoul.',
        spotifyPlaylistUrl: 'https://open.spotify.com'
      },
      videos: {
        hero: 'https://estudioniksen.com/cdn/shop/videos/c/vp/8646ef9c189740bf93c0a2c8d9b42e80/8646ef9c189740bf93c0a2c8d9b42e80.HD-1080p-7.2Mbps-101245130.mp4?v=0',
        heroPoster: 'https://estudioniksen.com/cdn/shop/files/preview_images/8646ef9c189740bf93c0a2c8d9b42e80.thumbnail.0000000000_small.jpg?v=1794590101',
        projects: 'https://estudioniksen.com/cdn/shop/videos/c/vp/b2d6fe38e4dc417da783732b53b81bc9/b2d6fe38e4dc417da783732b53b81bc9.HD-720p-4.5Mbps-98935417.mp4?v=0',
        projectsPoster: 'https://estudioniksen.com/cdn/shop/files/preview_images/b2d6fe38e4dc417da783732b53b81bc9.thumbnail.0000000000_small.jpg?v=1793027093',
        sounds: 'https://estudioniksen.com/cdn/shop/videos/c/vp/6fb1bc7d8cac42769e7ec5852b4028f7/6fb1bc7d8cac42769e7ec5852b4028f7.HD-1080p-7.2Mbps-87401521.mp4?v=0'
      },
      storeInfo: {
        address: '655 Desnoyers, Suite 110 Montreal, QC H4C 3C5',
        hours: 'Sunday to Saturday 12-5 / 12-6',
        socials: {
          instagram: 'https://instagram.com/estudioniksen',
          tiktok: 'https://tiktok.com/@estudioniksen'
        }
      },
      locations: [
        {
          city: 'Montreal',
          name: 'Atelier & Flagship',
          address: '420 Rue Saint-Paul Ouest, Montréal, QC H2Y 2A6',
          hours: 'Mon – Sat: 11:00 – 19:00 | Sun: 12:00 – 17:00'
        },
        {
          city: 'Seoul',
          name: 'Design Studio & Showroom',
          address: '24 Hannam-daero 20-gil, Yongsan-gu, Seoul',
          hours: 'Tue – Sun: 12:00 – 20:00'
        }
      ]
    }
  });
});

// Mount module routes
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/collections', collectionRoutes);
router.use('/projects', projectRoutes);
router.use('/products', productRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/cart', cartRoutes);
router.use('/addresses', addressRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/sections', sectionRoutes);
router.use('/admin', adminRoutes);

// Test-only route for role authorization verification
if (process.env.NODE_ENV === 'test') {
  const { authenticate } = await import('../middleware/authenticate.js');
  const { authorize } = await import('../middleware/authorize.js');

  router.get('/test/admin-only', authenticate, authorize('admin'), (req, res) => {
    return ApiResponse.success(res, {
      message: 'Welcome Admin',
      data: { user: req.user }
    });
  });
}

export default router;
