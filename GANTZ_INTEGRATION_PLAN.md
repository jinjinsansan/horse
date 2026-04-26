# GANTZ → HorseBet GUI 自動投票連携 実装計画書

最終更新: 2026-04-26 (Phase 6 完了 / v1.1.0 タグ)

## 0. 背景と目的

### サービス全体像
- **競馬GANTZ** (Telegram チャンネル): `dlogic-agent` (VPS 220.158.24.157) が運営する単勝厳格買い目配信サービス
  - 配信スクリプト: `scripts/anatou_post_strict.py` (09:00 strict / 09:30 loose / 23:00 results)
  - データソース: `dlogic-agent` の `/api/data/golden-pattern/today` (Flask Blueprint, port 5000)
  - 配信内容: 単勝厳格パターン1〜N件、各 100円、HTML形式の Telegram メッセージ
- **HorseBet GUI** (`horse/horsebet-system/user-gui`, Electron): GANTZ 購読ユーザー用デスクトップ。受信した買い目を IPAT/SPAT4 に自動投票

### 目的
**GANTZ 配信 → HorseBet GUI 自動投票** のエンドツーエンド経路を確立する。

### 現状ギャップ
- GANTZ は Telegram に HTML メッセージを送るだけ。GUI が読みに行く `bet_signals` (Supabase) には何も入らない
- GUI 側の voter は3連単フォーメーション中心で、単勝1点用の経路にバグあり
- 信号は 09:00 一括配信だが、GUI は受信即実行で、終日のレース時刻スケジューリング機能なし
- Settings.tsx の JSX 構造が破損していてユーザー設定 UI が崩れている

---

## 1. アーキテクチャ最終形

```
┌─────────────────────────────────────────────────┐
│ dlogic-agent (VPS 220.158.24.157)               │
│                                                 │
│ /api/data/golden-pattern/today  ──┐             │
│   (既存。is_golden_strict 付き    │             │
│    で当日全レースを返す)          │             │
│                                   ▼             │
│ scripts/anatou_post_strict.py    scripts/       │
│  (Telegram GANTZ チャンネル)     push_gantz_    │
│                                   to_horse.py   │
│                                   ★NEW★         │
└─────────────────────────────────────────────────┘
                                    │
                                    ▼ supabase-py (service_role)
                            ┌───────────────┐
                            │  Supabase     │
                            │  bet_signals  │
                            │  (horse 用)   │
                            └───────┬───────┘
                                    │ Realtime INSERT/UPDATE
                                    ▼
                            ┌───────────────┐
                            │ user-gui      │
                            │ (Electron)    │
                            │ Dashboard     │
                            └───────┬───────┘
                                    │ Playwright
                                    ▼
                            ┌───────────────┐
                            │ IPAT / SPAT4  │
                            │ (本番投票)    │
                            └───────────────┘
```

### キー原則
1. **Telegram メッセージは parse しない** — `dlogic-agent` の API を直接叩いて構造化データで取り込む
2. **冪等性** — Supabase 側に `(source, signal_date, jo_code, race_no, bet_type)` の UNIQUE を貼り、再実行しても重複しない
3. **bridge は service_role キーで動く** — RLS をバイパスして直接 upsert
4. **scheduler は GUI 側に置く** — レース発走時刻ベースの予約発射を GUI で行う
5. **手動投票 UI は残す** — 自動失敗時のリカバリ経路として

---

## 2. フェーズ分割

### Phase 1 — ブリッジ層（GANTZ → Supabase）★今回はここ★

| # | 作業 | ファイル |
|---|------|----------|
| 1.1 | DB スキーマ拡張（`start_time` 列, `source` 列, UNIQUE 制約） | `horsebet-system/supabase/migrations/0001_gantz_bridge.sql` |
| 1.2 | shared types に `start_time`, `source` 追加 | `shared/types/database.types.ts` |
| 1.3 | NAR 会場名 → jo_code 逆引きヘルパー | `dlogic-agent/scripts/push_gantz_to_horse.py` 内 |
| 1.4 | bridge スクリプト本体 | `dlogic-agent/scripts/push_gantz_to_horse.py` |
| 1.5 | systemd timer/service ユニット | `dlogic-agent/scripts/push_gantz_to_horse.service` + `.timer` |
| 1.6 | 環境変数追加 (`.env.local`) | `HORSE_SUPABASE_URL`, `HORSE_SUPABASE_SERVICE_ROLE_KEY` |
| 1.7 | dry-run でローカル動作確認手順 | この MD の §5 |

**完了条件**:
- ローカルで `python scripts/push_gantz_to_horse.py --dry-run --date YYYYMMDD` が strict レースを正しい構造で出力
- VPS にデプロイ後、`bet_signals` テーブルに当日の strict レースが入る
- GUI 起動状態で、bridge 実行時に Realtime で signal が届く

### Phase 2 — 単勝バグ修正＆ライブ投票テスト

| # | 作業 |
|---|------|
| 2.1 | `ipat-voter.ts` `selectUmabans()` の `for (i=1; ...)` index off-by-one 修正 |
| 2.2 | 単勝 (`betTypeNo===1`) で `method` を不要扱いにする (bet-executor + voter) |
| 2.3 | `ipat-voter.ts` `getIdNames()` の selector を実 IPAT HTML で検証 |
| 2.4 | 実 IPAT で 100円×1点ライブテスト（自分のアカウント／少額） |
| 2.5 | 実 SPAT4 で 100円×1点ライブテスト |
| 2.6 | エラー時のスクリーンショット出力 (debug用) |

**完了条件**: 実際に IPAT と SPAT4 で 100円単勝が成立し、`bet_history` に記録される

### Phase 3 — レース発走時刻ベースのスケジューラ

| # | 作業 |
|---|------|
| 3.1 | `bet_signals.start_time` を読んで `now() + (start_time - N分)` まで待つ in-app scheduler |
| 3.2 | アプリ起動時に当日の未消化シグナルを取り込んでキュー再構築 |
| 3.3 | `status` 拡張: `active → scheduled → submitted → completed/failed` |
| 3.4 | 出走取消馬の検知（voter から戻ってきた `cancelled` を反映） |
| 3.5 | UI: 各シグナルの「発走まで残り XX分」表示と手動キャンセル |

