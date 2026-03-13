import { InstanceSchemas, AuthSchemas, UserSchemas, DocumentSchemas, CommonSchemas } from '../schemas';

describe('Validation Schemas', () => {
  describe('CommonSchemas', () => {
    describe('id', () => {
      it('should validate numeric ID', () => {
        const { error, value } = CommonSchemas.id.validate('123');

        expect(error).toBeUndefined();
        expect(value).toBe('123');
      });

      it('should reject non-numeric ID', () => {
        const { error } = CommonSchemas.id.validate('abc');

        expect(error).toBeDefined();
        expect(error?.details[0].message).toContain('数字');
      });

      it('should reject ID with letters', () => {
        const { error } = CommonSchemas.id.validate('123abc');

        expect(error).toBeDefined();
      });
    });

    describe('instanceId', () => {
      it('should validate UUID format', () => {
        const { error, value } = CommonSchemas.instanceId.validate('123e4567-e89b-12d3-a456-426614174000');

        expect(error).toBeUndefined();
        expect(value).toBe('123e4567-e89b-12d3-a456-426614174000');
      });

      it('should reject invalid UUID format', () => {
        const { error } = CommonSchemas.instanceId.validate('invalid-uuid');

        expect(error).toBeDefined();
      });
    });

    describe('pagination', () => {
      it('should apply default values', () => {
        const { value } = CommonSchemas.pagination!.validate({});

        expect(value.page).toBe(1);
        expect(value.limit).toBe(20);
        expect(value.order).toBe('DESC');
      });

      it('should validate custom pagination parameters', () => {
        const { error, value } = CommonSchemas.pagination!.validate({
          page: 2,
          limit: 50,
          sort: 'name',
          order: 'ASC'
        });

        expect(error).toBeUndefined();
        expect(value.page).toBe(2);
        expect(value.limit).toBe(50);
        expect(value.sort).toBe('name');
        expect(value.order).toBe('ASC');
      });

      it('should reject invalid order', () => {
        const { error } = CommonSchemas.pagination!.validate({
          order: 'INVALID'
        });

        expect(error).toBeDefined();
      });

      it('should enforce max limit', () => {
        const { error } = CommonSchemas.pagination!.validate({
          limit: 200
        });

        expect(error).toBeDefined();
      });
    });
  });

  describe('InstanceSchemas', () => {
    describe('create', () => {
      it('should validate correct input', () => {
        const { error, value } = InstanceSchemas.create.validate({
          template: 'personal',
          config: {
            temperature: 0.7,
            max_tokens: 4000
          }
        });

        expect(error).toBeUndefined();
        expect(value.template).toBe('personal');
      });

      it('should reject invalid template', () => {
        const { error } = InstanceSchemas.create.validate({
          template: 'invalid'
        });

        expect(error).toBeDefined();
      });

      it('should apply default values', () => {
        const { value } = InstanceSchemas.create.validate({
          template: 'personal'
        });

        expect(value.config.temperature).toBe(0.7);
        expect(value.config.max_tokens).toBe(4000);
      });

      it('should validate all template types', () => {
        const templates = ['personal', 'team', 'enterprise'];

        templates.forEach(template => {
          const { error } = InstanceSchemas.create.validate({
            template
          });
          expect(error).toBeUndefined();
        });
      });

      it('should reject temperature out of range', () => {
        const { error } = InstanceSchemas.create.validate({
          template: 'personal',
          config: {
            temperature: 1.5
          }
        });

        expect(error).toBeDefined();
      });

      it('should reject max_tokens out of range', () => {
        const { error } = InstanceSchemas.create.validate({
          template: 'personal',
          config: {
            max_tokens: 10000
          }
        });

        expect(error).toBeDefined();
      });

      it('should reject system_prompt too long', () => {
        const { error } = InstanceSchemas.create.validate({
          template: 'personal',
          config: {
            system_prompt: 'a'.repeat(2001)
          }
        });

        expect(error).toBeDefined();
      });
    });

    describe('update', () => {
      it('should validate partial update', () => {
        const { error, value } = InstanceSchemas.update.validate({
          config: {
            temperature: 0.5
          }
        });

        expect(error).toBeUndefined();
        expect(value.config.temperature).toBe(0.5);
      });

      it('should validate multiple config updates', () => {
        const { error, value } = InstanceSchemas.update.validate({
          config: {
            temperature: 0.8,
            max_tokens: 2000,
            system_prompt: 'Updated prompt'
          }
        });

        expect(error).toBeUndefined();
        expect(value.config.temperature).toBe(0.8);
        expect(value.config.max_tokens).toBe(2000);
      });
    });
  });

  describe('AuthSchemas', () => {
    describe('callback', () => {
      it('should require code', () => {
        const { error } = AuthSchemas.callback.validate({});

        expect(error).toBeDefined();
        expect(error?.details[0].message).toContain('授权码不能为空');
      });

      it('should accept valid code', () => {
        const { error, value } = AuthSchemas.callback.validate({
          code: 'valid_auth_code'
        });

        expect(error).toBeUndefined();
        expect(value.code).toBe('valid_auth_code');
      });

      it('should accept optional state', () => {
        const { error, value } = AuthSchemas.callback.validate({
          code: 'auth_code',
          state: 'csrf_token'
        });

        expect(error).toBeUndefined();
        expect(value.state).toBe('csrf_token');
      });
    });

    describe('refreshToken', () => {
      it('should require refresh_token', () => {
        const { error } = AuthSchemas.refreshToken.validate({});

        expect(error).toBeDefined();
        expect(error?.details[0].message).toContain('刷新令牌不能为空');
      });

      it('should accept valid refresh_token', () => {
        const { error, value } = AuthSchemas.refreshToken.validate({
          refresh_token: 'valid_refresh_token'
        });

        expect(error).toBeUndefined();
        expect(value.refresh_token).toBe('valid_refresh_token');
      });
    });

    describe('verifyToken', () => {
      it('should require token', () => {
        const { error } = AuthSchemas.verifyToken.validate({});

        expect(error).toBeDefined();
        expect(error?.details[0].message).toContain('令牌不能为空');
      });

      it('should accept valid token', () => {
        const { error, value } = AuthSchemas.verifyToken.validate({
          token: 'valid_token'
        });

        expect(error).toBeUndefined();
        expect(value.token).toBe('valid_token');
      });
    });
  });

  describe('UserSchemas', () => {
    describe('update', () => {
      it('should accept valid name update', () => {
        const { error, value } = UserSchemas.update.validate({
          name: 'John Doe'
        });

        expect(error).toBeUndefined();
        expect(value.name).toBe('John Doe');
      });

      it('should accept valid email update', () => {
        const { error, value } = UserSchemas.update.validate({
          email: 'john@example.com'
        });

        expect(error).toBeUndefined();
        expect(value.email).toBe('john@example.com');
      });

      it('should reject invalid email', () => {
        const { error } = UserSchemas.update.validate({
          email: 'invalid-email'
        });

        expect(error).toBeDefined();
        expect(error?.details[0].message).toContain('邮箱格式不正确');
      });

      it('should reject empty name', () => {
        const { error } = UserSchemas.update.validate({
          name: ''
        });

        expect(error).toBeDefined();
      });

      it('should reject name too long', () => {
        const { error } = UserSchemas.update.validate({
          name: 'a'.repeat(51)
        });

        expect(error).toBeDefined();
      });

      it('should accept multiple field updates', () => {
        const { error, value } = UserSchemas.update.validate({
          name: 'Jane Doe',
          email: 'jane@example.com'
        });

        expect(error).toBeUndefined();
        expect(value.name).toBe('Jane Doe');
        expect(value.email).toBe('jane@example.com');
      });
    });
  });

  describe('DocumentSchemas', () => {
    describe('create', () => {
      it('should validate correct input', () => {
        const { error, value } = DocumentSchemas.create.validate({
          title: 'Test Document',
          content: 'Document content here'
        });

        expect(error).toBeUndefined();
        expect(value.title).toBe('Test Document');
        expect(value.content).toBe('Document content here');
      });

      it('should require title', () => {
        const { error } = DocumentSchemas.create.validate({
          content: 'Content'
        });

        expect(error).toBeDefined();
        expect(error?.details[0].message).toContain('文档标题不能为空');
      });

      it('should require content', () => {
        const { error } = DocumentSchemas.create.validate({
          title: 'Title'
        });

        expect(error).toBeDefined();
        expect(error?.details[0].message).toContain('文档内容不能为空');
      });

      it('should reject title too long', () => {
        const { error } = DocumentSchemas.create.validate({
          title: 'a'.repeat(201),
          content: 'Content'
        });

        expect(error).toBeDefined();
      });

      it('should accept optional metadata', () => {
        const { error, value } = DocumentSchemas.create.validate({
          title: 'Title',
          content: 'Content',
          metadata: {
            author: 'John Doe',
            tags: ['tag1', 'tag2']
          }
        });

        expect(error).toBeUndefined();
        expect(value.metadata.author).toBe('John Doe');
      });
    });

    describe('search', () => {
      it('should validate search query', () => {
        const { error, value } = DocumentSchemas.search.validate({
          query: 'search term'
        });

        expect(error).toBeUndefined();
        expect(value.query).toBe('search term');
      });

      it('should apply default limit', () => {
        const { value } = DocumentSchemas.search.validate({
          query: 'search'
        });

        expect(value.limit).toBe(10);
      });

      it('should validate custom limit', () => {
        const { error, value } = DocumentSchemas.search.validate({
          query: 'search',
          limit: 20
        });

        expect(error).toBeUndefined();
        expect(value.limit).toBe(20);
      });

      it('should reject missing query', () => {
        const { error } = DocumentSchemas.search.validate({});

        expect(error).toBeDefined();
        expect(error?.details[0].message).toContain('搜索关键词不能为空');
      });

      it('should reject limit too high', () => {
        const { error } = DocumentSchemas.search.validate({
          query: 'search',
          limit: 100
        });

        expect(error).toBeDefined();
      });
    });
  });
});
