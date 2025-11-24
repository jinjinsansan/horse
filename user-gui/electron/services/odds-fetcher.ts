import { chromium } from 'playwright';

type OddsEntry = {
  umaban: string;
  odds: number;
  popularity: number;
};

const JO_CODE_MAP: Record<string, { label: string; jraCode: string }> = {
  札幌: { label: '札幌', jraCode: '01' },
  函館: { label: '函館', jraCode: '02' },
  福島: { label: '福島', jraCode: '03' },
  新潟: { label: '新潟', jraCode: '04' },
  東京: { label: '東京', jraCode: '05' },
  中山: { label: '中山', jraCode: '06' },
  中京: { label: '中京', jraCode: '07' },
  京都: { label: '京都', jraCode: '08' },
  阪神: { label: '阪神', jraCode: '09' },
  小倉: { label: '小倉', jraCode: '10' },
};

const FALLBACK_ROWS = 12;

export async function fetchJraOdds(params: { joName: string; raceNo: number }): Promise<OddsEntry[]> {
  const { joName, raceNo } = params;
  const meeting = JO_CODE_MAP[joName];

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  try {
    await page.goto('https://www.jra.go.jp/JRADB/accessO.html', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // JRAサイトの検索フォームは日/開催/レース番号で構成されるため、開催一覧->レース番号を順に選択
    if (meeting) {
      await page.selectOption('select[name="selectJyo"]', meeting.jraCode).catch(() => undefined);
    }

    await page.selectOption('select[name="selectRaceNo"]', String(raceNo)).catch(() => undefined);

    const searchButton = page.locator('input[type="submit"]');
    if (await searchButton.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        searchButton.click(),
      ]);
    }

    // 投票式別オッズ一覧テーブルから人気・倍率・馬番を取得
    const rows = await page.$$eval('table.tbl-odds tbody tr', (trs) =>
      Array.from(trs)
        .map((row) => {
          const cells = Array.from(row.querySelectorAll('td')).map((cell) => {
            const raw = (cell as any)?.textContent ?? '';
            return String(raw).trim();
          });
          if (cells.length < 3) return null;
          const [popularity, umaban, oddsValue] = cells;
          return {
            popularity: Number(popularity.replace(/[^0-9]/g, '')),
            umaban: umaban.padStart(2, '0'),
            odds: Number(oddsValue.replace(/[^0-9.]/g, '')),
          };
        })
        .filter((item): item is { popularity: number; umaban: string; odds: number } =>
          item !== null && !Number.isNaN(item.odds),
        ),
    );

    if (!rows.length) {
      throw new Error('オッズ情報を取得できませんでした');
    }
    return rows.slice(0, FALLBACK_ROWS);
  } catch (error) {
    console.error('[odds-fetcher] failed to scrape JRA odds', error);
    throw error;
  } finally {
    await browser.close();
  }
}