### Phase 4 — Settings.tsx 修復＆ユーザー UX

| # | 作業 |
|---|------|
| 4.1 | Settings.tsx 全面リライト（壊れた JSX 構造を直す） |
| 4.2 | GANTZ 用「単勝固定100円」「日次上限」「JRA/NAR 切替」スイッチ |
| 4.3 | Dashboard 上部に「自動投票 ON/OFF」常設 |
| 4.4 | SPAT4 認証情報必須案内（GANTZ は NAR 中心のため） |

### Phase 5 — 運用品質

| # | 作業 |
|---|------|
| 5.1 | サブスクリプション gate (`subscription_status` チェック) |
| 5.2 | 結果反映 (`bet_history.bet_result` 更新, `dlogic-agent` 結果と紐付け) |
| 5.3 | 投票完了/失敗の Telegram 通知（個人 Bot） |
| 5.4 | エラー監視ダッシュボード or 通知 |
| 5.5 | `playwright-service` 削除（型不整合で死蔵） |
| 5.6 | Electron auto-updater リリースフロー検証 |

---

## 3. データマッピング仕様

### 入力: `dlogic-agent` `/api/data/golden-pattern/today` のレース要素

```jsonc
{
  "race_id": "20260426-船橋-7",
  "venue": "船橋",
  "race_number": 7,
  "race_name": "C2",
  "start_time": "15:25",
  "is_local": true,                  // true=NAR, false=JRA
  "distance": "ダ1200m",
  "total_horses": 12,
  "consensus": {
    "horse_number": 5,
    "horse_name": "ヒロイン",
    "agreed_engines": ["Dlogic", "Ilogic", "ViewLogic"],
    "count": 3
  },
  "popularity_rank": 6,
  "is_golden_loose": true,
  "is_golden_strict": true,
  "engine_picks": { /* ... */ },
  "result": null
}
```

### 出力: Supabase `bet_signals` 行

```jsonc
{
  "signal_date": "2026-04-26",
  "race_type": "NAR",                // is_local ? "NAR" : "JRA"
  "jo_code": "34",                   // venue 逆引き
  "jo_name": "船橋",                 // venue そのまま
  "race_no": 7,
  "bet_type": 1,                     // 単勝固定
  "bet_type_name": "単勝",
  "method": 0,                       // 単勝は方式不要
  "suggested_amount": 100,           // GANTZ 仕様
  "kaime_data": ["5"],               // [str(consensus.horse_number)]
  "note": "GANTZ strict | 5番ヒロイン | 6人気 | 発走15:25 | 一致3/4(D+I+V)",
  "start_time": "15:25",             // ★新規列★
  "source": "gantz_strict",          // ★新規列★
  "status": "active",
  "created_by": null                 // bridge は system 投入のため NULL
}
```

### 会場名 → NAR jo_code 逆引きテーブル

`shared/types/business.types.ts` の `NAR_JO_CODES` から逆引き：

```python
NAR_JO_CODES = {
  '30': '門別', '31': '盛岡', '32': '水沢', '33': '浦和',
  '34': '船橋', '35': '大井', '36': '川崎', '37': '金沢',
  '38': '笠松', '39': '名古屋', '40': '園田', '41': '姫路',
  '42': '高知', '43': '佐賀', '44': '帯広',
}
NAME_TO_CODE = {v: k for k, v in NAR_JO_CODES.items()}
```

JRA 用も同様（GANTZ 配信は土日 silent なので、JRA は基本来ないが将来拡張のため定義）。

### 冪等性キー
`UNIQUE(source, signal_date, jo_code, race_no, bet_type)` に対する upsert。
- 同一レースが GANTZ から再送されたら `kaime_data, note, start_time, updated_at` を更新
- 違う source（手動配信など）とは衝突しない

---

## 4. 環境変数

VPS の `/opt/dlogic/linebot/.env.local` に追加:

