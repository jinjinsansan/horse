import { chromium, type Browser, type Page } from 'playwright';

export interface IpatCredentials {
  inetId: string;
  userCode: string;
  password: string;
  pin: string;
}

export interface IpatBetRequest {
  joName: string;
  raceNo: number;
  betTypeName: string;
  kaime: string[];
  amount: number;
}

export interface VoteResult {
  success: boolean;
  message: string;
  detail?: string;
}

export class IpatVoter {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize(headless = false) {
    this.browser = await chromium.launch({
      headless,
      slowMo: headless ? 0 : 100,
    });
    this.page = await this.browser.newPage();
  }

  async login(credentials: IpatCredentials) {
    if (!this.page) throw new Error('Playwright page not initialized');

    await this.page.goto('https://www.ipat.jra.go.jp/', { waitUntil: 'networkidle' });
    await this.page.fill('input[name="inetid"]', credentials.inetId);
    await this.page.fill('input[name="usercd"]', credentials.userCode);
    await this.page.fill('input[name="passwd"]', credentials.password);
    await this.page.fill('input[name="pin"]', credentials.pin);
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle' }),
      this.page.click('input[type="submit"]'),
    ]);

    const loggedIn = await this.page.locator('text=投票内容照会').first().isVisible().catch(() => false);
    if (!loggedIn) {
      throw new Error('IPATログインに失敗しました。資格情報を確認してください。');
    }
  }

  async vote(request: IpatBetRequest): Promise<VoteResult> {
    if (!this.page) throw new Error('Playwright page not initialized');

    try {
      await this.selectRace(request.joName, request.raceNo);
      await this.selectBetType(request.betTypeName);
      await this.inputKaime(request.kaime);
      await this.inputAmount(request.amount);
      await this.confirmAndSubmit();
      return { success: true, message: 'IPAT投票が完了しました' };
    } catch (error) {
      return { success: false, message: '投票中にエラーが発生しました', detail: `${error}` };
    }
  }

  async close() {
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }

  private async selectRace(joName: string, raceNo: number) {
    if (!this.page) return;
    await this.page.click('text=ネット投票');
    await this.page.waitForLoadState('networkidle');
    await this.page.selectOption('select[name="jo"]', { label: joName }).catch(() => undefined);
    await this.page.click(`text=${raceNo}R`);
  }

  private async selectBetType(betTypeName: string) {
    if (!this.page) return;
    await this.page.click(`text=${betTypeName}`).catch(() => undefined);
    await this.page.waitForTimeout(500);
  }

  private async inputKaime(kaimeList: string[]) {
    if (!this.page) return;
    for (const kaime of kaimeList) {
      const numbers = kaime.split('-');
      for (const num of numbers) {
        await this.page.click(`button[data-umaban="${num}"]`).catch(() => undefined);
      }
      await this.page.click('text=買い目を追加').catch(() => undefined);
    }
  }

  private async inputAmount(amount: number) {
    if (!this.page) return;
    await this.page.fill('input[name="kingaku"]', amount.toString());
  }

  private async confirmAndSubmit() {
    if (!this.page) return;
    await this.page.click('text=投票内容を確認');
    await this.page.waitForLoadState('networkidle');
    await this.page.click('text=この内容で投票');
    await this.page.waitForLoadState('networkidle');
  }
}

export async function executeIpatVote(
  credentials: IpatCredentials,
  request: IpatBetRequest,
  options?: { headless?: boolean },
): Promise<VoteResult> {
  const voter = new IpatVoter();
  try {
    await voter.initialize(options?.headless);
    await voter.login(credentials);
    return await voter.vote(request);
  } catch (error) {
    return {
      success: false,
      message: 'IPAT投票処理で例外が発生しました',
      detail: `${error}`,
    };
  } finally {
    await voter.close();
  }
}
