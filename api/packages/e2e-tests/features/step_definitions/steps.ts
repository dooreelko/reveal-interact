import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'expect';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateToken } from './utils';

let baseUrl: string;
let currentToken: string;
let hostUid: string;
let userUid: string;
let lastResponse: { status: number; data: any };
let privateKey: string;

Given('the API is running at {string}', (_url: string) => {
  if (!process.env.BASE_URL) {
    throw new Error('BASE_URL environment variable must be set explicitly');
  }
  baseUrl = process.env.BASE_URL;
});

Given('I have a valid session token for {string}', (sessionName: string) => {
  // Try to find the private key
  const keyPath = path.join(os.homedir(), '.ssh', 'revint-private.pem');
  if (fs.existsSync(keyPath)) {
    privateKey = fs.readFileSync(keyPath, 'utf8');
  } else {
    // Fallback/Warning: This might fail if the server uses a different key
    throw new Error(`Private key not found at ${keyPath}. Please run create-session.sh first.`);
  }

  const date = new Date().toISOString().split('T')[0];
  currentToken = generateToken(sessionName, date, privateKey);
});

async function performFetch(url: string, options: RequestInit = {}) {
  const response = await fetch(url, options);
  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    // Ignore if not JSON
  }
  return { status: response.status, data };
}

When('I create a new session with the token', async () => {
  const url = `${baseUrl}/api/v1/session/new/${encodeURIComponent(currentToken)}`;
  lastResponse = await performFetch(url, { method: 'POST' });
  if (lastResponse.status === 200) {
    hostUid = lastResponse.data.uid;
  }
});

Then('the response should contain a {string} and {string}', (field1: string, field2: string) => {
  expect(lastResponse.data).toHaveProperty(field1);
  expect(lastResponse.data).toHaveProperty(field2);
});

Then('the {string} should match the one I used', (field: string) => {
  expect(lastResponse.data[field]).toBe(currentToken);
});

Given('I have created a session with that token', async () => {
  const url = `${baseUrl}/api/v1/session/new/${encodeURIComponent(currentToken)}`;
  lastResponse = await performFetch(url, { method: 'POST' });
  expect(lastResponse.status).toBe(200);
  hostUid = lastResponse.data.uid;
});

When('I login to the session with the token', async () => {
  const url = `${baseUrl}/api/v1/session/${encodeURIComponent(currentToken)}/login`;
  lastResponse = await performFetch(url, { method: 'POST' });
  if (lastResponse.status === 200) {
    userUid = lastResponse.data.uid;
  }
});

Then('the response should contain a {string}', (field: string) => {
  expect(lastResponse.data).toHaveProperty(field);
});

Given('I have logged in to the session', async () => {
  const url = `${baseUrl}/api/v1/session/${encodeURIComponent(currentToken)}/login`;
  lastResponse = await performFetch(url, { method: 'POST' });
  expect(lastResponse.status).toBe(200);
  userUid = lastResponse.data.uid;
});

When('I send a {string} reaction for page {string}', async (reaction: string, page: string) => {
  const url = `${baseUrl}/api/v1/session/${encodeURIComponent(currentToken)}/user/${userUid}/react/${page}/${reaction}`;
  lastResponse = await performFetch(url, { method: 'POST' });
});

Then('the response should indicate success', () => {
  expect(lastResponse.status).toBe(200);
  expect(lastResponse.data).toHaveProperty('success', true);
});

When('I set the state to {string} for page {string}', async (state: string, page: string) => {
  const url = `${baseUrl}/api/v1/session/${encodeURIComponent(currentToken)}/state/${page}/${state}`;
  // Send the host uid in a cookie
  lastResponse = await performFetch(url, {
    method: 'POST',
    headers: {
      'Cookie': `uid=${hostUid}`
    }
  });
});

When('I get the session state', async () => {
  const url = `${baseUrl}/api/v1/session/${encodeURIComponent(currentToken)}/state`;
  lastResponse = await performFetch(url);
});

Then('the state should be {string} for page {string}', (state: string, page: string) => {
  expect(lastResponse.status).toBe(200);
  expect(lastResponse.data).toHaveProperty('state', state);
  expect(lastResponse.data).toHaveProperty('page', page);
});
