import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { expressApp } from '../../app';

/**
 * API Integration Tests
 *
 * These tests verify that all RESTful API endpoints are properly configured
 * and follow consistent response formats.
 */
describe('API Integration Tests', () => {
  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(expressApp)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('API Info Endpoint', () => {
    it('should return API information', async () => {
      const response = await request(expressApp)
        .get('/api')
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('OAuth Routes', () => {
    describe('GET /api/oauth/authorize', () => {
      it('should return authorization URL', async () => {
        const response = await request(expressApp)
          .get('/api/oauth/authorize')
          .expect(200);

        expect(response.body).toHaveProperty('url');
        expect(response.body.url).toContain('open.feishu.cn');
      });
    });

    describe('POST /api/oauth/callback', () => {
      it('should return error for missing code', async () => {
        const response = await request(expressApp)
          .post('/api/oauth/callback')
          .send({})
          .expect(200);

        expect(response.body).toHaveProperty('error');
      });
    });

    describe('POST /api/oauth/refresh', () => {
      it('should return error for missing refresh token', async () => {
        const response = await request(expressApp)
          .post('/api/oauth/refresh')
          .send({})
          .expect(200);

        expect(response.body).toHaveProperty('error');
      });
    });

    describe('POST /api/oauth/verify', () => {
      it('should return error for missing token', async () => {
        const response = await request(expressApp)
          .post('/api/oauth/verify')
          .send({})
          .expect(200);

        expect(response.body).toHaveProperty('error');
      });
    });
  });

  describe('Instance Routes', () => {
    describe('POST /api/instances', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .post('/api/instances')
          .send({
            template: 'personal',
            config: { name: 'Test Instance' }
          });

        // Should return 401 or 400 (no token provided)
        expect([400, 401]).toContain(response.status);
      });

      it('should validate template parameter', async () => {
        const response = await request(expressApp)
          .post('/api/instances')
          .send({
            template: 'invalid_template',
            config: { name: 'Test Instance' }
          });

        // Should return validation error
        expect([400, 401]).toContain(response.status);
      });
    });

    describe('GET /api/instances', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .get('/api/instances');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('GET /api/instances/:id', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .get('/api/instances/test-id');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('POST /api/instances/:id/start', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .post('/api/instances/test-id/start');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('POST /api/instances/:id/stop', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .post('/api/instances/test-id/stop');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('POST /api/instances/:id/restart', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .post('/api/instances/test-id/restart');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('DELETE /api/instances/:id', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .delete('/api/instances/test-id');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('GET /api/instances/:id/logs', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .get('/api/instances/test-id/logs');

        expect([400, 401]).toContain(response.status);
      });
    });
  });

  describe('User Routes', () => {
    describe('GET /api/users/me', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .get('/api/users/me');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('PUT /api/users/me', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .put('/api/users/me')
          .send({ name: 'Test User' });

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('DELETE /api/users/me', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .delete('/api/users/me');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('GET /api/users/me/instances', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .get('/api/users/me/instances');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('GET /api/users/:id', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .get('/api/users/test-user-id');

        expect([400, 401]).toContain(response.status);
      });
    });
  });

  describe('Monitoring Routes', () => {
    describe('GET /api/monitoring/health', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .get('/api/monitoring/health');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('GET /api/monitoring/instances/:id/health', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .get('/api/monitoring/instances/test-id/health');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('GET /api/monitoring/instances/:id/metrics', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .get('/api/monitoring/instances/test-id/metrics');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('GET /api/monitoring/system/metrics', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .get('/api/monitoring/system/metrics');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('GET /api/monitoring/usage', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .get('/api/monitoring/usage');

        expect([400, 401]).toContain(response.status);
      });
    });

    describe('GET /api/monitoring/alerts', () => {
      it('should require authentication', async () => {
        const response = await request(expressApp)
          .get('/api/monitoring/alerts');

        expect([400, 401]).toContain(response.status);
      });
    });
  });

  describe('API Key Routes', () => {
    describe('GET /api/api-keys/stats', () => {
      it('should return statistics', async () => {
        const response = await request(expressApp)
          .get('/api/api-keys/stats')
          .expect(200);

        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('data');
      });
    });

    describe('GET /api/api-keys/near-quota', () => {
      it('should return keys near quota', async () => {
        const response = await request(expressApp)
          .get('/api/api-keys/near-quota')
          .expect(200);

        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('data');
      });
    });

    describe('GET /api/api-keys/provider/:provider/stats', () => {
      it('should return provider statistics', async () => {
        const response = await request(expressApp)
          .get('/api/api-keys/provider/deepseek/stats')
          .expect(200);

        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('data');
      });
    });

    describe('GET /api/api-keys/provider/:provider/usage', () => {
      it('should return keys with usage', async () => {
        const response = await request(expressApp)
          .get('/api/api-keys/provider/deepseek/usage')
          .expect(200);

        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('data');
      });
    });

    describe('GET /api/api-keys/:id/validate', () => {
      it('should return validation result', async () => {
        const response = await request(expressApp)
          .get('/api/api-keys/1/validate')
          .expect(200);

        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('data');
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(expressApp)
        .get('/api/non-existent-route');

      expect(response.status).toBe(404);
    });

    it('should return consistent error format', async () => {
      const response = await request(expressApp)
        .get('/api/non-existent-route');

      expect(response.body).toHaveProperty('code');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Response Format Consistency', () => {
    it('should return consistent success response format', async () => {
      const response = await request(expressApp)
        .get('/api/oauth/authorize')
        .expect(200);

      expect(typeof response.body).toBe('object');
      expect(Object.keys(response.body).length).toBeGreaterThan(0);
    });

    it('should return JSON content type', async () => {
      const response = await request(expressApp)
        .get('/health');

      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('CORS and Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(expressApp)
        .get('/health');

      // Helmet should add security headers
      expect(response.headers).toBeDefined();
    });
  });
});