```ini
# 既存 (dlogic-agent 自身の Supabase)
SUPABASE_URL=https://agkuvhiycthrloxzhgjc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# ★新規★ (HorseBet 用 Supabase, bridge 専用)
HORSE_SUPABASE_URL=https://<horse-project-id>.supabase.co
HORSE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

**取得方法**: `horse/horsebet-system/admin-panel/.env*` または Supabase ダッシュボード → Project Settings → API → service_role key (secret) からコピー。

---

## 5. Phase 1 動作確認手順

### ローカル dry-run

```bash
cd E:\dev\Cusor\dlogic-agent
# .env.local に HORSE_SUPABASE_* を追加した上で
python scripts/push_gantz_to_horse.py --dry-run --date 20260426
```

期待出力:
```
[INFO] target date: 20260426
[INFO] fetched N races, M strict
[DRY-RUN] would upsert: NAR 船橋 7R 単勝 [5] 15:25
[DRY-RUN] would upsert: NAR 高知 5R 単勝 [3] 16:10
...
[INFO] dry-run complete: M signals
```

### スキーマ適用

Supabase Studio の SQL Editor で:
```sql
-- horsebet-system/supabase/migrations/0001_gantz_bridge.sql の内容を実行
```

### 本番 push

```bash
python scripts/push_gantz_to_horse.py --date 20260426
```

→ `bet_signals` テーブルに行が追加されることを Supabase Studio で確認 → GUI 起動して Realtime で受信されることを確認

### VPS デプロイ

```bash
scp scripts/push_gantz_to_horse.py root@220.158.24.157:/opt/dlogic/linebot/scripts/
scp scripts/push_gantz_to_horse.service root@220.158.24.157:/etc/systemd/system/
scp scripts/push_gantz_to_horse.timer root@220.158.24.157:/etc/systemd/system/
ssh root@220.158.24.157 "systemctl daemon-reload && systemctl enable --now push_gantz_to_horse.timer"
```

毎日 09:01 JST (anatou_post_strict.py の直後) に発火。

---

## 6. リスク・注意事項

| リスク | 対応 |
|--------|------|
| GANTZ 配信前に bridge が走ってしまう | timer を 09:01 JST 固定（anatou_post_strict は 09:00 cron） |
| `dlogic-agent` API がダウン | bridge が 404 を受けたら exit 0 で silent（GUI 側は何も来ない＝平常通り） |
| Supabase が一時不可 | 即時リトライ3回、それでも失敗ならログのみ |
| 冪等キー衝突 | upsert で update に倒れる、副作用なし |
| `created_by` NOT NULL 制約に引っかかる | 既存スキーマは NULL 許容のため OK（要再確認） |
| GANTZ 配信なしの日 (土日) | strict レース 0件 → bridge は何も書き込まず exit 0 |

---

## 7. 進捗管理

| Phase | 状態 | 着手日 | 完了日 |
|-------|------|--------|--------|
| Phase 1 ブリッジ層 | ✅ **本番稼働中** | 2026-04-26 | 2026-04-26 |
| Phase 2 単勝バグ＆ライブテスト | 🔄 コード修正済 / ライブテスト未実施 | 2026-04-26 | — |
| Phase 3 スケジューラ | ✅ コード完成 | 2026-04-26 | 2026-04-26 |
| Phase 4 Settings UI 修復 | ✅ コード完成 | 2026-04-26 | 2026-04-26 |
| Phase 5 運用品質 | ✅ コード完成（要 VPS デプロイ） | 2026-04-26 | 2026-04-26 |

---

## 8. Phase 1 完了レポート (2026-04-26)

### 作成ファイル
| ファイル | 役割 |
|----------|------|
| `horsebet-system/supabase/migrations/0001_gantz_bridge.sql` | `start_time`/`source` 列追加 + UNIQUE インデックス |
| `horsebet-system/shared/types/database.types.ts` (修正) | `BetSignal` 型に `start_time`, `source`, `SignalSource` 追加 |
| `dlogic-agent/scripts/push_gantz_to_horse.py` | bridge 本体 (CLI: `--date`, `--source`, `--include-loose`, `--dry-run`) |
| `dlogic-agent/scripts/push_gantz_to_horse.service` | systemd oneshot ユニット |
| `dlogic-agent/scripts/push_gantz_to_horse.timer` | 09:01 JST 起動タイマー |
| `dlogic-agent/scripts/test_push_gantz_mapping.py` | オフライン単体テスト (全 6 ケース通過) |

### 検証済み
- Python 構文: OK
- マッピング単体テスト: 全 6 ケース通過 (NAR/JRA/不正データ/会場逆引き)
- venue → jo_code 逆引き 25 会場分対応 (JRA 10 + NAR 15)

### ユーザー側で必要な作業（次のフェーズ前にやってもらう）

1. **Supabase migration 適用**
   - Supabase Studio (horse プロジェクト) を開く → SQL Editor
   - `horsebet-system/supabase/migrations/0001_gantz_bridge.sql` の内容を貼り付けて Run
   - 検証: `\d bet_signals` または `SELECT column_name FROM information_schema.columns WHERE table_name='bet_signals';` で `start_time` と `source` が見えること

2. **HorseBet Supabase の service_role key 取得**
   - Supabase ダッシュボード → Project Settings → API → `service_role` (secret) をコピー

3. **VPS 環境変数追加**
   ```bash
   ssh root@220.158.24.157
   nano /opt/dlogic/linebot/.env.local
   # 末尾に追加：
   #   HORSE_SUPABASE_URL=https://<horse-project-id>.supabase.co
   #   HORSE_SUPABASE_SERVICE_ROLE_KEY=<取得した key>
   ```

4. **VPS デプロイ**
   ```bash
   # ローカルから VPS へ転送
   scp E:/dev/Cusor/dlogic-agent/scripts/push_gantz_to_horse.py        root@220.158.24.157:/opt/dlogic/linebot/scripts/
   scp E:/dev/Cusor/dlogic-agent/scripts/test_push_gantz_mapping.py    root@220.158.24.157:/opt/dlogic/linebot/scripts/
   scp E:/dev/Cusor/dlogic-agent/scripts/push_gantz_to_horse.service   root@220.158.24.157:/etc/systemd/system/
   scp E:/dev/Cusor/dlogic-agent/scripts/push_gantz_to_horse.timer     root@220.158.24.157:/etc/systemd/system/

   # systemd 有効化
   ssh root@220.158.24.157 "systemctl daemon-reload && systemctl enable --now push_gantz_to_horse.timer && systemctl list-timers push_gantz_to_horse.timer"

   # 即時手動実行（dry-run）で確認
   ssh root@220.158.24.157 "cd /opt/dlogic/linebot && venv/bin/python scripts/push_gantz_to_horse.py --dry-run --date $(date +%Y%m%d)"

   # 本番実行
   ssh root@220.158.24.157 "systemctl start push_gantz_to_horse.service && journalctl -u push_gantz_to_horse.service --since '1 min ago' --no-pager"
   ```

5. **動作確認**
   - Supabase Studio で `bet_signals` テーブルを開き、当日の `source='gantz_strict'` の行を確認
   - GUI を起動して新規シグナルが Realtime で届くことを確認
   - 同じ日付で再実行 → upsert なので重複行が増えないこと

### 既知の制約 (Phase 2 以降で対応)

- **GUI 側はまだ単勝で正しく投票できない** (Phase 2 で修正): `ipat-voter.ts:481` のループ off-by-one バグ等
- **GUI は受信即実行**で、`start_time` をまだ尊重しない (Phase 3 で対応)
- **shared パッケージはコンシューマー側で再ビルドが必要** (`cd horsebet-system/shared && npm run build`)。型変更を反映させるため

---

## 9. Phase 1 デプロイ完了レポート (2026-04-26 13:20 JST)

### Supabase
- 旧プロジェクト削除 → 新プロジェクト `pfeotlwiltrfidtmqhim` 作成
- スキーマ統合 SQL（schema + policies + 0001_gantz_bridge）一括適用 → tables_ok=7, gantz_cols_ok=2
- 管理者ユーザー作成: `goldbenchan@gmail.com` (UID: `baa2e4a3-...`) → user_profiles に role=admin 登録

### env 同期 (3 ファイル)
- `admin-panel/.env.local`: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `user-gui/.env.local`: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- `user-gui/.env.production`: 同上

### admin-panel 動作確認
- `npm install` 復旧 → `npm run dev`（Webpack 経由、Turbopack の subpath wildcard exports バグ回避）
- `globals.css` の `@import` 順序修正
- ログイン疎通確認 → ダッシュボード表示 OK
- 今後は手動配信メイン用途ではないため運用優先度は低

### VPS デプロイ (220.158.24.157)
| 配置先 | ファイル |
|---|---|
| `/opt/dlogic/linebot/scripts/` | `push_gantz_to_horse.py`, `test_push_gantz_mapping.py` |
| `/etc/systemd/system/` | `dlogic-push-gantz.service`, `dlogic-push-gantz.timer` |
| `/opt/dlogic/linebot/.env.local` | `HORSE_SUPABASE_URL`, `HORSE_SUPABASE_SERVICE_ROLE_KEY` 追記 |

### 動作確認結果
- VPS 上で単体テスト 6/6 通過
- 6 日分 dry-run: 月16/火13/水6/木3/金7/土0/日0 件 — 仕様通り
- 2026-04-24 (金) で本番 push: 7 行 upsert 成功（浦和×2, 金沢×4, 名古屋×1）
- REST API 検証: 7 行取得確認、データ完全
- 冪等性: 同一日付で再実行しても件数 7 のまま（UNIQUE 索引 + upsert 動作）

### systemd timer 状態
- `dlogic-push-gantz.timer` enabled, active (waiting)
- 次回 firing: **Mon 2026-04-27 09:01:00 JST**（anatou-strict 09:00 の 1 分後）
- これで毎日 GANTZ 配信と同時に Supabase へ自動転送

---

## 10. Phase 2 コード修正完了レポート (2026-04-26)

### 修正したファイル

| ファイル | 修正 |
|---|---|
| `shared/automation/ipat-voter.ts` | `inputKaimeTanFuku()` メソッド新設。betTypeNo=1(単勝)/2(複勝) の場合に分岐し、`#select-list-tan-N` または `#select-list-fuku-N` を直接クリック |
| `shared/automation/ipat-voter.ts` | `selectUmabans()` のループ開始 index を `1` → `0` に修正（kaime[0] スキップ問題） |
| `user-gui/electron/services/bet-executor.ts` | 単勝/複勝で `method = 0`、それ以外は 301 |

