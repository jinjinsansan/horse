/**
 * SPAT4 自動投票クラス
 * 元のfrmSpat4.csのロジックを100%忠実に再現
 */

import { chromium, type Browser, type BrowserContext, type Page, type Frame, type Locator } from 'playwright';

export interface Spat4Credentials {
  memberNumber: string; // 加入者番号
  memberId: string; // 利用者ID
  password: string; // 暗証番号
}

export interface Spat4BetRequest {
  kaisaiDate: Date; // 開催日
  joName: string; // 競馬場名
  raceNo: number; // レース番号
  betType: string; // 馬券種類: '単勝', '複勝', '馬連', '馬単', 'ワイド', '３連複', '３連単', '枠連'
  kaime: number[]; // 買い目 [馬番1, 馬番2, 馬番3]
  amount: number; // 金額
}

export interface Spat4VoteResult {
  success: boolean;
  message: string;
  detail?: string;
  details?: string;
}

// 式別リスト（元のコードのlst_chg_toshiki_listから）
const LST_CHG_TOSHIKI_LIST = ['単勝複勝', '馬単', '三連単', '馬複', 'ワイド', '三連複', '枠複枠単'];

const LST_CHG_TOSHIKI_LIST_TEXT = [
  '単勝式・複勝式オッズ',
  '馬番連勝単式オッズ',
  '三連勝単式オッズ',
  '馬番連勝複式オッズ',
  'ワイドオッズ',
  '三連勝複式オッズ',
  '枠番連勝複式オッズ',
];

// 式別コード（元のコードから）
function getShikiCode(betType: string): string {
  switch (betType) {
    case '枠連':
      return '3';
    case '馬連':
      return '5';
    case '馬単':
      return '6';
    case 'ワイド':
      return '7';
    case '３連複':
      return '8';
    case '３連単':
      return '9';
    default:
      return '';
  }
}

// ステート定義（元のコードのiinLoginに相当）
// 将来のデバッグ用に保留
// const VoteState = {
//   LOGIN_INITIAL: 0,
//   LOGIN_COMPLETED: 1,
//   VOTE_CONFIRM: 2,
//   COMPLETED: 3,
// } as const;
// type VoteState = typeof VoteState[keyof typeof VoteState];

type Spat4VoterOptions = {
  profileDir?: string;
  /** スクリーンショット保存先ディレクトリ（指定時のみ vote 失敗時に保存） */
  screenshotDir?: string;
};

