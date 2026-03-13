/**
 * Health Check Routes
 *
 * Routes for health monitoring and recovery:
 * - GET  /api/health - Platform health
 * - GET  /api/health/instances/:id - Check instance health
 * - POST /api/health/instances/:id/recover - Trigger recovery
 * - GET  /api/health/statistics - Get health statistics
 * - GET  /api/health/instances/:id/history - Get health history
 * - POST /api/health/instances/:id/history/clear - Clear health history
 * - POST /api/health/cycle - Run health check cycle
 */

import { Router } from 'express';
import { HealthCheckController } from '../controllers/HealthCheckController';
import { Container } from 'typedi';
import { asyncHandler } from '../middleware/asyncHandler';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Get health check controller from container
const getController = (): HealthCheckController => {
  return Container.get(HealthCheckController);
};

// Platform health (no auth required)
router.get('/', asyncHandler(async (req, res) => {
  const controller = getController();
  const health = await controller.getPlatformHealth();
  res.json(health);
}));

// Check instance health (requires auth)
router.get(
  '/instances/:instanceId',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const controller = getController();
    const health = await controller.checkInstanceHealth(
      req.params.instanceId,
      req.query.httpCheckEnabled === 'true',
      req.query.timeout ? parseInt(req.query.timeout as string) : undefined,
      req.query.retries ? parseInt(req.query.retries as string) : undefined
    );
    res.json(health);
  })
);

// Trigger manual recovery (requires auth)
router.post(
  '/instances/:instanceId/recover',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const controller = getController();
    const result = await controller.triggerRecovery(req.params.instanceId, req.body);
    res.json(result);
  })
);

// Get health statistics (requires auth)
router.get(
  '/statistics',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const controller = getController();
    const stats = await controller.getHealthStatistics();
    res.json(stats);
  })
);

// Get health history (requires auth)
router.get(
  '/instances/:instanceId/history',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const controller = getController();
    const history = await controller.getHealthHistory(req.params.instanceId);
    res.json(history);
  })
);

// Clear health history (requires auth)
router.post(
  '/instances/:instanceId/history/clear',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const controller = getController();
    const result = await controller.clearHealthHistory(req.params.instanceId);
    res.json(result);
  })
);

// Run health check cycle (admin only, requires auth)
router.post(
  '/cycle',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const controller = getController();
    const stats = await controller.runHealthCheckCycle(req.body);
    res.json(stats);
  })
);

export default router;