### 検証

- shared パッケージビルド OK (exit 0)
- user-gui app + electron 型チェック OK (exit 0, 0)

### 残タスク：ライブテスト

実 IPAT / SPAT4 で 100円×1点の動作確認が必要。手順書を別ファイルに記載：
- **`PHASE2_LIVE_TEST.md`** — 認証情報登録 → admin-panel で単勝テスト配信 → user-gui の「手動で投票」で実行 → 結果検証

ライブテスト実施は jin さん本人のアカウント（IPAT: P で始まる加入者番号 / SPAT4 加入者番号）が必須のため、コード側の Phase 2 はここで一旦完了として Phase 3 に進める。

> ライブテストで「馬番ボタンが見つかりません」エラーが出た場合、IPAT 実 HTML を DevTools で開いて selector を確認し、`inputKaimeTanFuku()` の `idPrefix` を実値に直す必要がある。手順書に明記済み。

---

## 11. Phase 3 完了レポート (2026-04-26)

### 新規追加ファイル
- `user-gui/src/services/bet-scheduler.ts` — レース発走時刻ベースのスケジューラ本体（class `BetScheduler`）

### 修正ファイル
- `user-gui/src/lib/api/history.ts` — `fetchSubmittedSignalIds(userId)` 追加（当日投票済 signal_id 集合取得）
- `user-gui/src/pages/Dashboard.tsx` — スケジューラ初期化・自動投票切替ハンドリング・状態表示・取消ボタン追加
- `user-gui/src/index.css` — schedule バッジと info パネルのスタイル

### 動作仕様
1. **userId 確定後にスケジューラを 1 回生成**、`fetchSubmittedSignalIds` で当日の投票済を ref に load
2. **初期 signals + Realtime 新着 signals** をスケジューラに投入。`autoBetEnabled=true` の場合のみ
3. 各 signal について：
   - `start_time` 不正/未指定 → **即実行**（手動配信互換）
   - `start_time` 指定あり → `start_time - 5分` を `setTimeout` で予約
   - 既に発走時刻 +60 秒以上経過 → **skipped**（投票締切想定）
   - `start_time` 直前 or 過ぎたばかり → 即実行
4. **二重投票防止**：
   - スケジューラ内の `submittedIdsRef` が更新されると、その後の `fire()` は skipped
   - 投票成功直後に `submittedIdsRef.current.add(signalId)` を実行
5. **autoBetEnabled トグル**：
   - ON → 既ロード済 signals すべてを再 schedule
   - OFF → `scheduled`/`queued` を全 cancel
6. **UI 状態表示** — 各シグナルに `scheduled/firing/submitted/failed/skipped` バッジ。詳細パネルで「発走 HH:MM」「自動投票を取消」ボタン

### 設計判断
- **client-side scheduler**：アプリ起動中のみ動作。常駐運用前提。サーバ side scheduler は Phase 5 候補（playwright-service の再活用）
- **`bet_history` レコード作成 = 投票済**：DB 真実 / `submittedIdsRef` は in-memory キャッシュ
- **scheduler の status は informational**：実 PASS/FAIL は `bet_history.bet_result` で確認

### 検証
- shared/dist 再生成 OK
- user-gui app + electron 両方 type-check OK (exit 0)

### 残課題（Phase 5 で対応）
- アプリ未起動時の投票漏れ通知
- `bet_signals.status` を `active → scheduled → completed` に同期させる（現在 status は active のまま）
- 出走取消馬の事前検出（API 側で除外するか、voter 内で対応中の取消検出を信頼するか）

---

## 12. Phase 4 完了レポート (2026-04-26)

### 修正ファイル
- `user-gui/src/pages/Settings.tsx` — JSX 構造を全面リライト（崩れた section/label のネスト解消）
- `user-gui/src/pages/Dashboard.tsx` — content-header に自動投票 ON/OFF トグルを常設
- `user-gui/src/index.css` — `header-actions`, `autobet-switch` のスタイル追加