export class Spat4Voter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly options: Spat4VoterOptions;

  // ステート管理（将来のデバッグ用）
  // private voteState: VoteState = VoteState.LOGIN_INITIAL;

  // 買い目管理
  private betInfoList: Spat4BetRequest[] = [];
  private currentKaimeIdx = 0;

  // 馬番クリック管理
  private umabanClickFlag = 0;
  private clickedAnchorTexts: string[] = [];

  // 式別変更管理
  private toshikiIdx = 0;
  private toshikiChangeFlag = false;

  // 取消馬番
  private canceledUmabans: number[] | null = null;

  // 認証情報
  private credentials: Spat4Credentials | null = null;

  constructor(options: Spat4VoterOptions = {}) {
    this.options = options;
  }

  private log(...args: unknown[]) {
    console.log('[Spat4Voter]', ...args);
  }

  /**
   * 「利用者IDが初期設定」お知らせページが表示されている場合に「投票へすすむ」をクリックして通過する。
   * ログイン直後と handleP001SPage 冒頭の両方から呼ばれる。
   */
  private async dismissInitialNoticeIfPresent(maxIterations: number = 3): Promise<void> {
    const page = this.ensurePage();

    // 複数の通知ページが連続表示される可能性があるためループで処理
    for (let iter = 0; iter < maxIterations; iter++) {
      // 各 frame の load 完了を待ってから探索 (textContent が空で返ってくる対策)
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForTimeout(800); // frame content fully render 待ち

      // メインフレームと全サブフレームを対象に各種通知を探す
      const framesToCheck = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
      let noticeFound = false;

      for (const frame of framesToCheck) {
        // body.textContent() は frame load タイミングで空が返るバグあり
        // → frame.content() で HTML 全体を取得して検出
        const html = await frame.content().catch(() => '');
        const bodyText = html.length > 0 ? html : await frame.locator('body').textContent({ timeout: 3000 }).catch(() => '') || '';

        // 通知ページの判定キーワード — 「投票へすすむ」または特定通知文言
        const isNoticePage =
          bodyText.includes('利用者IDが初期設定') ||
          bodyText.includes('メールアドレスの認証システム') ||
          bodyText.includes('メールアドレス登録のお願い') ||
          bodyText.includes('重要なお知らせ');

        // 「投票へすすむ」だけだと race_name 等を含む正常 P001S が誤判定される。
        // 通知特有の文言が無く、かつ既に出走表 table が見えていれば notice ではない。
        const hasShussohyoTable = await frame.locator('table[summary="出走表"]').count() > 0;
        if (!isNoticePage && (!bodyText.includes('投票へすすむ') || hasShussohyoTable)) {
          continue;
        }
        noticeFound = true;
        this.log(`[dismissNotice iter=${iter}] Notice detected in frame:`, frame.url(), '— matched:', {
          shoki: bodyText?.includes('利用者IDが初期設定'),
          email: bodyText?.includes('メールアドレスの認証システム'),
          touhyou: bodyText?.includes('投票へすすむ'),
        });

        // 「次回からこのお知らせを表示しない」チェックボックスがあればチェック
        // (毎回出るのを止めるため、idempotent に check_or_skip)
        const skipCheckboxes = await frame.locator('input[type="checkbox"]').all();
        for (const cb of skipCheckboxes) {
          try {
            const isChecked = await cb.isChecked().catch(() => true);
            if (!isChecked) {
              await cb.check({ timeout: 2000 });
              this.log('[dismissNotice] Checked "次回から表示しない"');
            }
          } catch { /* skip */ }
        }

        // <button>, <input type="button">, <input type="submit">, <a> を全て探索
        const candidates = await frame.locator('button, input[type="button"], input[type="submit"], a').all();
        const infos = await Promise.all(candidates.map(async (el) => ({
          el,
          txt: (await el.textContent().catch(() => '') ?? '').trim(),
          val: (await el.getAttribute('value').catch(() => '') ?? '').trim(),
        })));
        this.log(`[dismissNotice iter=${iter}] Clickable:`,
          infos.map((i) => i.txt || i.val).filter(Boolean).slice(0, 20));

        // 「投票へすすむ」を最優先、次に「投票」、最後に「OK」「すすむ」「次へ」
        let target: typeof infos[0] | null = null;
        for (const item of infos) {
          if (item.txt === '投票へすすむ' || item.val === '投票へすすむ') { target = item; break; }
        }
        if (!target) {
          for (const item of infos) {
            if (item.txt.includes('投票へすすむ') || item.val.includes('投票へすすむ')) { target = item; break; }
          }
        }
        if (!target) {
          for (const item of infos) {
            if (item.txt.includes('投票') || item.val.includes('投票')) { target = item; break; }
          }
        }

        if (!target) {
          this.log('[dismissNotice] Warning: no proceed button found');
          await this.captureScreenshot('spat4-notice-no-proceed-btn');
          break; // この frame では無理 — 次の iter で再試行
        }

        const urlBefore = page.url();
        this.log('[dismissNotice] Clicking:', target.txt || target.val, '— urlBefore:', urlBefore);
        await target.el.click({ timeout: 5000 });

        // URL 変化 or P001S コンテンツ表示を待機
        await Promise.race([
          page.waitForFunction(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((before: string) => (globalThis as any).location.href !== before) as any,
            urlBefore,
            { timeout: 8000 }
          ),
          page.locator('span.race_name, table[summary="出走表"]').waitFor({ state: 'visible', timeout: 8000 }),
        ]).catch(() => {
          this.log('[dismissNotice] No URL change or race content after click');
        });

        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(1000);
        break; // この iter でクリック完了 → 次 iter で残りの通知をチェック
      }

      if (!noticeFound) {
        if (iter === 0) this.log('[dismissNotice] No notice page detected');
        return; // 通知が無くなったので終了
      }
    }
    this.log('[dismissNotice] maxIterations reached');
  }

  /**
   * ブラウザ初期化
   */
  async initialize(headless = false): Promise<void> {
    this.log('Launching browser', { headless, profileDir: this.options.profileDir ?? 'memory' });
    
    const launchCommon = {
      headless,
      slowMo: headless ? 0 : 80,
    } as const;

    if (this.options.profileDir) {
      this.context = await chromium.launchPersistentContext(this.options.profileDir, {
        ...launchCommon,
        viewport: { width: 1280, height: 900 },
      });
      const existingPages = this.context.pages();
      this.page = existingPages[0] ?? (await this.context.newPage());
    } else {
      this.browser = await chromium.launch(launchCommon);
      this.page = await this.browser.newPage();
      await this.page.setViewportSize({ width: 1280, height: 900 });
    }
  }

  /**
   * ログイン処理（元のコードのiinLogin==0の処理）
   */
  async login(credentials: Spat4Credentials): Promise<void> {
    const page = this.ensurePage();
    this.credentials = credentials;
    
    this.log('Opening login page');
    await page.goto('https://www.spat4.jp/keiba/pc', { waitUntil: 'networkidle' });
    
    // かんたんログインのチェックを外す
    try {
      const bsliCheckbox = await page.locator('[name="BSLI"]').first();
      const outerHtml = await bsliCheckbox.evaluate((el) => el.outerHTML);
      if (outerHtml.includes('checked')) {
        this.log('Unchecking BSLI (かんたんログイン)');
        await bsliCheckbox.evaluate((el) => {
          el.removeAttribute('checked');
        });
        await bsliCheckbox.click();
      }
    } catch (e) {
      this.log('BSLI checkbox not found or already unchecked');
    }

    // 認証情報を入力
    this.log('Filling credentials');
    await page.locator('[name="MEMBERNUMR"]').fill(credentials.memberNumber);
    await page.locator('[name="MEMBERIDR"]').fill(credentials.memberId);
    
    await page.waitForTimeout(1000);
    
    // フォーム送信（元のコードのWebBrowser1.Document.Forms["LOGIN"].InvokeMember("submit")）
    this.log('Submitting login form');
    const loginForm = page.locator('form[name="LOGIN"]');
    await loginForm.evaluate((form: any) => {
      form.submit();
    });
    
    // ログイン後の遷移を待つ
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // 「利用者IDが初期設定」お知らせを自動突破
    await this.dismissInitialNoticeIfPresent();

    // 現在 URL を記録（デバッグ用）
    this.log('[login] URL after login flow:', page.url());

    // P001S でなければ直接移動
    if (!page.url().includes('P001S')) {
      this.log('[login] Not on P001S, navigating directly');
      await page.goto('https://www.spat4.jp/keiba/pc?HANDLERR=P001S', { waitUntil: 'networkidle' });
      await this.dismissInitialNoticeIfPresent();
    }

    // this.voteState = VoteState.LOGIN_COMPLETED;
    this.log('Login successful');
  }

  /**
   * 投票実行（元のコードのWebBrowser1_DocumentCompletedとodds_betを統合）
   */
  async vote(betRequests: Spat4BetRequest[]): Promise<Spat4VoteResult> {
    this.ensurePage();
    
    try {
      this.betInfoList = betRequests;
      this.currentKaimeIdx = 0;
      this.log(`Starting vote with ${betRequests.length} bet requests`);
      
      // ログイン後の画面確認（P001S）
      await this.handleP001SPage();
      
      // オッズ画面で買い目設定（P120S）
      await this.handleP120SOddsPage();
      
      // 投票確認・実行
      await this.handleVoteConfirmPage();
      
      return {
        success: true,
        message: 'SPAT4投票は正常終了しました',
      };
    } catch (error) {
      const detailMessage = error instanceof Error ? error.message : `${error}`;
      this.log('Vote error:', detailMessage);
      const screenshotPath = await this.captureScreenshot('spat4-error');
      const detail = screenshotPath ? `${detailMessage} (screenshot: ${screenshotPath})` : detailMessage;
      return {
        success: false,
        message: 'SPAT4投票処理でエラーが発生しました',
        detail,
        details: detail,
      };
    }
  }

  /**
   * スクリーンショット保存（option.screenshotDir が指定されている場合のみ）
   */
  private async captureScreenshot(prefix: string): Promise<string | null> {
    if (!this.options.screenshotDir || !this.page) return null;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${prefix}-${ts}.png`;
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
   * P001S画面の処理（ログイン後のトップページ）
   */
  private async handleP001SPage(): Promise<void> {
    const page = this.ensurePage();
    
    this.log('Handling P001S page');

    // 安全ネット: ここでもお知らせページをチェック（login()側で突破できなかった場合の保険）
    await this.dismissInitialNoticeIfPresent();

    // 日付確認 (情報取得のみ。失敗しても続行)
    const dateText = await page.locator('span.date').first().textContent({ timeout: 5000 }).catch(() => null);
    this.log('Date on page:', dateText);
    
    if (dateText) {
      const dateMatch = dateText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (dateMatch) {
        const pageDate = new Date(
          parseInt(dateMatch[1], 10),
          parseInt(dateMatch[2], 10) - 1,
          parseInt(dateMatch[3], 10),
        );
        const targetDate = new Date(this.betInfoList[0].kaisaiDate);
        this.log('Parsed dates:', {
          page: pageDate.toISOString().split('T')[0],
          target: targetDate.toISOString().split('T')[0],
        });
        if (pageDate.toDateString() !== targetDate.toDateString()) {
          this.log('Date mismatch, but continuing');
        }
      }
    } else {
      this.log('span.date not found — skipping date check');
    }
    
    // 競馬場確認 (失敗しても続行)
    const raceNameText = await page.locator('span.race_name').first().textContent({ timeout: 5000 }).catch(() => null);
    this.log('Race name on page:', raceNameText?.trim());
    
    const targetJoName = this.betInfoList[0].joName;
    
    if (!raceNameText?.includes(targetJoName)) {
      // 競馬場を切り替え
      this.log('Switching jo to:', targetJoName);

      // SPAT4 はフレームベース構造。main page と全 frame を探索する。
      // 帯広(ばんえい) など別表記の可能性も考慮 (帯広/帯広ば/ばんえい)。
      const joNameVariants: string[] = [targetJoName];
      if (targetJoName === '帯広') {
        joNameVariants.push('帯広ば', 'ばんえい');
      }

      // デバッグ: ページ + 全 frame のリンクテキストを出力
      try {
        const allLinks = await page.locator('a').all();
        const linkTexts = (await Promise.all(allLinks.map((l) => l.textContent().catch(() => '')))).filter((t) => t);
        this.log('Main page links:', linkTexts.slice(0, 30));
        for (const frame of page.frames()) {
          if (frame === page.mainFrame()) continue;
          const fLinks = await frame.locator('a').all();
          const fTexts = (await Promise.all(fLinks.map((l) => l.textContent().catch(() => '')))).filter((t) => t);
          if (fTexts.length) this.log(`Frame ${frame.url().slice(-30)} links:`, fTexts.slice(0, 20));
        }
      } catch { /* デバッグ用、失敗は無視 */ }

      // jo リンク探索: メインpage → 全frame、複数 variant + 拡張 variant + img alt + onclick
      // 「帯広」 / 「帯広競馬」 / 「ばんえい」 / 「帯広ば」 等のテキストパターンを総当たり
      const extendedVariants: string[] = [];
      for (const v of joNameVariants) {
        extendedVariants.push(v);
        if (v === '帯広') extendedVariants.push('帯広競馬');
        else extendedVariants.push(v + '競馬');
      }

      const trySelectors = (variant: string): string[] => [
        `a:has-text("${variant}")`,
        `a img[alt*="${variant}"]`,           // img alt にマッチ
        `a:has(img[alt*="${variant}"])`,       // a を親に持つ img alt
        `[onclick*="${variant}"]`,              // onclick 属性
        `button:has-text("${variant}")`,
        `area[alt*="${variant}"]`,              // image map area
      ];

      let joLink: Locator | null = null;
      const allFrames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];

      outer: for (const variant of extendedVariants) {
        for (const sel of trySelectors(variant)) {
          for (const frame of allFrames) {
            try {
              const loc = frame.locator(sel).first();
              if (await loc.count()) {
                this.log(`[jo-link] Found via selector: ${sel} (variant: ${variant}, frame: ${frame.url().slice(-30)})`);
                joLink = loc;
                break outer;
              }
            } catch { /* 構文エラー等は次へ */ }
          }
        }
      }

      // それでも無ければ、main page の全 a要素を取得して text 含有チェック
      if (!joLink) {
        const allAnchors = await page.locator('a').all();
        for (const a of allAnchors) {
          const txt = (await a.textContent().catch(() => '') ?? '').trim();
          const innerHtml = await a.innerHTML().catch(() => '');
          for (const v of extendedVariants) {
            if (txt.includes(v) || innerHtml.includes(v)) {
              this.log(`[jo-link] Found via brute-force scan: txt="${txt.slice(0, 30)}" matched "${v}"`);
              joLink = a;
              break;
            }
          }
          if (joLink) break;
        }
      }

      if (!joLink) {
        await this.captureScreenshot('spat4-jo-link-not-found');
        throw new Error(
          `競馬場「${targetJoName}」のリンクがP001Sページに見つかりません ` +
          `(variants tried: ${joNameVariants.join(', ')}, frames: ${page.frames().length})`
        );
      }
      await joLink.click({ timeout: 10000 });
      await page.waitForLoadState('networkidle');
      // 再帰的に再確認
      return this.handleP001SPage();
    }
    
    // 「オッズ投票」リンクを探す
    this.log('Finding オッズ投票 link for race', this.betInfoList[0].raceNo);
    const shussohyoTable = page.locator('table[summary="出走表"]');
    
    if (!(await shussohyoTable.count())) {
      this.log('出走表 table not found on page');
      const bodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => '');
      this.log('Page body preview:', bodyText?.substring(0, 500));
      throw new Error('出走表が見つかりません。本日の開催がない可能性があります。');
    }
    
    const targetRaceNo = this.betInfoList[0].raceNo;
    let foundRaceRow = false;
    
    const rows = await shussohyoTable.locator('tr').all();
    this.log(`Found ${rows.length} rows in 出走表 table`);
    
    for (const row of rows) {
      const links = await row.locator('a').all();
      
      for (let i = 0; i < links.length; i++) {
        const linkText = await links[i].textContent();
        
        if (linkText?.trim() === `${targetRaceNo}R`) {
          foundRaceRow = true;
          this.log(`Found race ${targetRaceNo}R`);
          
          // デバッグ：この行の全リンクテキストを出力
          const allLinksInRow = await Promise.all(
            links.map(async (link) => await link.textContent())
          );
          this.log(`All links in race ${targetRaceNo}R row:`, allLinksInRow);
        } else if (foundRaceRow && linkText?.trim() === 'オッズ投票') {
          this.log('Clicking オッズ投票 link');
          this.currentKaimeIdx = 1; // 元のコードのiin_kaime_idx = 1
          await page.waitForTimeout(1000);
          await links[i].click({ timeout: 10000 });
          await page.waitForLoadState('networkidle');
          return;
        }
      }
    }
    
    if (!foundRaceRow) {
      throw new Error(`レース${targetRaceNo}Rが見つかりません。投票時間外の可能性があります。`);
    }
    
    throw new Error('オッズ投票リンクが見つかりません。投票時間外です。');
  }

  /**
   * P120S画面の処理（オッズ画面フレームセット）
   */
  private async handleP120SOddsPage(): Promise<void> {
    const page = this.ensurePage();
    
    this.log('Handling P120S odds page');
    
    // フレームセットの読み込みを待つ (networkidle だけでは不十分な場合がある)
    await page.waitForTimeout(1500);
    
    // 取消馬番を取得（初回のみ）
    if (this.canceledUmabans === null) {
      this.canceledUmabans = await this.getCanceledUmabans();
      this.removeCanceledKaime();
    }
    
    // すべての買い目を設定するまでループ
    while (this.currentKaimeIdx <= this.betInfoList.length) {
      if (this.currentKaimeIdx > this.betInfoList.length) {
        this.log('All kaime set, moving to confirm');
        break;
      }
      
      // 式別変更フラグがある場合は待つ
      if (this.toshikiChangeFlag) {
        this.toshikiChangeFlag = false;
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
      
      // 馬番クリックフラグがある場合はP121S処理
      if (this.umabanClickFlag === 1) {
        await this.handleP121SAmountInput();
        continue;
      }
      
      // オッズ画面で馬番をクリック
      const result = await this.oddsBet();
      
      if (result === -1) {
        throw new Error('馬番が選択できません');
      }
      
      if (result === 1) {
        // 式別変更が発生した
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        continue;
      }
      
      // result === 0 の場合、馬番クリック成功
      await page.waitForTimeout(2000);
    }
  }

  /**
   * odds_bet() - オッズ画面で馬番をクリック（元のコードを忠実に再現）
   */
  private async oddsBet(): Promise<number> {
    const page = this.ensurePage();
    
    const frames = page.frames();
    this.log(`Checking ${frames.length} frames for P122S`);
    
    for (const frame of frames) {
      const frameUrl = frame.url();
      
      // P122Sフレームまたは式別テキストを含むフレームを探す
      const bodyText = await frame.locator('body').textContent({ timeout: 5000 }).catch(() => '');
      
      if (
        !frameUrl.includes('HANDLERR=P122S') &&
        (!bodyText || !bodyText.includes(LST_CHG_TOSHIKI_LIST_TEXT[this.toshikiIdx]))
      ) {
        continue;
      }
      
      this.log('Found P122S frame:', frameUrl);
      
      // オッズテーブルを取得
      const oddsTable = frame.locator('table.tbl_01.tbl_01_odds');
      
      if (!(await oddsTable.count())) {
        this.log('Odds table not found');
        break;
      }
      
      const currentBetInfo = this.betInfoList[this.currentKaimeIdx - 1];
      
      // 単勝・複勝の場合
      if (currentBetInfo.betType === '単勝' || currentBetInfo.betType === '複勝') {
        return await this.oddsBetTanshoFukusho(frame, oddsTable, currentBetInfo);
      } else {
        // その他の馬券種類
        return await this.oddsBetOthers(frame, oddsTable);
      }
    }
    
    return -1;
  }

  /**
   * 単勝・複勝のオッズ処理
   */
  private async oddsBetTanshoFukusho(
    _frame: Frame,
    oddsTable: Locator,
    betInfo: Spat4BetRequest
  ): Promise<number> {
    const targetUmaban = betInfo.kaime[0];
    this.log(`Looking for umaban ${targetUmaban} in tansho/fukusho table`);
    
    const rows = await oddsTable.locator('tr').all();
    
    for (const row of rows) {
      const cells = await row.locator('td').all();
      
      let foundUmaban = false;
      let targetColumn = 0;
      
      for (const cell of cells) {
        const cellHtml = await cell.evaluate((el) => el.outerHTML);
        if (cellHtml.includes('waku')) continue;
        
        const cellText = await cell.textContent();
        if (cellText && !cellText.includes('.') && !isNaN(Number(cellText))) {
          if (Number(cellText) === targetUmaban) {
            const rowHtml = await row.evaluate((el) => el.innerHTML);
            if (rowHtml.includes('clickOddsBet')) {
              foundUmaban = true;
              targetColumn = betInfo.betType === '単勝' ? 1 : 2;
              break;
            }
          }
        }
      }
      
      if (foundUmaban) {
        const links = await row.locator('a').all();
        let linkCount = 0;
        
        for (const link of links) {
          const linkHtml = await link.evaluate((el) => el.outerHTML);
          if (linkHtml.includes('clickOddsBet')) {
            linkCount++;
            if (linkCount === targetColumn) {
              const anchorValue = this.extractClickOddsBetParam(linkHtml);
              this.clickedAnchorTexts.push(anchorValue);
              
              this.log(`Clicking umaban ${targetUmaban} (${betInfo.betType})`);
              this.umabanClickFlag = 1;
              await link.click();
              await this.page!.waitForTimeout(1000);
              return 0;
            }
          }
        }
      }
    }
    
    return -1;
  }

  /**
   * その他の馬券種類のオッズ処理
   */
  private async oddsBetOthers(frame: Frame, oddsTable: Locator): Promise<number> {
    const links = await oddsTable.locator('a').all();
    
    for (const link of links) {
      const linkHtml = await link.evaluate((el) => el.outerHTML);
      
      if (linkHtml.includes('clickOddsBet')) {
        const anchorValue = this.extractClickOddsBetParam(linkHtml);
        
        if (!this.clickedAnchorTexts.includes(anchorValue)) {
          this.clickedAnchorTexts.push(anchorValue);
          
          this.log('Clicking odds link:', anchorValue);
          this.umabanClickFlag = 1;
          await link.click();
          await this.page!.waitForTimeout(1000);
          return 0;
        }
      }
    }
    
    // すべてクリック済み → 式別を変更
    this.log('All links clicked, changing toshiki');
    this.toshikiIdx++;
    
    if (this.toshikiIdx >= LST_CHG_TOSHIKI_LIST.length) {
      throw new Error('買い目点数が多すぎます');
    }
    
    const shikiSelect = frame.locator('[name="SHIKILINK"]');
    const options = await shikiSelect.locator('option').all();
    
    for (const option of options) {
      const optionText = await option.textContent();
      if (optionText?.trim() === LST_CHG_TOSHIKI_LIST[this.toshikiIdx]) {
        this.log('Changing toshiki to:', LST_CHG_TOSHIKI_LIST[this.toshikiIdx]);
        await option.evaluate((el: any) => {
          el.selected = true;
        });
        await shikiSelect.dispatchEvent('change');
        this.toshikiChangeFlag = true;
        return 1;
      }
    }
    
    return -1;
  }

  /**
   * P121S画面の処理（金額入力）
   */
  private async handleP121SAmountInput(): Promise<void> {
    const page = this.ensurePage();
    this.umabanClickFlag = 0;
    
    this.log('Handling P121S amount input');
    
    const frames = page.frames();
    
    for (const frame of frames) {
      const frameUrl = frame.url();
      
      if (!frameUrl.includes('HANDLERR=P121S')) {
        continue;
      }
      
      this.log('Found P121S frame');
      
      const inputs = await frame.locator('input').all();
      let inputCount = 0;
      
      for (const input of inputs) {
        const className = await input.getAttribute('class');
        
        if (className === 'TEXTMONEY al-right') {
          inputCount++;
          
          if (inputCount === this.currentKaimeIdx) {
            const currentBetInfo = this.betInfoList[this.currentKaimeIdx - 1];
            
            // 金額を設定
            const amount = Math.floor(currentBetInfo.amount / 100);
            await input.fill(amount.toString());
            this.log(`Set amount: ${amount}`);
            
            // 式別コードを取得
            const shikiCode = getShikiCode(currentBetInfo.betType);
            
            // 親要素から式別・馬組入力欄を探す
            const parent = input.locator('xpath=../..'); // 2階層上
            const parentInputs = await parent.locator('input').all();
            
            for (const pInput of parentInputs) {
              const pClassName = await pInput.getAttribute('class');
              
              if (pClassName === 'SHIKI') {
                await pInput.evaluate((el, code) => {
                  el.setAttribute('value', code);
                }, shikiCode);
                this.log(`Set shiki code: ${shikiCode}`);
              }
              
              if (pClassName === 'UMAKUMISTR') {
                // 馬組を16進数文字列に変換
                const kaime = currentBetInfo.kaime;
                const umakumiStr =
                  (kaime[0] || 0).toString(16).padStart(4, '0').toUpperCase() +
                  (kaime[1] || 0).toString(16).padStart(4, '0').toUpperCase() +
                  (kaime[2] || 0).toString(16).padStart(4, '0').toUpperCase();
                
                await pInput.evaluate((el, str) => {
                  el.setAttribute('value', str);
                }, umakumiStr);
                this.log(`Set umakumi: ${umakumiStr}`);
              }
            }
            
            this.currentKaimeIdx++;
            
            if (this.currentKaimeIdx > this.betInfoList.length) {
              // すべての買い目設定完了 → 投票確認へ
              this.log('All kaime input completed, moving to confirm');

              // 現在のフレーム状態をログ
              this.log('Current frame URL:', frame.url());

              // ★ 合計金額ボタンを先にクリック (合計を計算させる、必須ステップ)
              const goukeiBtn = frame.locator('input[value="合計金額"], input[value*="合計"], button:has-text("合計金額")').first();
              if (await goukeiBtn.count()) {
                this.log('Clicking 合計金額 button first (compute total)');
                try {
                  await goukeiBtn.click({ timeout: 3000, force: true });
                  await page.waitForTimeout(800);
                } catch (e) {
                  this.log('合計金額 click failed (non-fatal):', e);
                }
              } else {
                this.log('合計金額 button not found (skipping)');
              }

              // 投票内容確認へボタン: 複数 selector で探索
              const confirmSelectors = [
                'input[value="投票内容確認へ"]',
                'input[value*="投票内容確認"]',
                'button:has-text("投票内容確認へ")',
                'a:has-text("投票内容確認へ")',
                'input[type="button"][value*="確認"]',
                'input[type="submit"][value*="確認"]',
              ];
              let confirmBtn = null;
              for (const sel of confirmSelectors) {
                const loc = frame.locator(sel).first();
                if (await loc.count()) {
                  this.log(`Found 投票内容確認へ via: ${sel}`);
                  confirmBtn = loc;
                  break;
                }
              }

              if (!confirmBtn) {
                this.log('投票内容確認へ button not found, checking page content');
                const bodyText = await frame.locator('body').textContent({ timeout: 5000 }).catch(() => '');
                this.log('Frame body preview:', bodyText?.substring(0, 300));
                throw new Error('投票内容確認へ button not found');
              }

              await page.waitForTimeout(800);
              this.log('Clicking 投票内容確認へ button (3-stage fallback)');

              // 3段階フォールバック click
              const urlBefore = page.url();
              let clickedOk = false;
              try {
                await confirmBtn.click({ timeout: 5000 });
                clickedOk = true;
                this.log('Stage 1: locator.click() succeeded');
              } catch (e) {
                this.log('Stage 1 click failed:', e);
              }
              if (!clickedOk) {
                try {
                  await confirmBtn.click({ force: true, timeout: 5000 });
                  clickedOk = true;
                  this.log('Stage 2: force click succeeded');
                } catch (e) {
                  this.log('Stage 2 force click failed:', e);
                }
              }
              if (!clickedOk) {
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await confirmBtn.evaluate((el: any) => { el.click(); });
                  clickedOk = true;
                  this.log('Stage 3: evaluate click succeeded');
                } catch (e) {
                  this.log('Stage 3 evaluate click failed:', e);
                }
              }

              // クリック後の状態待機 (frame 増減 or URL 変化)
              await page.waitForTimeout(2000);
              await page.waitForLoadState('networkidle').catch(() => {});
              const allFrameUrls = page.frames().map(f => f.url());
              this.log('After clicking confirm, frame URLs:', allFrameUrls);
              this.log('URL changed?', page.url() !== urlBefore, 'before:', urlBefore.slice(-40), 'after:', page.url().slice(-40));

              // P202S frame がまだ無く、しかし dialog などが出ている可能性をチェック
              const alertText = await page.evaluate(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const w = globalThis as any;
                return w.__lastAlert || '';
              }).catch(() => '');
              if (alertText) this.log('Last alert text:', alertText);

              return;
            }
            
            // 次の買い目を設定
            this.log(`Moving to next kaime: ${this.currentKaimeIdx}`);
            return;
          }
        }
      }
      
      break;
    }
  }

  /**
   * 投票確認・実行画面の処理（P202S → P203S）
   */
  private async handleVoteConfirmPage(): Promise<void> {
    const page = this.ensurePage();
    
    this.log('Handling vote confirm page (P202S)');
    
    if (!this.credentials) {
      throw new Error('認証情報がありません');
    }
    
    // P202Sフレームを探す（投票内容確認画面）
    // フレームが表示されるまで最大10秒待つ
    let p202Frame: Frame | null = null;
    const maxAttempts = 20; // 10秒間（500ms x 20回）
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await page.waitForTimeout(500);
      
      const frames = page.frames();
      this.log(`Attempt ${attempt + 1}/${maxAttempts}: Checking ${frames.length} frames`);
      
      for (const frame of frames) {
        const url = frame.url();
        if (url.includes('HANDLERR=P202S')) {
          p202Frame = frame;
          this.log('Found P202S frame:', url);
          break;
        }
      }
      
      if (p202Frame) {
        break;
      }
    }
    
    if (!p202Frame) {
      // デバッグ用：すべてのフレームのURLを出力
      const allFrameUrls = page.frames().map(f => f.url());
      this.log('All frame URLs:', allFrameUrls);
      
      // P902SまたはP901フレームがあればその内容を確認（エラーメッセージの可能性）
      for (const frame of page.frames()) {
        const url = frame.url();
        if (url.includes('P902S') || url.includes('P901')) {
          this.log(`Checking ${url.includes('P902S') ? 'P902S' : 'P901'} frame content:`);
          const content = await frame.locator('body').textContent({ timeout: 5000 }).catch(() => '');
          this.log('Frame content:', content?.substring(0, 500));
        }
      }
      
      // P121Sフレームの内容も確認（まだ残っている場合）
      for (const frame of page.frames()) {
        const url = frame.url();
        if (url.includes('P121S')) {
          this.log('P121S frame still exists, checking content:');
          const content = await frame.locator('body').innerHTML();
          this.log('P121S HTML preview:', content?.substring(0, 800));
        }
      }
      
      throw new Error('P202S frame not found after 10 seconds - check P902S/P901 for errors');
    }
    
    // 暗証番号入力
    this.log('Filling password in P202S');
    const passwordInput = p202Frame.locator('input[name="MEMBERPASSR"]');
    await passwordInput.fill(this.credentials.password);
    
    // 合計金額を取得して設定
    const betTable = p202Frame.locator('table#BET_TBL');
    
    if (await betTable.count()) {
      const rows = await betTable.locator('tr').all();
      
      for (const row of rows) {
        const cells = await row.locator('td').all();
        let foundLabel = false;
        
        for (const cell of cells) {
          const cellText = await cell.textContent();
          
          if (cellText?.trim() === '合計金額') {
            foundLabel = true;
          } else if (foundLabel && cellText?.includes('円')) {
            const totalAmount = cellText.trim().replace('円', '').replace(',', '');
            const totalMoneyInput = p202Frame.locator('input[name="TOTALMONEYR"]');
            await totalMoneyInput.fill(totalAmount);
            this.log(`Set total amount: ${totalAmount}`);
            break;
          }
        }
      }
    }
    
    // 投票実行ボタンをクリック
    this.log('Clicking vote execution button');
    const executeBtn = p202Frame.locator('input[name="KYOUSEI"]');
    await executeBtn.click();
    
    // P203S（完了画面）を待つ
    await page.waitForTimeout(3000);
    
    let p203Frame: Frame | null = null;
    const newFrames = page.frames();
    
    for (const frame of newFrames) {
      const url = frame.url();
      if (url.includes('HANDLERR=P203S')) {
        p203Frame = frame;
        this.log('Found P203S frame (completion):', url);
        break;
      }
    }
    
    if (!p203Frame) {
      this.log('Warning: P203S frame not found, checking for errors');
    }
    
    // エラーチェック
    const frameContent = p203Frame 
      ? await p203Frame.locator('body').textContent({ timeout: 5000 }).catch(() => '') 
      : await p202Frame.locator('body').textContent({ timeout: 5000 }).catch(() => '');
    
    if (frameContent?.includes('購入限度額を超えています')) {
      throw new Error('購入限度額を超えています');
    }
    
    if (frameContent?.includes('エラー') || frameContent?.includes('失敗')) {
      throw new Error('投票に失敗しました: ' + frameContent.substring(0, 200));
    }
    
    this.log('Vote completed successfully');
  }

  /**
   * 取消馬番の取得
   * オッズ表に表示されていない馬番を取消馬として返す
   */
  private async getCanceledUmabans(): Promise<number[]> {
    const page = this.ensurePage();
    const validUmabans: number[] = []; // オッズ表に表示されている有効な馬番
    
    this.log('Getting canceled umabans');
    
    const frames = page.frames();
    
    for (const _frame of frames) {
      const frame = _frame;
      const frameUrl = frame.url();
      
      if (!frameUrl.includes('HANDLERR=P122S')) {
        continue;
      }
      
      const oddsTable = frame.locator('table.tbl_01.tbl_01_odds');
      
      if (!(await oddsTable.count())) {
        continue;
      }
      
      const bodyText = await frame.locator('body').textContent({ timeout: 5000 }).catch(() => '');
      if (!bodyText?.includes('単勝式・複勝式オッズ')) {
        continue;
      }
      
      const rows = await oddsTable.locator('tr').all();
      
      for (const row of rows) {
        const rowHtml = await row.evaluate((el) => el.innerHTML);
        
        if (!rowHtml.includes('clickOddsBet')) {
          continue;
        }
        
        const cells = await row.locator('td').all();
        
        for (const cell of cells) {
          const cellHtml = await cell.evaluate((el) => el.outerHTML);
          const cellText = await cell.textContent();
          
          if (cellHtml.includes('waku')) continue;
          
          if (cellText && !isNaN(Number(cellText))) {
            const umaban = Number(cellText);
            if (!validUmabans.includes(umaban)) {
              validUmabans.push(umaban);
            }
            break;
          }
        }
      }
      
      break;
    }
    
    // 全馬番（1-18）から有効な馬番を除外 = 取消馬番
    const allUmabans = Array.from({ length: 18 }, (_, i) => i + 1);
    const canceledUmabans = allUmabans.filter((u) => !validUmabans.includes(u));
    
    this.log('Valid umabans:', validUmabans);
    this.log('Canceled umabans:', canceledUmabans);
    return canceledUmabans;
  }

  /**
   * 取消馬番を含む買い目を削除
   */
  private removeCanceledKaime(): void {
    if (!this.canceledUmabans || this.canceledUmabans.length === 0) {
      return;
    }
    
    const originalLength = this.betInfoList.length;
    
    this.betInfoList = this.betInfoList.filter((betInfo) => {
      // 枠連以外で取消馬番を含む場合は除外
      if (betInfo.betType !== '枠連') {
        for (const umaban of betInfo.kaime) {
          if (this.canceledUmabans!.includes(umaban)) {
            return false;
          }
        }
      }
      
      // 金額が100円未満の場合も除外
      if (betInfo.amount < 100) {
        return false;
      }
      
      return true;
    });
    
    this.log(`Removed canceled kaime: ${originalLength} -> ${this.betInfoList.length}`);
  }

  /**
   * clickOddsBetのパラメータを抽出
   */
  private extractClickOddsBetParam(html: string): string {
    const match = html.match(/clickOddsBet\((.*?)\)/);
    return match ? match[1] : '';
  }

  /**
   * ページオブジェクトの取得（nullチェック）
   */
  private ensurePage(): Page {
    if (!this.page) {
      throw new Error('Playwright page not initialized');
    }
    return this.page;
  }

  /**
   * ブラウザを閉じる
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.page = null;
    this.log('Browser closed');
  }
}
