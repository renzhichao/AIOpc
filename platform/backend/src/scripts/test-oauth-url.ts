#!/usr/bin/env ts-node
/**
 * Manual test script for OAuth URL generation
 * This script tests the OAuth URL generation with actual environment variables
 */

import { OAuthService } from '../services/OAuthService';
import { UserRepository } from '../repositories/UserRepository';
import { InstanceRepository } from '../repositories/InstanceRepository';

// Mock UserRepository for this test
const mockUserRepository = {
  findOrCreate: async () => ({
    id: 1,
    feishu_user_id: 'test',
    name: 'Test User'
  }),
  updateLastLogin: async () => {}
} as any;

// Mock InstanceRepository for this test
const mockInstanceRepository = {
  findUnclaimed: async () => null,
  claimInstance: async () => {}
} as any;

// Load environment variables from .env.development
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });

async function testOAuthUrlGeneration() {
  console.log('=== OAuth URL Generation Manual Test ===\n');

  // Create OAuthService instance
  const oauthService = new OAuthService(mockUserRepository, mockInstanceRepository);

  // Test 1: Check environment variables
  console.log('Test 1: Environment Variables Check');
  console.log('FEISHU_APP_ID:', process.env.FEISHU_APP_ID || 'NOT SET');
  console.log('FEISHU_REDIRECT_URI:', process.env.FEISHU_REDIRECT_URI || 'NOT SET');
  console.log('FEISHU_OAUTH_AUTHORIZE_URL:', process.env.FEISHU_OAUTH_AUTHORIZE_URL || 'NOT SET');
  console.log('');

  // Test 2: Generate OAuth URL with default configuration
  console.log('Test 2: Generate OAuth URL with default configuration');
  try {
    const url = await oauthService.getAuthorizationUrl();
    console.log('✅ SUCCESS: Generated OAuth URL');
    console.log('URL:', url);
    console.log('');

    // Verify URL doesn't contain "undefined"
    if (url.includes('undefined')) {
      console.error('❌ FAIL: URL contains "undefined"');
      process.exit(1);
    } else {
      console.log('✅ PASS: URL does not contain "undefined"');
    }

    // Verify URL format
    if (!url.match(/^https?:\/\//)) {
      console.error('❌ FAIL: URL does not start with http:// or https://');
      process.exit(1);
    } else {
      console.log('✅ PASS: URL has valid format');
    }

    // Verify required parameters
    const requiredParams = ['app_id', 'redirect_uri', 'scope', 'state'];
    const missingParams = requiredParams.filter(param => !url.includes(param));

    if (missingParams.length > 0) {
      console.error('❌ FAIL: Missing required parameters:', missingParams);
      process.exit(1);
    } else {
      console.log('✅ PASS: All required parameters present');
    }

  } catch (error) {
    console.error('❌ FAIL: Error generating OAuth URL');
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log('');

  // Test 3: Test with missing FEISHU_APP_ID
  console.log('Test 3: Test error handling with missing FEISHU_APP_ID');
  const originalAppId = process.env.FEISHU_APP_ID;
  delete process.env.FEISHU_APP_ID;

  try {
    oauthService.getAuthorizationUrl();
    console.error('❌ FAIL: Should have thrown error for missing FEISHU_APP_ID');
    process.exit(1);
  } catch (error) {
    console.log('✅ PASS: Correctly throws error for missing FEISHU_APP_ID');
    console.log('Error message:', error instanceof Error ? error.message : error);
  }

  // Restore environment variable
  process.env.FEISHU_APP_ID = originalAppId;
  console.log('');

  // Test 4: Test with missing FEISHU_REDIRECT_URI
  console.log('Test 4: Test error handling with missing FEISHU_REDIRECT_URI');
  const originalRedirectUri = process.env.FEISHU_REDIRECT_URI;
  delete process.env.FEISHU_REDIRECT_URI;

  try {
    oauthService.getAuthorizationUrl();
    console.error('❌ FAIL: Should have thrown error for missing FEISHU_REDIRECT_URI');
    process.exit(1);
  } catch (error) {
    console.log('✅ PASS: Correctly throws error for missing FEISHU_REDIRECT_URI');
    console.log('Error message:', error instanceof Error ? error.message : error);
  }

  // Restore environment variable
  process.env.FEISHU_REDIRECT_URI = originalRedirectUri;
  console.log('');

  // Test 5: Test with custom redirect URI
  console.log('Test 5: Test with custom redirect URI');
  try {
    const customRedirectUri = 'https://custom.example.com/oauth/callback';
    const url = await oauthService.getAuthorizationUrl({ redirect_uri: customRedirectUri });
    console.log('✅ SUCCESS: Generated OAuth URL with custom redirect URI');
    console.log('URL:', url);

    if (url.includes(encodeURIComponent(customRedirectUri))) {
      console.log('✅ PASS: Custom redirect URI is properly encoded in URL');
    } else {
      console.error('❌ FAIL: Custom redirect URI not found in URL');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ FAIL: Error generating OAuth URL with custom redirect URI');
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log('');
  console.log('=== All Tests Passed ✅ ===');
}

// Run the test
testOAuthUrlGeneration()
  .then(() => {
    console.log('\n✅ Manual test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Manual test failed:', error);
    process.exit(1);
  });
