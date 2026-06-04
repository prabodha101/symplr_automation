import type { Page } from '@playwright/test';
import { AppRunPage } from '../../pages/AppRunPage';
import type { RunContext } from './models';

export function createRunContext(page: Page): RunContext {
  return {
    pages: { main: page },
    activePageKey: 'main',
  };
}

export function getActivePage(context: RunContext): Page {
  return context.pages[context.activePageKey] ?? context.pages.main;
}

export function getMainPage(context: RunContext): Page {
  return context.pages.main;
}

export function setPopupPage(context: RunContext, page: Page): void {
  context.pages.popup = page;
  context.activePageKey = 'popup';
}

export function setRunPage(context: RunContext, page: Page): void {
  context.pages.run = page;
  context.activePageKey = 'run';
  context.appRunPage = new AppRunPage(page);
}

export async function switchToMainPage(context: RunContext): Promise<void> {
  context.activePageKey = 'main';
  await context.pages.main.bringToFront();
}

export async function switchToPopupPage(context: RunContext): Promise<void> {
  if (!context.pages.popup || context.pages.popup.isClosed()) {
    throw new Error('switchToPopupPage requires a previous popup page and it must still be open.');
  }
  context.activePageKey = 'popup';
  await context.pages.popup.bringToFront();
}

export async function switchToRunPage(context: RunContext): Promise<void> {
  if (!context.pages.run || context.pages.run.isClosed()) {
    throw new Error('switchToRunPage requires a previous buildAndRunApp action that opened the run page.');
  }
  context.activePageKey = 'run';
  await context.pages.run.bringToFront();
}

export function getAppRunPage(context: RunContext): AppRunPage {
  const targetPage = context.pages.run ?? getActivePage(context);
  if (!context.appRunPage || targetPage !== context.pages.run) {
    context.appRunPage = new AppRunPage(targetPage);
  }
  return context.appRunPage;
}
