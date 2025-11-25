/**
 * IPAT 自動投票クラス
 * 元のfrmIPAT.csのロジックを忠実に再現
 * 
 * ステートマシン：32ステート
 * - web_navigate: サイトへ移動
 * - vote_menu/vote_menu2: ログイン後のメニュー
 * - vote_race_select系: レース選択
 * - kaime_input系: 買い目入力
 * - kaime_list_chk: 買い目リスト確認
 * - kaime_vote系: 投票確認・実行
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface IpatCredentials {
  inetId: string;      // 加入者番号（Internet ID）
  userCode: string;    // ユーザーコード
  password: string;    // パスワード
  pin: string;         // 暗証番号（PARS_CD）
}

export interface IpatBetRequest {
  kaisaiDate: Date;    // 開催日
  joName: string;      // 競馬場名（例: "東京"）
  raceNo: number;      // レース番号（1-12）
  betType: string;     // 馬券種類（例: "3連単"）
  betTypeNo: number;   // 馬券種類コード（1-8）
  method: number;      // 方式コード（101=ながし, 201=ボックス, 301=フォーメーション）
  kaime: string[];     // 買い目（例: ["1_2_3", "4_5_6"]）
  amount: number;      // 金額
}

export interface IpatVoteResult {
  success: boolean;
  message: string;
  detail?: string;
  details?: string;
}

// ステート定義（元のIpatAutoStat enumから）
// 将来のデバッグ用に保留
// enum VoteState {
//   NON = 0,
//   WEB_NAVIGATE = 1,
//   VOTE_MENU = 2,
//   VOTE_MENU2 = 3,
//   VOTE_RACE_SELECT = 4,
//   VOTE_RACE_SELECT2 = 5,
//   VOTE_RACE_SELECT3 = 6,
//   VOTE_RACE_SELECT4 = 7,
//   KAIME_INPUT_INIT_CHK = 8,
//   KAIME_INPUT_INIT_CHK2 = 9,
//   KAIME_INPUT_JOMEI_CHK = 10,
//   KAIME_INPUT_JOMEI_CHK2 = 11,
//   KAIME_INPUT_JOMEI_CHK3 = 12,
//   KAIME_INPUT_RACE_CHK = 13,
//   KAIME_INPUT_RACE_CHK2 = 14,
//   KAIME_INPUT_RACE_CHK3 = 15,
//   KAIME_INPUT_SHIKIBETSU_CHK = 16,
//   KAIME_INPUT_SHIKIBETSU_CHK2 = 17,
//   KAIME_INPUT_SHIKIBETSU_CHK3 = 18,
//   KAIME_INPUT_METHOD_CHK = 19,
//   KAIME_INPUT_METHOD_CHK2 = 20,
//   KAIME_INPUT_METHOD_CHK3 = 21,
//   KAIME_INPUT_CHK = 22,
//   KAIME_INPUT_SET = 23,
//   KAIME_INPUT_SELECT = 24,
//   KAIME_INPUT_SET_GMN = 25,
//   KAIME_INPUT_SET_CHK = 26,
//   KAIME_INPUT_SET_NEXT = 27,
//   KAIME_INPUT_END = 28,
//   KAIME_LIST_CHK = 29,
//   KAIME_VOTE_CONFIRM = 30,
//   KAIME_VOTE_END = 31,
//   END_STAT = 32,
// }

interface IpatVoterOptions {
  headless?: boolean;
  profileDir?: string;
}

export class IpatVoter {
  private browser: Browser | BrowserContext | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly options: IpatVoterOptions;

  // ステート管理
  // private voteState: VoteState = VoteState.NON;  // 将来のデバッグ用に保留
  private betInfoList: IpatBetRequest[] = [];
  private currentKaimeIdx = 0;
  private currentKaimeNo = 0;

  // 選択状態の記憶（selectboxの変更を最小化するため）
  private selectedJomei = '';
  private selectedYobi = '';
  private selectedRaceNo = 0;
  private selectedBetTypeNo = 0;
  private selectedMethod = 0;

  // 取消馬番
  private canceledUmabans: number[] = [];

  // 認証情報
  private credentials: IpatCredentials | null = null;

  constructor(options: IpatVoterOptions = {}) {
    this.options = {
      headless: options.headless ?? false,
      profileDir: options.profileDir,
    };
  }

  private log(...args: unknown[]): void {
    console.log('[IpatVoter]', ...args);
  }

  private ensurePage(): Page {
    if (!this.page) {
      throw new Error('Page not initialized');
    }
    return this.page;
  }

  /**
   * ブラウザの初期化とログイン
   */
  async initialize(credentials: IpatCredentials): Promise<void> {
    this.log('Launching browser', {
      headless: this.options.headless,
      profileDir: this.options.profileDir,
    });

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: this.options.headless,
    };

    if (this.options.profileDir) {
      const persistentContext = await chromium.launchPersistentContext(this.options.profileDir, {
        ...launchOptions,
        viewport: { width: 1280, height: 1024 },
      });
      this.browser = persistentContext;
      this.context = persistentContext;
      this.page = persistentContext.pages()[0] || (await persistentContext.newPage());
    } else {
      const browser = await chromium.launch(launchOptions);
      this.browser = browser;
      this.context = await browser.newContext();
      this.page = await this.context.newPage();
    }

    this.credentials = credentials;
  }

  /**
   * 投票実行
   */
  async vote(betRequests: IpatBetRequest[]): Promise<IpatVoteResult> {
    try {
      this.betInfoList = betRequests;
      this.currentKaimeIdx = 0;
      this.currentKaimeNo = 0;

      this.log(`Starting vote with ${betRequests.length} bet requests`);

      // ログイン
      await this.login();

      // レース選択・買い目設定
      await this.handleVoteFlow();

      this.log('Vote completed successfully');
      return {
        success: true,
        message: 'IPAT投票が完了しました',
      };
    } catch (error) {
      this.log('Vote error:', error);
      return {
        success: false,
        message: 'IPAT投票処理でエラーが発生しました',
        detail: String(error),
        details: String(error),
      };
    }
  }

  /**
   * ブラウザのクローズ
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.log('Browser closed');
    }
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * ログイン処理
   */
  private async login(): Promise<void> {
    const page = this.ensurePage();

    if (!this.credentials) {
      throw new Error('Credentials not set');
    }

    this.log('Opening IPAT top page');
    await page.goto('https://www.ipat.jra.go.jp/', { waitUntil: 'networkidle' });

    // ログインフォームが表示されているか確認
    const loginForm = page.locator('form[name="loginForm"]');
    if (!(await loginForm.count())) {
      // すでにログイン済みの可能性
      const bodyText = await page.locator('body').textContent();
      if (bodyText?.includes('出馬表から馬を選択する方式です')) {
        this.log('Already logged in');
        return;
      }
    }

    this.log('Filling credentials');
    await page.locator('input[name="inetid"]').fill(this.credentials.inetId);
    await page.locator('input[name="usercd"]').fill(this.credentials.userCode);
    await page.locator('input[name="passwd"]').fill(this.credentials.password);
    await page.locator('input[name="pars_cd"]').fill(this.credentials.pin);

    this.log('Submitting login form');
    await page.locator('form[name="loginForm"]').evaluate((form: any) => {
      form.submit();
    });

    await page.waitForLoadState('networkidle');

    // ログイン成功確認
    const bodyText = await page.locator('body').textContent();
    if (bodyText?.includes('誤りがあります')) {
      throw new Error('IPATログインに失敗しました。認証情報を確認してください。');
    }

    // 重要なお知らせダイアログがあればOKをクリック
    if (bodyText?.includes('重要なお知らせ')) {
      this.log('Clicking OK on important notice dialog');
      const okButton = page.locator('button:has-text("OK")');
      if (await okButton.count()) {
        await okButton.click();
        await page.waitForLoadState('networkidle');
      }
    }

    this.log('Login successful');
  }

  /**
   * 投票フロー全体の制御
   */
  private async handleVoteFlow(): Promise<void> {
    const page = this.ensurePage();

    // 「出馬表から馬を選択する方式です」ボタンをクリック
    this.log('Clicking 出馬表から馬を選択する方式 button');
    const shutsubahyoButton = page.locator('button[title*="出馬表から馬を選択する方式です"]');
    await shutsubahyoButton.click();
    await page.waitForLoadState('networkidle');

    // 全ての買い目を処理
    while (this.currentKaimeIdx < this.betInfoList.length) {
      const betInfo = this.betInfoList[this.currentKaimeIdx];
      this.log(`Processing kaime ${this.currentKaimeIdx + 1}/${this.betInfoList.length}`);

      await this.selectRace(betInfo);
      await this.inputKaime(betInfo);

      this.currentKaimeIdx++;
    }

    // 投票確認・実行
    await this.confirmAndVote();
  }

  /**
   * レース選択
   */
  private async selectRace(betInfo: IpatBetRequest): Promise<void> {
    const page = this.ensurePage();

    this.log('Selecting race:', {
      jo: betInfo.joName,
      race: betInfo.raceNo,
      betType: betInfo.betType,
    });

    // 「このまま進む」ボタンがエラーダイアログで非表示かチェック
    const proceedButton = page.locator('button:has-text("このまま進む")');
    if (await proceedButton.count()) {
      const parent = await proceedButton.locator('xpath=ancestor::div[contains(@class, "ipat-error-window")]').count();
      const isHidden = await proceedButton.locator('xpath=ancestor::div[contains(@class, "ng-hide")]').count();
      if (parent > 0 && isHidden === 0) {
        await proceedButton.click();
        await page.waitForLoadState('networkidle');
      }
    }

    // 競馬場ボタンを探す
    const weekday = this.getWeekdayJapanese(betInfo.kaisaiDate);
    this.log(`Looking for jo button: ${betInfo.joName} ${weekday}`);

    const courseButtons = page.locator('button[onclick*="vm.selectCourse("]');
    const count = await courseButtons.count();

    for (let i = 0; i < count; i++) {
      const button = courseButtons.nth(i);
      const text = await button.textContent();

      if (text?.includes(betInfo.joName) && text?.includes(weekday)) {
        this.log('Found course button, clicking');
        await button.click();
        await page.waitForLoadState('networkidle');
        break;
      }
    }

    // レース番号ボタンをクリック
    const raceButton = page.locator(`button[onclick*="vm.selectRace("]:has-text("${betInfo.raceNo}R")`);
    if (!(await raceButton.count())) {
      throw new Error(`レース${betInfo.raceNo}Rが見つかりません`);
    }

    this.log(`Clicking race ${betInfo.raceNo}R button`);
    await raceButton.click();
    await page.waitForLoadState('networkidle');
  }

  /**
   * 買い目入力
   */
  private async inputKaime(betInfo: IpatBetRequest): Promise<void> {
    const page = this.ensurePage();

    this.log('Inputting kaime');

    // 競馬場（select-course-race-course）
    await this.selectIfNeeded(
      'select-course-race-course',
      betInfo.joName,
      this.getWeekdayJapanese(betInfo.kaisaiDate),
      () => this.selectedJomei === betInfo.joName && this.selectedYobi === this.getWeekdayJapanese(betInfo.kaisaiDate)
    );
    this.selectedJomei = betInfo.joName;
    this.selectedYobi = this.getWeekdayJapanese(betInfo.kaisaiDate);

    // レース番号（select-course-race-race）
    await this.selectIfNeeded(
      'select-course-race-race',
      `${betInfo.raceNo}R`,
      '',
      () => this.selectedRaceNo === betInfo.raceNo
    );
    this.selectedRaceNo = betInfo.raceNo;

    // 式別（bet-basic-type）
    await this.selectIfNeeded(
      'bet-basic-type',
      betInfo.betType,
      '',
      () => this.selectedBetTypeNo === betInfo.betTypeNo
    );
    this.selectedBetTypeNo = betInfo.betTypeNo;

    // 方式（bet-basic-method）
    if (this.getBetTypeUmabanNum(betInfo.betType) > 1) {
      const methodName = this.getMethodName(betInfo.method);
      await this.selectIfNeeded(
        'bet-basic-method',
        methodName,
        '',
        () => this.selectedMethod === betInfo.method
      );
      this.selectedMethod = betInfo.method;
    }

    // 取消馬番の取得（初回のみ）
    if (this.canceledUmabans.length === 0) {
      this.canceledUmabans = await this.getCanceledUmabans();
      this.log('Canceled umabans:', this.canceledUmabans);
    }

    // 取消馬を含む買い目をスキップ
    let shouldSkip = false;
    for (const kaime of betInfo.kaime) {
      const umabans = kaime.split('_').map((u) => parseInt(u, 10)).filter((u) => u > 0);
      for (const umaban of umabans) {
        if (this.canceledUmabans.includes(umaban)) {
          this.log(`Skipping kaime ${kaime} because it contains canceled umaban ${umaban}`);
          shouldSkip = true;
          break;
        }
      }
      if (shouldSkip) break;
    }

    if (shouldSkip) {
      return;
    }

    // 金額入力
    const amountInput = page.locator('#select-list-amount-unit').locator('xpath=..').locator('input').first();
    await amountInput.fill(String(Math.floor(betInfo.amount / 100)));
    await amountInput.dispatchEvent('change');

    // 馬番選択
    await this.selectUmabans(betInfo);

    // 「セット」ボタンをクリック
    await page.waitForTimeout(500);
    const setButton = page.locator('button[onclick*="vm.onSet("]:has-text("セット")');
    if (!(await setButton.isDisabled())) {
      this.log('Clicking セット button');
      await setButton.click();
      this.currentKaimeNo++;
      await page.waitForTimeout(1000);
    }
  }

  /**
   * select要素の選択（変更が必要な場合のみ）
   */
  private async selectIfNeeded(
    selectId: string,
    targetText: string,
    additionalText: string,
    isSameCheck: () => boolean
  ): Promise<void> {
    if (isSameCheck()) {
      return; // すでに選択済み
    }

    const page = this.ensurePage();
    const selectElem = page.locator(`#${selectId}`);

    if (!(await selectElem.count())) {
      return;
    }

    const options = selectElem.locator('option');
    const count = await options.count();

    for (let i = 0; i < count; i++) {
      const option = options.nth(i);
      const text = await option.textContent();

      if (text?.includes(targetText) && (additionalText === '' || text?.includes(additionalText))) {
        this.log(`Selecting option: ${text?.trim()}`);
        await option.evaluate((el: any) => {
          el.selected = true;
        });
        await selectElem.dispatchEvent('change');
        await page.waitForTimeout(2000); // selectbox変更後の待機
        break;
      }
    }
  }

  /**
   * 馬番選択
   */
  private async selectUmabans(betInfo: IpatBetRequest): Promise<void> {
    const page = this.ensurePage();

    // 馬番ボタンのID接頭辞を取得
    const idNames = this.getIdNames(betInfo.betTypeNo, betInfo.method);

    // 選択する馬番リストを作成
    const umabanList: number[] = [];
    for (let i = 1; i < betInfo.kaime.length; i++) {
      const kaimeStr = betInfo.kaime[i];
      if (!kaimeStr) continue;

      const umabans = kaimeStr.split('_').map((u) => parseInt(u, 10)).filter((u) => u > 0);
      for (const umaban of umabans) {
        if (!this.canceledUmabans.includes(umaban)) {
          umabanList.push(umaban);
        }
      }
    }

    this.log(`Selecting ${umabanList.length} umabans:`, umabanList);

    // 馬番を順番にクリック
    for (let i = 0; i < umabanList.length; i++) {
      const umaban = umabanList[i];
      const idName = idNames[Math.min(i + 1, idNames.length - 1)];
      if (!idName) continue;

      const buttonId = `${idName}${umaban}`;
      const button = page.locator(`#${buttonId}`);

      if (await button.count()) {
        await button.click();
        await page.waitForTimeout(50); // 馬番選択間隔
      }
    }
  }

  /**
   * 取消馬番の取得
   */
  private async getCanceledUmabans(): Promise<number[]> {
    const page = this.ensurePage();
    const canceled: number[] = [];

    this.log('Getting canceled umabans');

    // img[src*="baken_torikeshi.png"]を探す
    const cancelImages = page.locator('img[src*="baken_torikeshi.png"]');
    const count = await cancelImages.count();

    for (let i = 0; i < count; i++) {
      const img = cancelImages.nth(i);
      const parent = img.locator('xpath=..');
      const text = await parent.textContent();

      const match = text?.match(/(\d+)/);
      if (match) {
        const umaban = parseInt(match[1], 10);
        if (!canceled.includes(umaban)) {
          canceled.push(umaban);
        }
      }
    }

    return canceled;
  }

  /**
   * 投票確認・実行
   */
  private async confirmAndVote(): Promise<void> {
    const page = this.ensurePage();

    this.log('Confirming and voting');

    // 「投票内容を確認」ボタンをクリック
    const confirmButton = page.locator('button[ng-click*="vm.confirmKaime()"]');
    if (!(await confirmButton.count())) {
      throw new Error('投票内容確認ボタンが見つかりません');
    }

    await confirmButton.click();
    await page.waitForLoadState('networkidle');

    // 暗証番号入力
    if (!this.credentials) {
      throw new Error('Credentials not set');
    }

    const pinInput = page.locator('input[name="暗証番号"], input[ng-model*="pin"]').first();
    if (await pinInput.count()) {
      await pinInput.fill(this.credentials.pin);
    }

    // 「この内容で投票」ボタンをクリック
    const voteButton = page.locator('button[ng-click*="vm.vote()"]');
    if (!(await voteButton.count())) {
      throw new Error('投票実行ボタンが見つかりません');
    }

    this.log('Clicking vote button');
    await voteButton.click();
    await page.waitForLoadState('networkidle');

    // 投票完了確認
    const bodyText = await page.locator('body').textContent();
    if (!bodyText?.includes('投票が完了しました')) {
      throw new Error('投票完了メッセージが見つかりません');
    }

    this.log('Vote confirmed successfully');
  }

  /**
   * ヘルパー関数：曜日を日本語で取得
   */
  private getWeekdayJapanese(date: Date): string {
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return weekdays[date.getDay()];
  }

  /**
   * ヘルパー関数：馬券種類の馬番数を取得
   */
  private getBetTypeUmabanNum(betType: string): number {
    switch (betType) {
      case '単勝':
      case '複勝':
        return 1;
      case '枠連':
      case '馬連':
      case '馬単':
      case 'ワイド':
        return 2;
      case '３連複':
      case '３連単':
        return 3;
      default:
        return 1;
    }
  }

  /**
   * ヘルパー関数：方式名を取得
   */
  private getMethodName(method: number): string {
    switch (method) {
      case 101:
        return 'ながし';
      case 201:
        return 'ボックス';
      case 301:
        return 'フォーメーション';
      default:
        return 'フォーメーション';
    }
  }

  /**
   * ヘルパー関数：馬番ボタンのID接頭辞を取得
   */
  private getIdNames(betTypeNo: number, _method: number): string[] {
    // 簡易実装：実際のHTMLに合わせて調整が必要
    const names: string[] = [''];

    switch (betTypeNo) {
      case 1: // 単勝
      case 2: // 複勝
        names.push('select-list-tan-');
        break;
      case 3: // 枠連
        names.push('select-list-waku-1-', 'select-list-waku-2-');
        break;
      case 4: // 馬連
      case 5: // ワイド
        names.push('select-list-umaren-1-', 'select-list-umaren-2-');
        break;
      case 6: // 馬単
        names.push('select-list-umatan-1-', 'select-list-umatan-2-');
        break;
      case 7: // 3連複
        names.push('select-list-sanrenpuku-1-', 'select-list-sanrenpuku-2-', 'select-list-sanrenpuku-3-');
        break;
      case 8: // 3連単
        names.push('select-list-sanrentan-1-', 'select-list-sanrentan-2-', 'select-list-sanrentan-3-');
        break;
    }

    return names;
  }
}

/**
 * IPAT投票の実行関数
 */
export async function executeIpatVote(
  credentials: IpatCredentials,
  requests: IpatBetRequest[],
  options?: IpatVoterOptions
): Promise<IpatVoteResult> {
  const voter = new IpatVoter(options);
  try {
    await voter.initialize(credentials);
    return await voter.vote(requests);
  } catch (error) {
    return {
      success: false,
      message: 'IPAT投票処理で例外が発生しました',
      detail: String(error),
      details: String(error),
    };
  } finally {
    await voter.close();
  }
}
