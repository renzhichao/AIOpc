import { encrypt, decrypt, generatePassword } from '../encryption';

describe('Encryption Utils', () => {
  const password = 'test-password';
  const plaintext = 'sensitive-api-key-12345';

  describe('encrypt', () => {
    it('should encrypt text successfully', () => {
      const encrypted = encrypt(plaintext, password);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
      expect(typeof encrypted).toBe('string');
    });

    it('should produce different output for same input (due to random salt/IV)', () => {
      const encrypted1 = encrypt(plaintext, password);
      const encrypted2 = encrypt(plaintext, password);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle empty string', () => {
      const encrypted = encrypt('', password);
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
    });

    it('should handle special characters', () => {
      const specialText = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encrypt(specialText, password);
      expect(encrypted).toBeDefined();
    });
  });

  describe('decrypt', () => {
    it('should decrypt text successfully', () => {
      const encrypted = encrypt(plaintext, password);
      const decrypted = decrypt(encrypted, password);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error with wrong password', () => {
      const encrypted = encrypt(plaintext, password);

      expect(() => {
        decrypt(encrypted, 'wrong-password');
      }).toThrow();
    });

    it('should throw error with invalid base64', () => {
      expect(() => {
        decrypt('invalid-base64!@#', password);
      }).toThrow();
    });

    it('should throw error with corrupted data', () => {
      const encrypted = encrypt(plaintext, password);
      const corrupted = encrypted.substring(0, encrypted.length - 10);

      expect(() => {
        decrypt(corrupted, password);
      }).toThrow();
    });
  });

  describe('encrypt/decrypt roundtrip', () => {
    it('should maintain data integrity for various inputs', () => {
      const testData = [
        'simple text',
        'special chars: !@#$%^&*()',
        'unicode: 你好世界 🌍',
        'numbers: 123456789',
        'mixed: Test123!@#你好',
        'long text: ' + 'x'.repeat(1000)
      ];

      testData.forEach(text => {
        const encrypted = encrypt(text, password);
        const decrypted = decrypt(encrypted, password);
        expect(decrypted).toBe(text);
      });
    });

    it('should handle multiple encryption/decryption cycles', () => {
      let result = plaintext;
      for (let i = 0; i < 10; i++) {
        const encrypted = encrypt(result, password);
        result = decrypt(encrypted, password);
      }
      expect(result).toBe(plaintext);
    });
  });

  describe('generatePassword', () => {
    it('should generate password of specified length', () => {
      const password = generatePassword(32);
      expect(password).toBeDefined();
      expect(password.length).toBe(64); // hex encoding doubles the length
    });

    it('should generate different passwords each time', () => {
      const password1 = generatePassword(32);
      const password2 = generatePassword(32);
      expect(password1).not.toBe(password2);
    });

    it('should generate valid hex string', () => {
      const password = generatePassword(16);
      expect(password).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('security properties', () => {
    it('should not expose plaintext in encrypted output', () => {
      const encrypted = encrypt(plaintext, password);
      expect(encrypted).not.toContain(plaintext);
      expect(encrypted.toLowerCase()).not.toContain(plaintext.toLowerCase());
    });

    it('should not expose password in encrypted output', () => {
      const encrypted = encrypt(plaintext, password);
      expect(encrypted).not.toContain(password);
    });

    it('should produce output that looks like random data', () => {
      const encrypted1 = encrypt('test', password);
      const encrypted2 = encrypt('test', password);

      // Same input should produce completely different output
      expect(encrypted1).not.toBe(encrypted2);

      // Small change in input should produce completely different output
      const encrypted3 = encrypt('tesy', password); // one char different
      expect(encrypted1).not.toBe(encrypted3);
    });
  });
});
