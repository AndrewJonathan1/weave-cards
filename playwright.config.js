const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'e2e-headed',
      testMatch: /file-open-e2e/,
      use: {
        headless: false,
        launchOptions: {
          args: ['--enable-features=FileSystemAccessAPI', '--disable-features=FileSystemAccessAPIPermissionPrompt'],
        },
      },
    },
    {
      name: 'default',
      testIgnore: /file-open-e2e/,
    },
  ],
});
