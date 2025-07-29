import express from 'express';
import { 
  getLocations, 
  getStatuses, 
  getTATReport, 
  exportTATReport,
  getTATAnalytics
} from '../controllers/TAT.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protect all routes with authentication
router.use(protect);

// Master data routes
router.get('/locations', getLocations);
router.get('/statuses', getStatuses);

// TAT Report routes
router.get('/report', getTATReport);
router.get('/report/export', exportTATReport);
router.get('/analytics', getTATAnalytics);

// Debug route to test if TAT routes are working
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'TAT routes are working!',
    timestamp: new Date().toISOString()
  });
});

export default router;