import {defineConfig} from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'https://www.baidu.com',
    specPattern: 'cypress/e2e/visual-guard.generated.cy.ts',
    supportFile: false,
    video: false,
    screenshotsFolder: '.visual-guard/cypress-artifacts/screenshots',
    downloadsFolder: '.visual-guard/cypress-artifacts/downloads'
  }
});
