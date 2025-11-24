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

const NAR_JO_LABELS: Record<string, string> = {
  浦和: '浦和',
  船橋: '船橋',
  大井: '大井',
  川崎: '川崎',
  門別: '門別',
  盛岡: '盛岡',
  水沢: '水沢',
  名古屋: '名古屋',
  金沢: '金沢',
  園田: '園田',
  姫路: '姫路',
  高知: '高知',
  佐賀: '佐賀',
  帯広: '帯広',
  笠松: '笠松',
  兵庫: '兵庫',
};

export class Spat4Voter {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize(headless = false) {
    this.browser = await chromium.launch({ headless, slowMo: headless ? 0 : 80 });
    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1280, height: 900 });
  }

  async login(credentials: Spat4Credentials) {
    const page = this.ensurePage();
    await page.goto('https://www.spat4.jp/keiba/pc', { waitUntil: 'networkidle' });
    await page.fill('input[name="userId"]', credentials.userId);
    await page.fill('input[name="password"]', credentials.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('button[type="submit"]'),
    ]);

    const loggedIn = await page.locator('text=投票').first().isVisible().catch(() => false);
    if (!loggedIn) {
      throw new Error('SPAT4ログインに失敗しました。ID/パスワードをご確認ください。');
    }
  }

  async vote(request: Spat4BetRequest) {
    const page = this.ensurePage();
    try {
      await this.navigateToVoteTop();
      await this.selectRace(request.joName, request.raceNo);
      await this.selectBetType(request.betTypeName);
      await this.inputKaime(request.kaime);
      await this.inputAmount(request.amount);
      await this.confirmAndSubmit();

      const successMessage = await page.locator('text=投票が完了').first().isVisible().catch(() => false);
      if (!successMessage) {
        return { success: true, message: 'SPAT4投票を送信しました。別画面で結果をご確認ください。' };
      }
      return { success: true, message: 'SPAT4投票が完了しました' };
    } catch (error) {
      return {
        success: false,
        message: 'SPAT4投票処理でエラーが発生しました',
        detail: error instanceof Error ? error.message : `${error}`,
      };
    }
  }

  async close() {
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }

  private ensurePage() {
    if (!this.page) {
      throw new Error('Playwright page not initialized');
    }
    return this.page;
  }

  private async navigateToVoteTop() {
    const page = this.ensurePage();
    await page.goto('https://www.spat4.jp/keiba/pc', { waitUntil: 'networkidle' });
    const voteButton = page.locator('text=投票').first();
    if (await voteButton.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        voteButton.click(),
      ]);
    }
  }

  private async selectRace(joName: string, raceNo: number) {
    const page = this.ensurePage();
    await page.waitForSelector('select[name="jyoCode"]', { timeout: 5000 });
    const label = NAR_JO_LABELS[joName] ?? joName;
    const select = page.locator('select[name="jyoCode"]');
    const success = await select.selectOption({ label }).catch(async () => {
      const value = await select.evaluate((element, target) => {
        const selectElement = element as any;
        const options = Array.from((selectElement?.options ?? []) as any[]);
        const match = options.find((opt: any) => String(opt?.textContent ?? '').includes(target));
        return match ? String(match.value ?? '') : undefined;
      }, label);
      if (value) {
        await select.selectOption(value);
        return true;
      }
      return false;
    });
    if (!success) {
      throw new Error(`開催選択に失敗しました: ${joName}`);
    }

    const raceButton = page.locator(`button:has-text("${raceNo}R")`).first();
    if (await raceButton.isVisible().catch(() => false)) {
      await raceButton.click();
      await page.waitForLoadState('networkidle');
    } else {
      throw new Error(`レース番号 ${raceNo} を選択できませんでした`);
    }
  }

  private async selectBetType(betTypeName: string) {
    const page = this.ensurePage();
    const locator = page.locator(`button:has-text("${betTypeName}")`).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      await page.waitForTimeout(400);
    } else {
      throw new Error(`投票種別「${betTypeName}」が見つかりません`);
    }
  }

  private async inputKaime(kaime: string[]) {
    const page = this.ensurePage();
    for (const item of kaime) {
      const parts = item.split('-');
      for (const part of parts) {
        const button = page.locator(`[data-umaban="${Number(part)}"]`).first();
        if (!(await button.isVisible().catch(() => false))) {
          throw new Error(`馬番 ${part} のボタンが見つかりません`);
        }
        await button.click();
      }
      const addButton = page.locator('text=買い目追加').first();
      if (await addButton.isVisible().catch(() => false)) {
        await addButton.click();
      } else {
        throw new Error('買い目追加ボタンが見つかりません');
      }
    }
  }

  private async inputAmount(amount: number) {
    const page = this.ensurePage();
    const amountInput = page.locator('input[name="betAmount"]');
    if (await amountInput.isVisible().catch(() => false)) {
      await amountInput.fill(String(amount));
    } else {
      throw new Error('金額入力ボックスが見つかりません');
    }
  }

  private async confirmAndSubmit() {
    const page = this.ensurePage();
    const confirmButton = page.locator('text=投票内容を確認').first();
    if (await confirmButton.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        confirmButton.click(),
      ]);
    } else {
      throw new Error('確認画面へ進めませんでした');
    }

    const submitButton = page.locator('text=この内容で投票').first();
    if (await submitButton.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        submitButton.click(),
      ]);
    } else {
      throw new Error('投票ボタンが表示されませんでした');
    }
  }
}
