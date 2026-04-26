# Handoff: 競馬GANTZ — UI 案A (ORB STAGE)

## 概要 / Overview
競馬GANTZ の **会員向け GUI 全体を、案A「ORB STAGE」方向で実装するためのハンドオフ**。  
中央に大型の球体オーブを置き、四隅に HUD 情報を配置した没入型ダッシュボードを起点に、ログイン・レース一覧・レース詳細・設定・履歴・通知 までを 1 つのビジュアル言語で統一する。

ベースリポジトリ: https://github.com/jinjinsansan/horse  
（既存の VPS 24h 監視・IPAT/SPAT4 自動投票・D-Logic 解析・直近30日 60% 的中率という機能仕様はそのまま、UI のみを刷新）

## デザインファイルについて / About the Design Files
本フォルダの HTML/JSX 一式は **デザインリファレンス**（React + Babel ブラウザ実行のプロトタイプ）です。**そのまま production にコピーしないでください**。  
あなたのリポジトリ（horse）で採用している環境（Next.js / React + Tailwind 等）に合わせて、**この見た目と挙動を再現**してください。

実装の進め方:
1. このフォルダ全体を Claude Code に渡す（リポジトリ直下 `docs/design_handoff_orb_dashboard/` に置くのを推奨）
2. Claude Code に **「このハンドオフの README.md と参照 HTML を読み、本リポジトリのフレームワーク・コンポーネント体系に沿って実装して」** と依頼
3. デザイントークン (`tokens.css` を参考) を最初に CSS 変数 / Tailwind config として導入
4. 共通コンポーネント (Orb, GzWindow, MatrixBg, Corners, DataBar, Vertical) を先に作る
5. 画面を 1 枚ずつ実装

## フィデリティ / Fidelity
**High-fidelity（hifi）** — 色・タイポ・余白・アニメーションまで決定済み。**ピクセル単位で再現**してください。

## デザイントークン / Design Tokens
すべて `styles/gantz.css` の `:root` に定義済み。コピーして使えます。

### Color
| トークン | Hex | 用途 |
|---|---|---|
| `--gz-bg` | `#020805` | ベース背景（ほぼ黒） |
| `--gz-bg-2` | `#031208` | パネル背景 |
| `--gz-green` | `#00FF88` | プライマリ・ブランドグリーン |
| `--gz-green-dim` | `#00B85F` | 副次 |
| `--gz-green-glow` | `rgba(0,255,130,0.55)` | グロー（box-shadow / text-shadow） |
| `--gz-amber` | `#FFB400` | 警告・スケジュール時刻 |
| `--gz-red` | `#FF3B5C` | エラー・損失 |
| `--gz-text` | `#D7FFE9` | 本文テキスト |
| `--gz-text-muted` | `#5E8A73` | 補助テキスト |
| `--gz-text-dim` | `#3F6553` | さらに弱い情報 |
| `--gz-line` | `rgba(0,255,130,0.18)` | 罫線 |
| `--gz-line-strong` | `rgba(0,255,130,0.45)` | 強い罫線 |

### Typography
- **見出し（数字 / ラテン）**: `Orbitron` 700/900 — オーブ内・大きな数値・ロゴに  
  → CSS var: `--gz-display`
- **見出し（日本語）**: `Shippori Mincho` 700/900 — 「東京 11R」「天皇賞(秋)」「競馬GANTZ」など  
  → CSS var: `--gz-jp-serif`
- **本文（日本語）**: `Noto Sans JP` 400/500/700  
  → CSS var: `--gz-jp`
- **モノスペース / コード / オッズ表**: `JetBrains Mono` 400/500/700  
  → CSS var: `--gz-mono`

サイズスケール（px）: 9 / 10 / 11 / 12 / 13 / 14 / 16 / 18 / 22 / 26 / 32 / 36 / 42 / 56 / 64 / 92 / 100

### Spacing / Radius / Shadow
- 余白: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 22 / 24 / 28 / 32 px
- **角丸 = 0**（シャープな矩形 + コーナーマーカー）
- パネルシャドウ: `inset 0 0 0 1px var(--gz-line), 0 0 24px rgba(0,255,130,0.06)`
- グロー: `text-shadow: 0 0 8px var(--gz-green), 0 0 18px var(--gz-green-glow)`

