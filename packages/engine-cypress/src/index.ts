/**
 * @visual-guard/engine-cypress — Cypress 项目桥接适配器
 *
 * Cypress 与 Playwright / Puppeteer 的同进程 Page API 不同，不能直接提供
 * `page.goto()` / `page.screenshot()` 这一类实时控制接口。
 *
 * 因此本包采用桥接模式：生成 Cypress spec + cypress.config.ts，让 Cypress
 * 负责真实浏览器执行，Visual Guard 后续消费 `.visual-guard/cypress-artifacts`。
 *
 * 约束：当前阶段仅面向 macOS / Linux，不适配 Windows。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  BrowserEngineAdapter,
  EngineCapabilities,
  EngineLaunchOptions,
  EngineRuntime,
  SceneConfig,
  ViewportConfig
} from '@visual-guard/shared';
import {logger} from '@visual-guard/shared';

const DEFAULT_ARTIFACT_DIR = '.visual-guard/cypress-artifacts';
const DEFAULT_SPEC_FILE = 'cypress/e2e/visual-guard.generated.cy.js';
const DEFAULT_CONFIG_FILE = 'cypress.config.js';
const DEFAULT_VIEWPORT: ViewportConfig = {
  name: 'desktop',
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  isMobile: false
};

const capabilities: EngineCapabilities = {
  fullPageScreenshot: true,
  elementScreenshot: true,
  domSnapshot: true,
  networkInterception: true,
  consoleListening: true,
  multiContext: false,
  lighthouse: false,
  cdpAccess: false,
  cookies: true,
  extraHTTPHeaders: false
};

export interface CypressBridgeOptions {
  /** Cypress 配置文件路径，如 cypress.config.ts */
  configFile?: string;
  /** Cypress spec 路径 */
  spec?: string;
}

export interface CypressSpecOptions {
  /** 项目名 */
  project: string;
  /** 被测站点根地址 */
  baseUrl: string;
  /** 场景列表 */
  scenarios: SceneConfig[];
  /** 视口列表；不传则使用 desktop */
  viewport?: ViewportConfig[];
  /** 采集产物输出目录 */
  artifactDir?: string;
}

export interface CypressConfigOptions {
  /** Cypress spec glob */
  specPattern?: string;
  /** 采集产物输出目录 */
  artifactDir?: string;
  /** 被测站点根地址 */
  baseUrl?: string;
}

export function createCypressAdapter(_options: CypressBridgeOptions = {}): BrowserEngineAdapter {
  return {
    name: 'cypress',
    capabilities,
    async launch(_launchOptions: EngineLaunchOptions): Promise<EngineRuntime> {
      logger.error('Cypress 引擎当前是桥接模式，不能直接使用 visual-guard run 驱动页面。');
      logger.error('原因：Cypress 不暴露 Playwright/Puppeteer 式的同进程 Page API。');
      logger.error('请改用: visual-guard cypress run');
      logger.error('或先生成文件: visual-guard cypress spec');
      logger.error('当前主线执行请使用: visual-guard run --engine playwright');
      throw new Error('CYPRESS_BRIDGE_MODE_ONLY');
    }
  };
}

/**
 * 生成 Cypress spec 内容。
 *
 * 该 spec 是桥接层核心产物：让 Cypress 自己驱动浏览器，Visual Guard 消费产物。
 */
export function generateCypressSpec(options: CypressSpecOptions): string {
  const artifactDir = options.artifactDir ?? DEFAULT_ARTIFACT_DIR;
  const viewports =
    options.viewport && options.viewport.length > 0 ? options.viewport : [DEFAULT_VIEWPORT];
  const cases = _buildCases(options.scenarios, viewports, options.baseUrl);

  return `/// <reference types="cypress" />

const artifactDir = ${JSON.stringify(artifactDir)};
const cases = ${JSON.stringify(cases, null, 2)};

describe('Visual Guard Cypress Bridge', () => {
  for (const item of cases) {
    it(item.id, () => {
      cy.viewport(item.viewport.width, item.viewport.height);
      cy.visit(item.url, { failOnStatusCode: false });

      if (item.waitForSelector) {
        cy.get(item.waitForSelector, { timeout: item.timeout }).should('exist');
      }

      if (item.waitForTimeout) {
        cy.wait(item.waitForTimeout);
      }

      const caseDir = \`${artifactDir}/cases/\${item.id}\`;

      cy.document().then((doc) => {
        const dom = doc.documentElement.outerHTML;
        cy.writeFile(\`\${caseDir}/dom.html\`, dom);
      });

      cy.writeFile(\`\${caseDir}/meta.json\`, {
        id: item.id,
        name: item.name,
        url: item.url,
        viewport: item.viewport,
        screenshot: \`screenshots/\${item.id}/full.png\`,
        createdAt: new Date().toISOString(),
      });

      cy.screenshot(\`\${item.id}/full\`, { capture: 'fullPage' });

      for (const selector of item.elements) {
        cy.get(selector).screenshot(\`\${item.id}/elements/\${encodeURIComponent(selector)}\`);
      }
    });
  }
});
`;
}

/**
 * 生成 Cypress 配置文件内容。
 */
export function generateCypressConfig(options: CypressConfigOptions = {}): string {
  const artifactDir = options.artifactDir ?? DEFAULT_ARTIFACT_DIR;
  const specPattern = options.specPattern ?? DEFAULT_SPEC_FILE;

  return `const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: ${JSON.stringify(options.baseUrl ?? undefined)},
    specPattern: ${JSON.stringify(specPattern)},
    supportFile: false,
    video: false,
    screenshotsFolder: ${JSON.stringify(`${artifactDir}/screenshots`)},
    downloadsFolder: ${JSON.stringify(`${artifactDir}/downloads`)},
  },
});
`;
}

/**
 * 写入 Cypress spec 文件。
 */
export async function writeCypressSpec(
  options: CypressSpecOptions,
  specFile = DEFAULT_SPEC_FILE
): Promise<string> {
  const target = path.resolve(specFile);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, generateCypressSpec(options), 'utf-8');
  return target;
}

/**
 * 写入 Cypress 配置文件。
 */
export async function writeCypressConfig(
  options: CypressConfigOptions = {},
  configFile = DEFAULT_CONFIG_FILE
): Promise<string> {
  const target = path.resolve(configFile);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, generateCypressConfig(options), 'utf-8');
  return target;
}

function _buildCases(scenarios: SceneConfig[], viewports: ViewportConfig[], baseUrl: string) {
  const cases: Array<Record<string, unknown>> = [];

  for (const scene of scenarios) {
    for (const viewport of viewports) {
      const url = new URL(scene.path, baseUrl).toString();
      cases.push({
        id: `${scene.id}@${viewport.name}`,
        name: scene.name,
        url,
        timeout: 30000,
        waitForSelector: scene.waitForSelector,
        waitForTimeout: scene.waitForTimeout,
        elements: scene.elements ?? [],
        viewport: {
          name: viewport.name,
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
          isMobile: viewport.isMobile ?? false
        }
      });
    }
  }

  return cases;
}
