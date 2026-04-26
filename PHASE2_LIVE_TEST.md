# Phase 2 ライブテスト手順書

最終更新: 2026-04-26

## 目的

Phase 2 で行ったコード修正（単勝バグ fix）が、実際の IPAT（JRA）／ SPAT4（NAR）で動作することを確認する。

## 修正内容（コード差分まとめ）

| ファイル | 変更 |
|---|---|
| `shared/automation/ipat-voter.ts` | `inputKaimeTanFuku()` 新設（単勝・複勝で1頭だけクリック） |
| `shared/automation/ipat-voter.ts` | `selectUmabans()` の `for (let i = 1; ...)` を `i = 0` 開始に修正 |
| `user-gui/electron/services/bet-executor.ts` | 単勝(1)/複勝(2) で `method = 0`、それ以外は 301 |

## 前提

- HorseBet GUI の Electron アプリが起動できる状態
- IPAT（JRA）: 加入者番号・ユーザーコード・パスワード・PIN（暗証番号）を持つ jin さん本人のアカウント
- SPAT4（NAR）: 加入者番号・利用者ID・暗証番号を持つ jin さん本人のアカウント
- 当日に開催レースがあること（JRA は土日のみ、NAR は平日中心）

---

## 1. 事前ビルド

```powershell
cd E:\dev\Cusor\horse\horsebet-system\shared
npm run build

cd E:\dev\Cusor\horse\horsebet-system\user-gui
npm run dev
```

起動して、ログインまでできることを確認。

---

## 2. 認証情報の登録

1. Electron アプリで `goldbenchan@gmail.com` でログイン
2. 左下「設定」をクリック
3. **IPAT 認証情報** に jin さんのもの:
   - 加入者番号（P で始まる10桁）
   - ユーザーコード（4桁）
   - パスワード
   - PIN（4桁）
4. **SPAT4 認証情報** に jin さんのもの:
   - 加入者番号
   - 利用者ID
   - 暗証番号
5. 保存

> ⚠️ Settings.tsx の UI レイアウトは Phase 4 で修復予定。現状フィールドが入り乱れているが、ラベルを頼りに正しい欄に入力すれば DB は正しく保存される。

---

## 3. テスト配信を作成

bridge を待たず、admin-panel から手動でテスト配信を作成する。

```powershell
# 別ターミナル
cd E:\dev\Cusor\horse\horsebet-system\admin-panel
npm run dev
```

http://localhost:3000 で `goldbenchan@gmail.com` ログイン → 「新規配信」

### テスト 1: IPAT 単勝（JRA）

| 項目 | 値 |
|---|---|
| 開催日 | 当日（JRA 開催日） |
| 種別 | JRA |
| 競馬場 | 当日開催している場（例: 東京） |
| レース番号 | **既に投票締切済 or 開始 5 分以内のレースは避ける** — 中盤のレース推奨 |
| 馬券種類 | **単勝** |
| 方式 | 0 |
| 推奨金額 | **100** |
| 買い目 | 馬番1つ（例: `5`） |
| メモ | `Phase 2 IPAT テスト` |

「配信する」をクリック → admin-panel ダッシュボードに反映 → user-gui ダッシュボードにも Realtime で出現

### テスト 2: SPAT4 単勝（NAR）

NAR が開催している日に同様。種別を NAR、競馬場を NAR の場（例: 大井）に。

---

## 4. 投票実行

user-gui ダッシュボードの新着シグナルを選択 → **「手動で投票」** をクリック

### 期待される動作

1. Playwright が起動（`headless: false` なのでブラウザウィンドウが見える）
2. IPAT 用 → `https://www.ipat.jra.go.jp/` に遷移、ログインフォーム自動入力 → submit
3. 「出馬表から馬を選択する方式です」ボタンをクリック
4. 競馬場 → レース番号 → 式別「単勝」を順次選択
5. **修正済の `inputKaimeTanFuku()`** が呼ばれ、`#select-list-tan-5` （5番馬）をクリック
6. 金額 100円 が入力される
7. 「セット」ボタンクリック
8. 「投票内容を確認」 → PIN 入力 → 「この内容で投票」
9. 「投票が完了しました」表示 → ブラウザ終了
10. user-gui に「投票が完了しました」表示
11. Supabase の `bet_history` に行が追加されている（`bet_result='pending'`）

### SPAT4 の場合の差分

- ログイン: 加入者番号・利用者ID・暗証番号
- 「単勝・複勝オッズ」テーブルから 5 番の単勝列をクリック
- P202S 投票確認画面で「OK」
- 完了

---

## 5. 結果検証

### 失敗しがちなポイント

| 症状 | 確認 |
|---|---|
| `馬番ボタン #select-list-tan-5 が見つかりません` | IPAT の HTML が変わった可能性。実 HTML を DevTools で確認し、`shared/automation/ipat-voter.ts:inputKaimeTanFuku` の `idPrefix` を実値に直す |
| ログインで「誤りがあります」 | 設定画面の認証情報を再確認 |
| 「投票時間外です」 | 投票締切後 or 開催日違い。配信の signal_date をチェック |
| `セット` ボタンが無効 | 馬番クリックが失敗している。スクリーンショット確認 |
| Playwright ブラウザが起動しない | アプリ初期化でブラウザがダウンロード済か確認（Settings 画面に表示） |

### スクリーンショット保存（追加デバッグ用）

`shared/automation/ipat-voter.ts` の `vote()` の catch 句に以下を入れて、失敗時の画面を取得すると原因特定が早い：

```typescript
} catch (error) {
  if (this.page) {
    const path = `ipat-error-${Date.now()}.png`;
    await this.page.screenshot({ path, fullPage: true }).catch(() => {});
    this.log(`Screenshot saved: ${path}`);
  }
  // ...
}
```

これは恒久対応にしてもよい（Phase 5 候補）。

---

## 6. 成功基準

- IPAT 単勝 100円 が `bet_result='pending'` で `bet_history` に記録される
- SPAT4 単勝 100円 も同様
- 翌日以降、結果反映スクリプト（Phase 5 で導入予定）が走れば `bet_result` が `win`/`lose` に更新される

成功したら計画書の Phase 2 ステータスを ✅ に更新する。

---

## 7. 実施記録

| 日時 | テスト | 結果 | メモ |
|---|---|---|---|
| (未実施) | IPAT 単勝 | — | — |
| (未実施) | SPAT4 単勝 | — | — |