## レイアウト / 画面一覧

ターゲット解像度: **1440×920**（横 1440 を最低想定。より大きい画面は中央寄せで OK）

### 1. ログイン (`screens/aux.jsx` → `LoginScreen`)
- 中央に大オーブ (420px) ＋ 右に SIGN IN フォーム（USER ID / PASSWORD / AUTHENTICATE ボタン）
- 左端「データが導く勝利」/ 右端「未来を予測せよ」を縦書きで配置
- 背景は `MatrixBg`（コード雨 30 列）
- 認証は Supabase Auth に接続

### 2. ダッシュボード (`screens/dashboard-a.jsx` → `DashboardA`) — **目玉画面**
3 カラムグリッド `280px 1fr 280px`:
- **左サイドバー**: 配信レース一覧（カードリスト、選択中はハイライト）+ ナビ（レース一覧/履歴/設定）
- **中央ステージ**:
  - ヘッダー: ユーザー名 + AUTO BET スイッチ + 通知バッジ
  - HUD 4 隅:
    - 左上 = 会場・レース名・推定3F・解析バー (SPEED/STAMINA/瞬発力/持続力/安定性)
    - 右上 = AI 予測確率（巨大数字）+ オッズ表（単勝1〜5番人気）+ 的中確率内訳
    - 左下 = 騎手・調教師テーブル + 縦書き「データが導く勝利」
    - 右下 = 過去10走の1着分布バー + 馬シルエット + コース図 + 縦書き「未来を予測せよ」
  - **中心 = 大型オーブ (420px)** に「競馬GANTZ」+ ターゲット馬番（巨大）+ 馬名 + 人気・推奨額
- **右サイドバー**: 本日成績パネル（的中率/投票数/的中数/回収率）+ EVENT LOG + システム状態
- フッター: 発射予定時刻 + 取消/詳細/手動投票ボタン
- 投票ボタン押下時 = 全画面オーバーレイで「EXECUTING SUBMIT」+ オーブパルス（2.2s）

### 3. レース一覧 (`RaceListScreen`)
3 列グリッドのカード。各カードに小オーブ (90px)・馬名・AI%・発射時刻。

### 4. レース詳細 (`RaceDetailScreen`)
2 カラム `1fr 360px`: 左=会場・レース名・4 KPI パネル + D-Logic 解析（10 軸データバー）+ 出走表テーブル / 右=大オーブ (280px) + GANTZ NOTE + 投票/取消ボタン

### 5. 設定 (`SettingsScreen`)
2×2 セクション: AUTO BET スイッチ / IPAT 認証情報 / SPAT4 認証情報 / SUBSCRIPTION & VERSION

### 6. 履歴・収支 (`HistoryScreen`)
4 KPI（投票/的中/的中率/回収率）+ 10日棒グラフ + 履歴テーブル

### 7. 通知 (`NotificationsScreen`)
左フィルタ + 右ログ。タイプ別アイコン（fire/submitted/win/signal/system）

## 共通コンポーネント / Components to extract first

`components/common.jsx` に実装済み。**先にこれらをポートしてください。**

| 名前 | 役割 |
|---|---|
| `MatrixBg` | 背景の縦流れコード雨（`density` props） |
| `CodeRain` | コード雨単体 |
| `GzWindow` | macOS 風ウィンドウ枠（赤黄緑ドット + タイトルバー + 走査線 + LIVE バッジ） |
| `Orb` | 球体オーブ（`size`、`pulsing` props）— **最も重要なコンポーネント** |
| `Corners` | コーナーマーカー（パネル4隅の L 字飾り） |
| `Vertical` | 縦書きテキスト（`writing-mode: vertical-rl`） |
| `DataBar` | スコア横バー（label + value 0-100 + 色） |
| `HorseSvg` | 馬シルエット SVG プレースホルダ |
| `CourseTrack` | コース図 SVG（小） |
| `DonutProgress` | 円形プログレス |