### Settings.tsx の構造（修復後）
1. ヘッダー（戻るボタン）
2. **自動投票** セクション — ON/OFF トグル + GANTZ 注記
3. **IPAT 認証情報（JRA 用）** — 加入者番号 / ユーザーコード / パスワード / PIN（4 フィールド、正しい順序）
4. **SPAT4 認証情報（NAR 用）** — 加入者番号 / 利用者ID / 暗証番号（3 フィールド）+ GANTZ 推奨説明
5. **追い上げ設定** — GANTZ 単勝では使わない旨を注記
6. 投票ブラウザセットアップ
7. アプリ更新
8. 保存ボタン

### Dashboard.tsx 上部のトグル
- 切替時に `user_profiles.auto_bet_enabled` を即座に Supabase へ update
- ON 時は緑色（#34d399）、OFF 時は通常色

### 検証
- shared 既ビルド維持
- user-gui app + electron 両方 type-check OK (exit 0)

---

## 13. Phase 5 完了レポート (2026-04-26)

### 実装項目

#### 5.1 投票エラー時のスクリーンショット出力
- `shared/automation/ipat-voter.ts` / `spat4-voter.ts` に `screenshotDir` option と `captureScreenshot()` メソッド追加
- vote() の catch 句で `userData/screenshots/{ipat|spat4}-error-{timestamp}.png` を保存
- エラー詳細メッセージにスクリーンショットパスを追記

#### 5.2 サブスクリプション gate
- `Dashboard.tsx` で `user_profiles.subscription_status` を読み取り（`trial`/`active`/`expired`/`suspended`）
- `handleBetExecution` 冒頭で gate チェック → 期限切れ/停止中なら投票拒否
- ヘッダーにサブスクリプションバッジを常時表示

#### 5.3 投票漏れ検出
- 当日 signals のうち `start_time + 60秒` を超過し、submitted/firing でないものを `missedSignals` として集計
- ヘッダーに「⚠️ 未投票で発走済: N 件」と黄色警告

#### 5.4 結果反映スクリプト（dlogic-agent 側）
新規ファイル：
- `scripts/update_bet_results.py` — bet_history.pending を race_results 照合して win/lose 確定
- `scripts/dlogic-update-bet-results.service` — systemd oneshot
- `scripts/dlogic-update-bet-results.timer` — 12:00 / 18:00 / 23:00 JST 自動実行

ロジック：
1. HorseBet Supabase の `bet_history.bet_result='pending'` を取得
2. `bet_signals` から `signal_date / jo_name / race_no / bet_type` を引く
3. dlogic-agent 自身の `race_results` テーブルから `race_id={YYYYMMDD}-{venue}-{race_no}` を照合
4. 単勝の場合: `selected_kaime[0] == winner_number` で win 判定 → `payout = win_payout * (bet_amount/100)`
5. HorseBet の `bet_history` を update（`bet_result`, `payout` 列）

> 単勝のみ実装。複勝/連系は将来対応（GANTZ は単勝オンリー仕様のため当面不要）

#### 5.5 playwright-service 削除（技術的負債整理）
削除した資産：
- `playwright-service/` ディレクトリ全体（src/, dist/, node_modules/, package.json/-lock.json, tsconfig.json）
- `admin-panel/src/app/api/server-bet/route.ts`（playwright-service を呼ぶエンドポイント）
- `render.yaml`（Render デプロイ用、もはや不要）
- `scripts/sync-shared.mjs` から playwright-service エントリ削除
- `scripts/run-validators.sh` から playwright-service ステップ削除

理由：型不整合でビルド不能だった上、user-gui 側の Electron で全投票機能を完結させる方針に転換済み。

### 検証
- shared 再ビルド OK
- user-gui app + electron 両方 type-check OK (exit 0, 0)

### ユーザー側で必要な作業（VPS デプロイ）

```bash
# ローカルから VPS へ
scp E:/dev/Cusor/dlogic-agent/scripts/update_bet_results.py             root@220.158.24.157:/opt/dlogic/linebot/scripts/
scp E:/dev/Cusor/dlogic-agent/scripts/dlogic-update-bet-results.service root@220.158.24.157:/etc/systemd/system/
scp E:/dev/Cusor/dlogic-agent/scripts/dlogic-update-bet-results.timer   root@220.158.24.157:/etc/systemd/system/

# VPS 側
ssh root@220.158.24.157 'systemctl daemon-reload && systemctl enable --now dlogic-update-bet-results.timer && systemctl list-timers dlogic-update-bet-results --no-pager'

# 手動テスト
ssh root@220.158.24.157 'cd /opt/dlogic/linebot && venv/bin/python scripts/update_bet_results.py'
```

---

## 14. プロジェクト全体サマリ (2026-04-26)

GANTZ Telegram 配信 → HorseBet GUI 自動投票 のエンドツーエンド経路は **コード実装としては全て完了**。残タスクはすべてユーザー側のオペレーション or 実機ライブテストのみ。

### コード実装：完了
- ✅ Phase 1 ブリッジ層（VPS 稼働中）
- ✅ Phase 2 単勝バグ修正
- ✅ Phase 3 発走時刻ベースのスケジューラ
- ✅ Phase 4 Settings UI 修復・自動投票トグル常設
- ✅ Phase 5 運用品質（スクショ・gate・漏れ検出・結果反映・負債整理）

### 残作業（jin さん側）
1. **Phase 5 結果反映スクリプトの VPS デプロイ**（コマンド一式は §13 に記載）
2. **Phase 2 実機ライブテスト**（IPAT 100円 / SPAT4 100円、`PHASE2_LIVE_TEST.md` 参照）
3. **明日 09:01 JST のリアル動作観察**（user-gui 起動状態で signals 受信 → スケジュール → 投票実行）

### 自動運用フロー（明日朝以降）

```
09:00 JST  dlogic-anatou-strict.service   → GANTZ Telegram 配信
09:01 JST  dlogic-push-gantz.service      → bet_signals に upsert
           ↓ Realtime
           user-gui 受信 → BetScheduler に投入
           ↓
各レース発走 5分前  → IPAT/SPAT4 自動投票 → bet_history INSERT (pending)
           ↓
12:00/18:00/23:00 JST  dlogic-update-bet-results.service → race_results 照合 → bet_history UPDATE (win/lose)
```

