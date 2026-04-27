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
  /** スクリーンショット保存先ディレクトリ（指定時のみ vote 失敗時に保存） */
  screenshotDir?: string;
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

  // 取消馬番（レース毎に再取得。lastCanceledRaceKey が変わったら再フェッチ）
  private canceledUmabans: number[] = [];
  private canceledUmabansRaceKey = '';

  // 認証情報
  private credentials: IpatCredentials | null = null;

  constructor(options: IpatVoterOptions = {}) {
    this.options = {
      headless: options.headless ?? false,
      profileDir: options.profileDir,
      screenshotDir: options.screenshotDir,
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
      const screenshotPath = await this.captureScreenshot('ipat-error');
      return {
        success: false,
        message: 'IPAT投票処理でエラーが発生しました',
        detail: screenshotPath ? `${String(error)} (screenshot: ${screenshotPath})` : String(error),
        details: screenshotPath ? `${String(error)} (screenshot: ${screenshotPath})` : String(error),
      };
    }
  }

  /**
   * 単勝/複勝の馬番ボタンを複数 selector で探索する。
   * 主候補 → fallback の順に試し、最初に見つかったものを返す。
   */
  private async findUmabanButton(betTypeNo: number, umaban: number) {
    const page = this.ensurePage();
    const isTan = betTypeNo === 1;
    const candidates: string[] = isTan
      ? [
          `#select-list-tan-${umaban}`,
          `button[id*="select-list-tan-${umaban}"]`,
          `button[onclick*="vm.selectUma(${umaban}"]`,
          `button[onclick*="selectUma(${umaban},"]`,
        ]
      : [
          `#select-list-fuku-${umaban}`,
          `button[id*="select-list-fuku-${umaban}"]`,
          `button[onclick*="vm.selectUma(${umaban}"]`,
          `button[onclick*="selectUma(${umaban},"]`,
        ];

    for (const sel of candidates) {
      const loc = page.locator(sel).first();
      try {
        if (await loc.count()) {
          this.log(`Found umaban button via selector: ${sel}`);
          return loc;
        }
      } catch {
        // selector 構文エラー等は無視して次へ
      }
    }
    return null;
  }

  /**
   * デバッグ用: 馬番ボタン周辺の DOM スニペットを取得（先頭 500 字）
   *
   * page.evaluate の中身はブラウザ context で実行されるため document を直接参照できる。
   * shared パッケージは Node lib のみで型推論されるので、コールバック側は any で受ける。
   */
  private async dumpRelevantDom(umaban: number): Promise<string> {
    const page = this.ensurePage();
    try {
      // page.evaluate のコールバックはブラウザ context で実行される。
      // shared パッケージは Node lib のみのため、any キャストで型エラーを回避。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const html = await page.evaluate<string, number>(
        ((target: number) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const doc = (globalThis as any).document;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const buttons: any[] = Array.from(doc.querySelectorAll('button'));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const matches = buttons.filter((b: any) =>
            String(b.id || '').includes(String(target)) ||
            String(b.getAttribute('onclick') || '').includes(`(${target}`)
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return matches.slice(0, 5).map((b: any) => b.outerHTML).join(' | ');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any,
        umaban,
      );
      return (html || '(no related buttons found)').slice(0, 500);
    } catch (e) {
      return `dom dump failed: ${e}`;
    }
  }

  /**
   * スクリーンショット保存（option.screenshotDir が指定されている場合のみ）
   */
  private async captureScreenshot(prefix: string): Promise<string | null> {
    if (!this.options.screenshotDir || !this.page) return null;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${prefix}-${ts}.png`;
    // ブラウザ側に Node の path.join はないので / で結合
    const fullPath = `${this.options.screenshotDir.replace(/[\\/]+$/, '')}/${filename}`;
    try {
      await this.page.screenshot({ path: fullPath, fullPage: true });
      this.log(`Screenshot saved: ${fullPath}`);
      return fullPath;
    } catch (e) {
      this.log('Screenshot save failed:', e);
      return null;
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

    // 重要なお知らせダイアログがあればOKをクリック（ダイアログ内に限定）
    if (bodyText?.includes('重要なお知らせ')) {
      this.log('Clicking OK on important notice dialog');
      // AngularJS の ng-show/ng-if ベースのダイアログ内OKボタンに絞る
      const okButton = page.locator([
        'div:has-text("重要なお知らせ") button:has-text("OK")',
        '[ng-show*="notice"] button:has-text("OK")',
        '[ng-if*="notice"] button:has-text("OK")',
        '[class*="notice"] button:has-text("OK")',
        '[class*="dialog"] button:has-text("OK")',
      ].join(', ')).first();
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
      await this.captureScreenshot(`ipat-race-not-found-${betInfo.raceNo}`);
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

    // 取消馬番の取得（レース毎に再取得。複数レース連続投票で汚染しないよう race key で管理）
    const canceledRaceKey = `${betInfo.joName}:${betInfo.raceNo}`;
    if (canceledRaceKey !== this.canceledUmabansRaceKey) {
      this.canceledUmabans = await this.getCanceledUmabans();
      this.canceledUmabansRaceKey = canceledRaceKey;
      this.log(`Canceled umabans for ${canceledRaceKey}:`, this.canceledUmabans);
    }

    // 単勝・複勝は専用パス（GANTZ メイン経路）
    if (betInfo.betTypeNo === 1 || betInfo.betTypeNo === 2) {
      await this.inputKaimeTanFuku(betInfo);
      return;
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
      // ❼ セット前の買い目リスト行数を記録してセット後に増加確認
      const kaimeListRows = page.locator('[ng-repeat*="kaime"], .ipat-kaime-row, #select-list-kaime tbody tr');
      const rowsBefore = await kaimeListRows.count();
      this.log('Clicking セット button (rows before:', rowsBefore, ')');
      await setButton.click();
      this.currentKaimeNo++;
      // AngularJS が DOM を更新するまで待機
      await page.waitForTimeout(1500);
      const rowsAfter = await kaimeListRows.count();
      if (rowsAfter > rowsBefore) {
        this.log(`Set confirmed: kaime list ${rowsBefore} → ${rowsAfter} rows`);
      } else {
        this.log(`Warning: kaime list row count unchanged after set (${rowsBefore}). May have failed.`);
        await this.captureScreenshot('ipat-set-no-increment');
      }
    }
  }

  /**
   * 単勝・複勝の買い目入力（1頭のみクリック）
   * kaime[0] に馬番文字列（例 "5"）が入っている前提
   */
  private async inputKaimeTanFuku(betInfo: IpatBetRequest): Promise<void> {
    const page = this.ensurePage();

    const targetUmaban = parseInt(String(betInfo.kaime[0] ?? ''), 10);
    if (!targetUmaban || targetUmaban <= 0) {
      throw new Error(`単勝/複勝の馬番が無効です: ${JSON.stringify(betInfo.kaime)}`);
    }

    // 取消馬チェック
    if (this.canceledUmabans.includes(targetUmaban)) {
      this.log(`Skipping: umaban ${targetUmaban} is canceled`);
      return;
    }

    this.log(`Tan/Fuku input: betTypeNo=${betInfo.betTypeNo}, umaban=${targetUmaban}, amount=${betInfo.amount}`);

    // 金額入力
    const amountInput = page.locator('#select-list-amount-unit').locator('xpath=..').locator('input').first();
    await amountInput.fill(String(Math.floor(betInfo.amount / 100)));
    await amountInput.dispatchEvent('change');

    // 馬番ボタンをクリック (単勝: select-list-tan-N / 複勝: select-list-fuku-N)
    // 実 IPAT HTML が変更された場合に備え、複数 selector でフォールバック探索する
    const button = await this.findUmabanButton(betInfo.betTypeNo, targetUmaban);
    if (!button) {
      // デバッグ補助: HTML をスクショ＋スニペットで残す
      await this.captureScreenshot('ipat-tanfuku-no-button');
      const snippet = await this.dumpRelevantDom(targetUmaban);
      throw new Error(
        `馬番ボタンが見つかりません (betTypeNo=${betInfo.betTypeNo}, umaban=${targetUmaban})\n` +
        `DOM hint: ${snippet}`
      );
    }

    this.log(`Clicking umaban button (umaban=${targetUmaban})`);
    await button.click();
    await page.waitForTimeout(150);

    // 「セット」ボタンをクリック
    await page.waitForTimeout(500);
    const setButton = page.locator('button[onclick*="vm.onSet("]:has-text("セット")');
    if (!(await setButton.isDisabled())) {
      const kaimeListRows = page.locator('[ng-repeat*="kaime"], .ipat-kaime-row, #select-list-kaime tbody tr');
      const rowsBefore = await kaimeListRows.count();
      this.log('Clicking セット button (rows before:', rowsBefore, ')');
      await setButton.click();
      this.currentKaimeNo++;
      await page.waitForTimeout(1500);
      const rowsAfter = await kaimeListRows.count();
      if (rowsAfter <= rowsBefore) {
        this.log('Warning: kaime list row count unchanged after set. May have failed.');
        await this.captureScreenshot('ipat-set-no-increment-tanfuku');
      }
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
    for (let i = 0; i < betInfo.kaime.length; i++) {
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

      const primaryId = `${idName}${umaban}`;
      let button = page.locator(`#${primaryId}`);

      if (!(await button.count())) {
        // ❶ ワイド(5): umaren- が見つからない場合 wide- 形式をフォールバック試行
        if (betInfo.betTypeNo === 5) {
          const wideId = `select-list-wide-${i + 1}-${umaban}`;
          const wideBtn = page.locator(`#${wideId}`);
          if (await wideBtn.count()) {
            this.log(`[ワイド fallback] using wide selector: ${wideId}`);
            button = wideBtn;
          } else {
            await this.captureScreenshot(`ipat-wide-btn-miss-${umaban}`);
            this.log(`Warning: ワイド selector not found for umaban ${umaban} (tried ${primaryId} and ${wideId})`);
            continue;
          }
        } else {
          this.log(`Warning: button #${primaryId} not found, skipping umaban ${umaban}`);
          continue;
        }
      }

      await button.click();
      await page.waitForTimeout(150); // ❻ AngularJS change detection 完了待ち (50ms→150ms)
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
      await this.captureScreenshot('ipat-confirm-btn-not-found');
      throw new Error('投票内容確認ボタンが見つかりません');
    }

    await confirmButton.click();
    await page.waitForLoadState('networkidle');

    // 暗証番号入力
    if (!this.credentials) {
      throw new Error('Credentials not set');
    }

    // ❺ 暗証番号 selector: 複数パターンでフォールトトレラントに
    // 実IPAT確認済みの name 属性が判明したら先頭に追加すること
    const pinInput = page.locator([
      'input[name="暗証番号"]',         // 日本語 name (旧版IPAT)
      'input[name="ansho"]',             // 英字 name 候補
      'input[name="pars_cd"]',           // ログインフォームと同じ可能性
      'input[name="PARS_CD"]',
      'input[ng-model*="pin"]',          // AngularJS バインディング
      'input[ng-model*="ansho"]',
      'input[ng-model*="pars"]',
      'input[type="password"]',          // 最終フォールバック: type=password
    ].join(', ')).first();
    if (await pinInput.count()) {
      await pinInput.fill(this.credentials.pin);
      this.log('PIN input filled');
    } else {
      this.log('Warning: PIN input not found — skipping (may cause vote failure)');
      await this.captureScreenshot('ipat-pin-not-found');
    }

    // 「この内容で投票」ボタンをクリック
    const voteButton = page.locator('button[ng-click*="vm.vote()"]');
    if (!(await voteButton.count())) {
      await this.captureScreenshot('ipat-vote-btn-not-found');
      throw new Error('投票実行ボタンが見つかりません');
    }

    this.log('Clicking vote button');
    await voteButton.click();
    await page.waitForLoadState('networkidle');

    // ❿ 投票完了確認（複数表現に対応）
    const bodyText = await page.locator('body').textContent();
    const completionTexts = ['投票が完了しました', '投票完了', '投票受付', '正常に処理しました'];
    if (!completionTexts.some((t) => bodyText?.includes(t))) {
      await this.captureScreenshot('ipat-vote-no-completion');
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
   * ヘルパー関数：馬番ボタンの ID 接頭辞を取得（連系馬券用）
   *
   * 検証状況 (2026-04-27):
   * - 単勝(1) / 複勝(2): inputKaimeTanFuku() 経由。この関数は使わない。
   * - 馬連(4): select-list-umaren-{1,2}- を使用。実機未確認。
   * - ワイド(5): 馬連と同 selector を第一候補とし、selectUmabans() 内で
   *   select-list-wide-{1,2}- へのフォールバックを実装。実機確認で更新すること。
   * - 馬単(6): select-list-umatan-{1,2}-。実機未確認。
   * - 3連複(7): select-list-sanrenpuku-{1,2,3}-。実機未確認。
   * - 3連単(8): select-list-sanrentan-{1,2,3}-。実機未確認。
   *
   * method (101=ながし / 201=BOX / 301=フォーメーション) による selector 違い:
   * - 現状は方式によらず同一 prefix を使用（フォーメーション基準）。
   * - BOX(201) は式別フォームの列構成が異なる可能性あり。実機確認後に分岐を追加すること。
   */
  private getIdNames(betTypeNo: number, method: number): string[] {
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
        names.push('select-list-umaren-1-', 'select-list-umaren-2-');
        break;
      case 5: // ワイド — 第一候補: umaren と同形式。フォールバックは selectUmabans() で処理
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

    // method が 201(BOX) の場合は将来的に selector を分岐する想定
    if (method === 201) {
      this.log(`[getIdNames] BOX(201) selector: currently using same prefix as フォーメーション. Verify on real IPAT.`);
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