`styles/gantz.css` のクラス（`.gz-orb`, `.gz-panel`, `.gz-btn`, `.gz-btn-primary`, `.gz-badge`, `.gz-switch`, `.gz-table`, `.gz-input`, `.gz-label`, `.gz-glow`, `.gz-glow-strong`, `.gz-blink`, `.gz-dot`, `.gz-divider`, `.gz-corner` 等）もまるごと採用してください。

## インタラクション

- **AUTO BET スイッチ**: ON / OFF。ON 時は緑グローでパルス
- **レースカード選択**: 左サイドバー / 一覧で選んだ瞬間、中央ステージの全 HUD が切り替わる（無遷移）
- **オーブのパルス**: `pulsing` 時は 3 秒ループでブランドグリーンのグロー脈動（`@keyframes gz-orb-pulse`）
- **コード雨**: 各列が異なる速度で下降（`@keyframes gz-rain`、6〜18s）
- **走査線**: 全画面オーバーレイで `@keyframes gz-scan`（4s）
- **投票実行**: クリック → 全画面ぼかし + オーブ + "IPAT/SPAT4 へ送信中..._" → 2.2s 後にダッシュボードに戻る（実装では実際の API レスポンスで遷移）

## State Management

```ts
type Race = {
  id: number;
  signal_date: string;          // '2026-04-26'
  race_type: 'JRA' | 'NAR';
  jo_name: string;              // '東京'
  jo_code: string;
  race_no: number;
  race_name?: string;           // '天皇賞(秋)'
  distance: string;             // '芝2000m'
  course: 'A' | 'B' | 'C';
  total_horses: number;
  start_time: string;           // 'HH:MM'
  bet_type_name: string;        // '単勝'
  bet_type: number;
  suggested_amount: number;     // 100
  kaime_data: string[];         // ['7']
  horse_name: string;
  popularity: number;
  ai_prob: number;              // 78.6
  consensus: string;            // '4/4'
  engines: string;              // 'D+I+V+R'
  source: string;               // 'gantz_strict'
  status: 'active' | 'cancelled';
  odds: { win: number[] };
  jockey: string;
  trainer: string;
  estimated_3f: number;
  speed: 'S'|'A+'|'A'|'B+'|'B';
  stamina: 'S'|'A+'|'A'|'B+'|'B';
  schedule: 'queued' | 'scheduled' | 'submitted' | 'cancelled';
  fire_at: string;
  note: string;
};
```

## アセット
- `/uploads/keiba_gantz_E_400.png` — 元のブランドビジュアル参照
- 馬シルエット・コース図はすべて SVG（`HorseSvg` / `CourseTrack`）でインライン
- フォントは Google Fonts から自動読込

## 同梱ファイル
```
design_handoff_orb_dashboard/
├── README.md                          ← このファイル
├── UI Design.html                     ← 全画面プレビュー（design canvas で確認用）
├── styles/
│   └── gantz.css                      ← トークン + 共通クラス（コピペで使える）
├── components/
│   └── common.jsx                     ← Orb, GzWindow, MatrixBg, Corners, DataBar 他
├── data/
│   └── mock.js                        ← サンプルレース型 / 履歴 / 通知
└── screens/
    ├── dashboard-a.jsx                ← ★ 案A — 目玉実装
    ├── aux.jsx                        ← Login / RaceList / RaceDetail / Settings / History / Notifications
    └── (b, c は参考。本実装には不要)
```

## Claude Code への指示テンプレート

```
このリポジトリ (horse) のユーザー GUI を、design_handoff_orb_dashboard/ のデザインで全面リニューアルしたい。

1. README.md を読んで全体像を把握
2. styles/gantz.css のデザイントークンを、本リポジトリの CSS 変数 / Tailwind config に取り込む
3. components/common.jsx の Orb / GzWindow / MatrixBg / Corners / DataBar / Vertical を、本リポジトリの React 構成（関数コンポーネント + CSS Modules or Tailwind）に合わせて移植
4. screens/dashboard-a.jsx の DashboardA を /dashboard ルートとして実装
5. screens/aux.jsx の各画面を /login, /races, /races/[id], /settings, /history, /notifications として実装
6. 既存の Supabase / IPAT / SPAT4 / D-Logic との接続は現行ロジックを維持
7. レスポンシブは横 1440 以上を想定。下回る場合は中央寄せ
```