### 既知の制約（追加開発候補）
- **アプリ未起動時の投票漏れ**：UI で警告表示するのみで自動リカバリなし（Phase 6 候補：投票漏れ Telegram 通知）
- **複勝/連系の結果反映未対応**：GANTZ は単勝のみのため当面不要
- **subscription_status の管理画面なし**：admin-panel 側にユーザー管理 UI が必要（Phase 6 候補）
- **Electron アプリのライセンス配布**：subscription_status を有効化するまでのフロー未整備（Phase 6 候補）

---

## 15. Droid 監査対応レポート (2026-04-26)

Phase 1〜5 完了後、factory-droid に包括コードレビューを依頼。BLOCKER 5 件＋
重要度の高い指摘を以下のとおり対応。

### BLOCKER 対応

| # | 指摘 | 対応ファイル | 内容 |
|---|---|---|---|
| 1 | API 障害時に push が成功扱い | `scripts/push_gantz_to_horse.py` | `TransientApiError` 例外を導入。404 のみ silent、5xx・通信失敗は exit 1 |
| 2 | 再起動直後の二重投票レース | `user-gui/src/pages/Dashboard.tsx` | `schedulerReady` state 追加。`fetchSubmittedSignalIds` 完了まで schedule しない |
| 3 | IPAT セレクタ実装が未検証 | `shared/automation/ipat-voter.ts` | `findUmabanButton()` で複数 selector 探索、失敗時 `dumpRelevantDom()` で DOM スニペットをエラーに付与 |
| 4 | 認証情報のログ漏れ | `user-gui/electron/services/bet-executor.ts` | `credentials: payload.credentials.spat4` を `hasMemberNumber/hasMemberId/hasPassword` の存在フラグに置換 |
| 5 | timer タイムゾーン未固定 | `dlogic-push-gantz.timer`, `dlogic-update-bet-results.timer` | `OnCalendar=*-*-* HH:MM:00 Asia/Tokyo` で明示固定 |

### その他重要対応

| 指摘 | 対応 |
|---|---|
| 見落とし #1: `/api/server-bet` 呼出が残置 | `admin-panel/src/app/client/page.tsx` の `SERVER_BET_AVAILABLE = false` に固定、`fetch('/api/server-bet')` 削除 |
| 見落とし #2: oiage_state スキーマ不一致 | `supabase/migrations/0002_oiage_columns.sql` で `base_amount`, `max_steps` 列追加 |
| D-HIGH: result updater 失敗時 exit 0 | `update_bet_results.py` で PATCH 失敗を `failed` カウンタ集計、`failed > 0` で exit 1 |
| C-LOW: preload IPC 型不一致 | `preload.ts` の `BridgeCredentials.spat4` を `{memberNumber, memberId, password}` に。`electron.d.ts` 側にも `password` 追加 |
| G-HIGH: `getIdNames` 簡易実装コメント | コメントを「単勝・複勝はフォールバック selector 経由で動く / 連系は未検証」と明示する形に書き換え |
| A-HIGH: 未起動時リカバリ不足 | `Dashboard.tsx` 詳細パネルで `missedSignals` に該当する signal の場合「⚠️ 既に発走時刻を過ぎていますが未投票です」と表示し手動投票への導線を強化 |

### 適用すべきユーザー側作業
1. **Supabase 側 0002 migration 実行**:
   ```sql
   -- migrations/0002_oiage_columns.sql
   ALTER TABLE oiage_state
       ADD COLUMN IF NOT EXISTS base_amount INTEGER NOT NULL DEFAULT 1000,
       ADD COLUMN IF NOT EXISTS max_steps   INTEGER NOT NULL DEFAULT 5;
   ```
2. **VPS 側は再デプロイ済み**（Asia/Tokyo TZ 固定済 .timer + 修正版スクリプト）

### 検証
- shared 再ビルド OK (exit 0)
- user-gui app + electron 両方 type-check OK (exit 0, 0)
- VPS 上で `--dry-run` 実行 → 想定通り動作（土日 strict=0 silent）
- VPS 上で update_bet_results.py 実行 → pending=0 silent
- `systemctl list-timers` で next firing が `Asia/Tokyo` で表示されることを確認

### 残未対応（重要度に応じて Phase 6+ で対応）
- **HIGH C-HIGH 認証情報の DB 平文保存**：`credentials_cipher`/`credentials_iv` 列があるが未使用。Phase 6 で AES-GCM 暗号化に移行予定
- **MEDIUM**: race_id を文字列組み立てでなく `bet_signals.external_race_id` を持たせる（マッピング保証）
- **MEDIUM**: ワイルドカード subpath exports に戻して保守性向上
- **LOW**: 24h 超のタイマーは再計算ループ化
- **E2E 自動テスト**：未実装。MVP 段階では明日のリアル運用観察で代替

---

## 16. Phase 6 完了レポート (2026-04-26)

claude.ai/design からのハンドオフを受けて UI を Orb Stage 風 HUD に
全面刷新。投票モード 4 択と GANTZ 全体回収率も同時実装。

### 16-1. デザインハンドオフ受領
- 配置: `horsebet-system/docs/design_handoff_orb_dashboard/`
  - `README.md` (仕様書)
  - `styles/gantz.css` (デザイントークン + 共通クラス、コピペで使える)
  - `components/common.jsx` (Orb / GzWindow / MatrixBg / Corners / DataBar 等)
  - `screens/dashboard-a.jsx` (案 A ダッシュボード本体)
  - `screens/screens-aux.jsx` (Login / RaceList / RaceDetail / Settings / History / Notifications)
    ※ 元の `aux.jsx` は Windows DOS 予約語 (AUX) と衝突するためリネーム
  - `data/mock.js` (型サンプル)
  - `UI Design.html` (プレビュー)

### 16-2. 共通コンポーネント TS 化
新設: `user-gui/src/components/gantz/`
- `CodeRain.tsx` / `MatrixBg.tsx` / `GzWindow.tsx` / `Orb.tsx` / `Corners.tsx`
- `HorseSvg.tsx` / `CourseTrack.tsx` / `DataBar.tsx` / `DonutProgress.tsx` / `Vertical.tsx`
- `index.ts` re-export

