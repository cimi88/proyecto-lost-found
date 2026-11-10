export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
  assistantBaseUrl: 'http://localhost:8000',
  demoIdentity: {
    enabled: true,
    userId: '00000000-0000-4000-8000-000000000001',
  },
} as const;
