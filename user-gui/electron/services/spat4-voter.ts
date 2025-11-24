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
    try {
      await this.navigateToVoteTop();
      await this.selectRace(_request.joName, _request.raceNo);
      await this.selectBetType(_request.betTypeName);
      await this.inputKaime(_request.kaime);
      await this.inputAmount(_request.amount);
      await this.confirmAndSubmit();
      const completed = await this.page.locator('text=投票が完了').first().isVisible().catch(() => false);
      if (completed) {
        return { success: true, message: 'SPAT4投票が完了しました' };
      }
      return { success: true, message: 'SPAT4投票を送信しました（要確認）' };
    } catch (error) {
      return {
        success: false,
        message: 'SPAT4投票処理でエラーが発生しました',
        detail: `${error}`,
      };
    }
  }

  async close() {
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }

  private async navigateToVoteTop() {
    if (!this.page) return;
    await this.page.goto('https://www.spat4.jp/keiba/pc', { waitUntil: 'networkidle' });
    const voteButton = this.page.locator('text=投票').first();
    if (await voteButton.isVisible().catch(() => false)) {
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle' }),
        voteButton.click(),
      ]);
    }
  }

  private async selectRace(joName: string, raceNo: number) {
    if (!this.page) return;
    const raceDropdown = this.page.locator('select[name="jyoCode"]');
    if (await raceDropdown.isVisible().catch(() => false)) {
      await raceDropdown.selectOption({ label: joName }).catch(() => undefined);
    }
    const raceButton = this.page.locator(`button:has-text("${raceNo}R")`).first();
    if (await raceButton.isVisible().catch(() => false)) {
      await raceButton.click();
      await this.page.waitForLoadState('networkidle');
    }
  }

  private async selectBetType(betTypeName: string) {
    if (!this.page) return;
    const locator = this.page.locator(`button:has-text("${betTypeName}")`).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      await this.page.waitForTimeout(300);
    }
  }

  private async inputKaime(kaime: string[]) {
    if (!this.page) return;
    for (const item of kaime) {
      const parts = item.split('-');
      for (const part of parts) {
        const button = this.page.locator(`[data-umaban="${Number(part)}"]`).first();
        if (await button.isVisible().catch(() => false)) {
          await button.click();
        }
      }
      const addButton = this.page.locator('text=買い目追加').first();
      if (await addButton.isVisible().catch(() => false)) {
        await addButton.click();
      }
    }
  }

  private async inputAmount(amount: number) {
    if (!this.page) return;
    const amountInput = this.page.locator('input[name="betAmount"]');
    if (await amountInput.isVisible().catch(() => false)) {
      await amountInput.fill(String(amount));
    }
  }

  private async confirmAndSubmit() {
    if (!this.page) return;
    const confirmButton = this.page.locator('text=投票内容を確認').first();
    if (await confirmButton.isVisible().catch(() => false)) {
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle' }),
        confirmButton.click(),
      ]);
    }
    const submitButton = this.page.locator('text=この内容で投票').first();
    if (await submitButton.isVisible().catch(() => false)) {
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle' }),
        submitButton.click(),
      ]);
    }
  }
}