### 16-3. CSS / デザイントークン
- `user-gui/src/index.css` を `gantz.css` 全採用に置換 (gz-* 体系)
- Orb の立体感強化 (上部 specular / 下部リムグロー / 装飾グリッドテクスチャ)
- Orb 外周 halo を `gz-orb-halo` 4.5s 周期で呼吸
- オーブ内テキスト 3 種の breathing animation (4 / 4.8 / 5.5s 異リズム)

### 16-4. 中央オーブの時刻ベース挙動
- `currentTime` state を 10 秒毎更新
- `activeSignal`: 発走 10 分前 ≦ now ≦ 発走 +3 分の窓に入る signal
- `focusedRace` あり → BET 詳細モード / なし → STANDBY モード
- STANDBY 中も常時 Orb 表示 + 「次のレースまで N 分」表示
- 中央オーブに「BET ¥XXX」を強調表示

### 16-5. 投票モード 4 択
| モード | 動作 |
|---|---|
| `manual` | 自動投票しない。手動投票のみ |
| `bulk` | 受信即実行。当日全レースを一気購入 |
| `first_only` | 最も早いレース 1 件のみ即実行 |
| `sequential` | 各レース発走 5 分前に setTimeout 発射 (既存 BetScheduler) |

- Settings に 4 つのカード式選択肢
- Dashboard 上部に 4 ボタン横並び (即時切替・即時保存)
- `prevBetModeRef` でモード切替と signals 変化を区別 (Droid 修正)
- `inFlightRef` で bulk モード時の二重投票防止 (Droid 修正)
- `first_only` ソートは時刻文字列を分換算で比較 (Droid 修正)

### 16-6. BET 金額設定
- Settings に 100〜50,000 円スライダー + 8 段プリセットボタン
- `settings.bet_amount` で保存
- Dashboard で `betAmount` を実投票額として使用 (UI 表示と DB 一致、Droid 修正)
- `logBetHistory()` に `betAmount?` 引数追加

### 16-7. 5 画面追加 / リライト
| 画面 | 内容 |
|---|---|
| Login | Orb 中央 + ログインフォーム横並び。地方競馬 AI 自動投票システム |
| Dashboard | 3 カラム HUD (signals 一覧 / 中央 Orb / 本日収支+EVENT LOG) |
| Settings | 投票モード / BET 金額 / SPAT4 (主) / IPAT (任意) / 追い上げ |
| RaceList | 当日 signals 全件カード表示。0 件時 "本日の配信はありません" |
| RaceDetail | D-Logic 10 軸 + 大型 Orb + GANTZ NOTE (mock 暫定値) |
| History | KPI 4 + 10 日棒グラフ + 一覧 (50 件 / page) |
| Notifications | フィルタ + 5 種アイコン + 時系列 |

### 16-8. 通知ストア (notification-store)
- in-memory 200 件、subscribe pattern
- 4 イベント源: `signal` / `fire` / `submitted` / `win` / `system` / `error`
- 投票エラーの日本語化:
  - 「残高 / balance」 → 「残高不足のため投票できませんでした」
  - 「時間外 / 締切」 → 「投票締切時刻を過ぎています」
  - 「login / 誤りがあります」 → 「ログインに失敗しました」
  - 「取消」 → 「対象馬が出走取消のためスキップされました」

### 16-9. 地方競馬専用化
- Settings: SPAT4 を上位 + 緑グロー枠 + 「必須」/「地方競馬専用」強調
- IPAT は下位 + opacity 0.85 + 「任意」
- Login サブタイトル: 「地方競馬 AI 自動投票システム」
- 「Supabase / D-Logic」 開発用語を画面から完全排除
- 「GANTZ ENGINE」 / 「投票サイト」 等に統一

### 16-10. Electron 仕様
- タイトル: 「競馬GANTZ v1.00」
- メニューバー (File/Edit/View/Window) 完全削除 (`Menu.setApplicationMenu(null)`)
- アプリ製品名: 「競馬GANTZ」

---

## 17. Phase B 完了レポート — GANTZ 全体回収率 (2026-04-26)

ユーザーが個人的に投票したかに関わらず、競馬GANTZ全体の本日回収率を
表示する仕組み。100円固定計算で「もし全 strict signals に 100円ずつ
BET したら」の回収率を、購入有無に関わらず可視化。

### 17-1. スキーマ拡張
**`migration 0005_bet_signals_outcome.sql`**:
- `outcome_status TEXT` (pending / win / lose / cancelled / unknown)
- `outcome_winner_number INTEGER`
- `outcome_payout_per_100 INTEGER`
- `outcome_updated_at TIMESTAMP WITH TIME ZONE`
- `idx_bet_signals_outcome` 索引追加

**`migration 0006_bet_history_replica_identity.sql`**:
- `ALTER TABLE bet_history REPLICA IDENTITY FULL`
- Realtime row-level filter (user_id=eq.X) を正しく機能させるため必須

### 17-2. dlogic-agent 側スクリプト改修
**`scripts/update_bet_results.py`** に追加:
- `fetch_pending_gantz_signals()`: `source like 'gantz_%'` AND `outcome_status='pending'` AND
  `signal_date >= now-30d` AND `bet_type=1` の signal を取得
- `update_signal_outcome()`: `bet_signals.outcome_*` を PATCH
- `update_gantz_outcomes()`: race_results 照合 + 全件更新
- `main()` で既存の bet_history 更新後、続けて呼ぶ
- results_cache のキー (YYYYMMDD-JO-NO 形式) から日付抽出して
  cached_dates と比較 (Droid 修正、不要な再 fetch を防止)

### 17-3. user-gui 側
- `shared/types/database.types.ts`: `OutcomeStatus` 型 + `BetSignal` に
  `outcome_*` 4 フィールド追加
- `signals.ts` に `subscribeToSignalUpdates()` 追加 (UPDATE 購読)
- `Dashboard.tsx`:
  - `gantzRecovery` useMemo: 当日 `source like 'gantz_*'` の outcome 集計
  - 100 円固定計算: `totalIn = decided.length * 100`
  - 右上を 2 段表示: 主「GANTZ 本日回収率」+ 副「あなたの本日収支」
  - Realtime UPDATE 購読 + 60 秒ポーリング fallback

