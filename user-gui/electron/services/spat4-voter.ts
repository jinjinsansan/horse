import { chromium, type Browser, type Page } from 'playwright';

export interface Spat4Credentials {
  userId: string;
  password: string;
}

export interface Spat4BetRequest {
  joName: string;
  raceNo: number;
  betTypeName: string;
  kaime: string[];
  amount: number;
}

export class Spat4Voter {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize(headless = false) {
    this.browser = await chromium.launch({ headless, slowMo: headless ? 0 : 60 });
    this.page = await this.browser.newPage();
  }

  async login(credentials: Spat4Credentials) {
    if (!this.page) throw new Error('Playwright page not initialized');
    await this.page.goto('https://www.spat4.jp/keiba/pc', { waitUntil: 'networkidle' });
    await this.page.fill('input[name="userId"]', credentials.userId);
    await this.page.fill('input[name="password"]', credentials.password);
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle' }),
      this.page.click('button[type="submit"]'),
    ]);

    const loggedIn = await this.page.locator('text=投票').first().isVisible().catch(() => false);
    if (!loggedIn) {
      throw new Error('SPAT4ログインに失敗しました');
    }
  }

  async vote(_request: Spat4BetRequest) {
    if (!this.page) throw new Error('Playwright page not initialized');
    // 実装はIPAT版と同様にDOM構造に合わせて行う。現時点では枠組みのみ。
    await this.page.goto('https://www.spat4.jp/keiba/pc', { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(500);
    return { success: true, message: 'SPAT4投票処理は未実装です' };
  }

  async close() {
    await this.browser?.close();
  }
}