### 17-4. 動作確認
4/24 (金) のテストデータ 7 件で全件 LOSE 判定動作確認済み:
```
GANTZ signal 1: LOSE race=20260424-浦和-1   bet=4 winner=5
GANTZ signal 2: LOSE race=20260424-浦和-9   bet=3 winner=2
GANTZ signal 3: LOSE race=20260424-金沢-2   bet=4 winner=2
GANTZ signal 4: LOSE race=20260424-金沢-6   bet=1 winner=6
GANTZ signal 5: LOSE race=20260424-金沢-7   bet=4 winner=8
GANTZ signal 6: LOSE race=20260424-金沢-12  bet=2 winner=1
GANTZ signal 7: LOSE race=20260424-名古屋-8 bet=4 winner=3
```

---

## 18. Droid 第 2 回監査対応 (2026-04-26)

Phase 6 + Phase B 実装後、factory-droid に再度包括監査を依頼。
全件 Droid が直接コード修正 → TypeScript / Python 構文チェック PASS。

### 18-1. 修正済み (15 件)

| 重要度 | コード | 内容 |
|---|---|---|
| BLOCKER | B1 | `first_only` ソートを localeCompare → 分換算の数値比較に修正 |
| BLOCKER | B2 | `inFlightRef` で `bulk` モード時の Realtime ハンドラと effect 同時実行による二重投票を防止 |
| HIGH | H1 | `betAmount` を実投票額に統一 (UI 表示と DB の乖離解消)、`logBetHistory` に `betAmount?` 引数追加 |
| HIGH | H2 | `Orb` の `useId()` でインスタンス毎にユニークな SVG `linearGradient` ID を生成し衝突防止 |
| MEDIUM | M1 | `prevBetModeRef` でモード切替と signals 変化を区別、sequential モードで毎回スケジュール再構築する無駄を解消 |
| MEDIUM | M2 | migration 0006 (`ALTER TABLE bet_history REPLICA IDENTITY FULL`) を追加・適用 |
| MEDIUM | M3 | RaceList のデフォルト 'queued' バッジを非表示 (scheduleMap 不在のため) |
| MEDIUM | M4 | `lastViewedNotifTs` state で通知未読カウント実装 |
| LOW | L1 | `updateBetMode()` DB 保存失敗時に `setBetMode(prev)` でロールバック |
| LOW | L2 | GzWindow バージョンを `import.meta.env.VITE_APP_VERSION ?? 'v2.6.0'` に env 化 |
| LOW | L3 | History 収支グラフをデータ最大値で正規化 (除算ゼロ回避) |
| LOW | L4 | RaceDetail エラー画面を `display:flex` に修正 (grid + flexDirection 共存問題) |
| LOW | L5 | notification-store コメント修正 |
| LOW | L6 | update_bet_results.py で race_id key から日付抽出 (race_date 列なし対応) |
| LOW | L7 | `fetchTodaySignals` で JST 補正 (深夜 0-9 時の日付ズレ解消) |

### 18-2. 残存課題 (本番稼働には影響しない)
1. IPAT 認証情報 DB 平文保存 (`credentials_cipher`/`iv` 列未使用)
2. RaceList のスケジュール状態表示 (`scheduleMap` グローバル化が必要)
3. `gantzRecovery` の 100 円固定計算と管理者手動配信の推奨額の乖離
4. `race-mapper.ts` の多数フィールドが暫定値 (D-Logic データ接続前)
5. E2E テスト不在
6. IPAT 単勝以外の馬券セレクタ実機未検証 (GANTZ は単勝のみのため非該当)

---

## 19. リリースタグ (2026-04-26)

### `jinjinsansan/horse` `v1.1.0`
- コミット: `a9ef871`
- 内容: Phase 1〜6 + Phase B + Droid 監査全件対応
- 旧 `v1.0.0` (`a569ee14`, electron-updater 導入時) は温存

### `jinjinsansan/dlogic-agent` `horsebet-v1.0.0`
- コミット: `8959366`
- 内容: HorseBet 連携スクリプト一式
  - `push_gantz_to_horse.py`
  - `update_bet_results.py` (Phase 5 + Phase B)
  - systemd unit 4 ファイル

---

## 20. 全体サマリ (2026-04-26 時点 / 明日 09:01 JST 本番稼働前夜)

### 完成しているもの
- ✅ GANTZ → Supabase 自動転送 (VPS 09:01 JST cron)
- ✅ user-gui で Realtime 受信 → 投票モード 4 択
  (manual / bulk / first_only / sequential)
- ✅ 中央オーブの時刻ベース活性化 (発走 10 分前)
- ✅ BET 金額カスタマイズ (100〜50,000円)
- ✅ 個人投票結果反映 (12/18/23 時 cron)
- ✅ GANTZ 全体回収率の本日表示
- ✅ 履歴/収支ページ
- ✅ 通知ログ
- ✅ migration 0001〜0006 全適用済
- ✅ Droid 第 1 回 + 第 2 回監査対応

### 自動運用フロー
```
09:00 JST  GANTZ Telegram 配信 (anatou_post_strict.py)
09:01 JST  → bet_signals に upsert (push_gantz_to_horse.py / dlogic-push-gantz.timer)
            ↓ Supabase Realtime
            user-gui 受信 → 投票モード分岐
              · bulk: 即実行 (全件)
              · first_only: 即実行 (最早 1 件)
              · sequential: 5 分前まで予約
              · manual: 何もしない
発走 5 分前  → IPAT/SPAT4 自動投票 (Playwright) → bet_history (pending)
12/18/23 時  → race_results 照合 (update_bet_results.py / dlogic-update-bet-results.timer)
            → bet_history.bet_result 更新 (個人)
            → bet_signals.outcome_* 更新 (GANTZ 全体)
            → user-gui の右上回収率が Realtime で再計算
```

### 残作業 (jin さん側)
1. **明日 09:01 JST のリアル動作観察** (user-gui 起動状態維持)
2. **Phase 2 実機ライブテスト** (PHASE2_LIVE_TEST.md 参照、IPAT/SPAT4 100円×1点)
3. 何か問題が出たら git tag `v1.1.x` パッチで対応
