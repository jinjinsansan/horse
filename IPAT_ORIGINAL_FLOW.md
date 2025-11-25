# IPAT自動投票の元のフロー（frmIPAT.cs解析）

## 概要

元のC#アプリケーション（frmIPAT.cs, 2316行）のIPAT自動投票ロジックを完全に解析したドキュメント。
SPAT4と同様に、WebBrowserコントロール + Timerによるステートマシンで実装されている。

---

## ステート定義（IpatAutoStat enum）

```csharp
public enum IpatAutoStat
{
    non,                          // 0: 待機
    web_navigate,                 // 1: サイトへ移動
    vote_menu,                    // 2: 投票メニュー
    vote_menu2,                   // 3: 投票メニュー（重要なお知らせOK後）
    vote_race_select,             // 4: レース選択
    vote_race_select2,            // 5: レース選択確認
    vote_race_select3,            // 6: レース選択確定
    vote_race_select4,            // 7: レース番号選択
    kaime_input_init_chk,         // 8: 買い目入力初期化チェック
    kaime_input_init_chk2,        // 9: 買い目入力初期化チェック2
    kaime_input_jomei_chk,        // 10: 場名チェック
    kaime_input_jomei_chk2,       // 11: 場名チェック2
    kaime_input_jomei_chk3,       // 12: 場名チェック3
    kaime_input_race_chk,         // 13: レース番号チェック
    kaime_input_race_chk2,        // 14: レース番号チェック2
    kaime_input_race_chk3,        // 15: レース番号チェック3
    kaime_input_shikibetsu_chk,   // 16: 式別チェック
    kaime_input_shikibetsu_chk2,  // 17: 式別チェック2
    kaime_input_shikibetsu_chk3,  // 18: 式別チェック3
    kaime_input_method_chk,       // 19: 方式チェック
    kaime_input_method_chk2,      // 20: 方式チェック2
    kaime_input_method_chk3,      // 21: 方式チェック3
    kaime_input_chk,              // 22: 買い目入力チェック
    kaime_input_set,              // 23: 買い目設定
    kaime_input_select,           // 24: 買い目選択
    kaime_input_set_gmn,          // 25: 買い目設定画面
    kaime_input_set_chk,          // 26: 買い目設定チェック
    kaime_input_set_next,         // 27: 次の買い目へ
    kaime_input_end,              // 28: 買い目入力終了
    kaime_list_chk,               // 29: 買い目リストチェック
    kaime_vote_confirm,           // 30: 投票確認
    kaime_vote_end,               // 31: 投票完了
    end_stat                      // 32: 終了
}
```

---

## フロー詳細

### 1. ログイン（web_navigate → vote_menu）

```typescript
// web_navigate
URL: https://www.ipat.jra.go.jp/
処理: WebBrowserでIPATトップページに移動

// DocumentCompleted後
フォーム: name="loginForm"
入力項目:
  - input[name="inetid"]: 加入者番号（Internet ID）
  - input[name="usercd"]: ユーザーコード
  - input[name="passwd"]: パスワード
  - input[name="pars_cd"]: 暗証番号（PIN）
  
送信: form.submit()

// vote_menu
確認: body.InnerText.IndexOf("誤りがあります") → ログイン失敗
確認: body.InnerText.IndexOf("重要なお知らせ") → OKボタンクリック（vote_menu2へ）
```

### 2. 投票メニュー（vote_menu2 → vote_race_select）

```typescript
// 「出馬表から馬を選択する方式です」ボタンを探す
セレクタ: button[title*="出馬表から馬を選択する方式です"]
条件: disabled属性がない、またはdisabled != "disabled"

クリック → vote_race_selectへ
```

### 3. レース選択（vote_race_select → vote_race_select4）

```typescript
// vote_race_select
「このまま進む」ボタンを探す
  → ipat-error-windowが非表示の場合のみクリック

// vote_race_select2, vote_race_select3
競馬場ボタンを探す
  セレクタ: button[onclick*="vm.selectCourse("]
  条件: InnerText に競馬場名が含まれる（例: "東京"）
  条件: 開催日の曜日が一致（例: "土"）
  
  例: <button onclick="vm.selectCourse(...">東京 土</button>
  
  クリック → vote_race_select4へ

// vote_race_select4
レース番号ボタンを探す
  セレクタ: button[onclick*="vm.selectRace("]
  条件: InnerText に "R" が含まれる（例: "11R"）
  
  例: <button onclick="vm.selectRace(11)">11R</button>
  
  クリック → kaime_input_init_chkへ
```

### 4. 買い目入力初期化（kaime_input_init_chk → kaime_input_chk）

```typescript
// kaime_input_init_chk
場名の確認:
  セレクタ: span または div に競馬場名が含まれる
  一致しない場合: エラー「場名が異なります」

// kaime_input_jomei_chk
レース番号の確認:
  セレクタ: span または div に "XR" が含まれる
  一致しない場合: エラー「レース番号が異なります」

// kaime_input_race_chk
式別の選択:
  セレクタ: button[onclick*="vm.selectBetType("]
  条件: InnerText に馬券種類名が含まれる（例: "3連単"）
  
  例: <button onclick="vm.selectBetType(8)">3連単</button>
  
  クリック → kaime_input_shikibetsu_chkへ

// kaime_input_shikibetsu_chk
方式の選択:
  セレクタ: button[onclick*="vm.selectMethod("]
  条件: methodパラメータが一致
  
  例: method=301 → "フォーメーション"
  例: method=101 → "ながし"
  
  クリック → kaime_input_method_chkへ

// kaime_input_method_chk → kaime_input_chkへ遷移
```

### 5. 馬番選択（kaime_input_chk → kaime_input_set）

```typescript
// kaime_input_chk
取消馬番の取得（初回のみ）:
  セレクタ: img[src*="baken_torikeshi.png"]
  親要素から馬番を抽出
  
  取消馬を含む買い目を除外

// kaime_input_select
馬番ボタンを探す:
  セレクタ: button[onclick*="vm.selectUma("]
  
  買い目の形式に応じて選択:
    - 単勝・複勝: 1頭のみ
    - 馬連・馬単・ワイド: 2頭
    - 3連複・3連単: 3頭
  
  例: <button onclick="vm.selectUma(1, 0)">1</button>
  
  各馬番をクリック（iin_umaban_select_interval間隔で）

// kaime_input_set
金額入力:
  セレクタ: input[ng-model="vm.kingaku"]
  値: 買い目の金額（istBetInfo[idx].kingaku）
  
  例: <input ng-model="vm.kingaku" value="100">

「買い目に追加」ボタン:
  セレクタ: button[ng-click*="vm.addKaime()"]
  
  クリック → kaime_input_set_chkへ
```

### 6. 買い目リスト確認（kaime_list_chk → kaime_vote_confirm）

```typescript
// kaime_list_chk
買い目リストの確認:
  セレクタ: div[ng-repeat*="kaime in vm.kaimeList"]
  
  リスト内容を確認:
    - 競馬場名
    - レース番号
    - 馬券種類
    - 馬番
    - 金額
  
  全ての買い目が正しく追加されているか確認

合計金額の計算:
  すべての買い目の金額を合計
  
「投票内容を確認」ボタン:
  セレクタ: button[ng-click*="vm.confirmKaime()"]
  
  クリック → kaime_vote_confirmへ
```

### 7. 投票確認・実行（kaime_vote_confirm → kaime_vote_end）

```typescript
// kaime_vote_confirm
投票内容の最終確認:
  画面に表示される投票内容を確認
  
暗証番号（PIN）の入力:
  セレクタ: input[name="暗証番号"] または input[ng-model*="pin"]
  値: istrPARSCD（設定画面で入力したPIN）

「この内容で投票」ボタン:
  セレクタ: button[ng-click*="vm.vote()"]
  
  クリック → kaime_vote_endへ

// kaime_vote_end
投票完了確認:
  セレクタ: body.InnerText.IndexOf("投票が完了しました")
  
  成功: end_statへ
  失敗: エラーメッセージを取得
```

---

## 重要な実装ポイント

### 1. Timerベースのステートマシン

```csharp
// Timer1_Tick()で100msごとに状態をチェック
Timer1.Tag = IpatAutoStat.next_state;  // 次の状態を設定
Timer1.Interval = 100;  // 次回実行までの間隔（ms）
```

### 2. ClickAction()関数

```csharp
private void ClickAction(
    HtmlElement obj,  // クリックする要素
    IpatAutoStat ipat_auto_stat,  // 次の状態
    string event_name = "",  // 発火させるイベント（"click", "change"）
    int ain_interval = 1000  // 待機時間（ms）
)
{
    ilo_timer_cnt = 0;
    Timer1.Tag = ipat_auto_stat;
    
    if (obj != null) {
        if (event_name == "change") {
            obj.InvokeMember("fireEvent", "onchange");
        } else {
            obj.InvokeMember("click");
        }
    }
    
    Timer1.Interval = ain_interval;
}
```

### 3. 取消馬番の考慮

```csharp
// 画像から取消馬番を抽出
foreach (HtmlElement img in WebBrowser1.Document.GetElementsByTagName("img")) {
    if (img.GetAttribute("src").IndexOf("baken_torikeshi.png") >= 0) {
        // 親要素から馬番を取得
        HtmlElement parent = img.Parent;
        string umaban = parent.InnerText;  // 例: "1"
        arrTorikeshiUmaban.Add(umaban);
    }
}

// 取消馬を含む買い目をスキップ
foreach (string kaime_umaban in kaime) {
    if (arrTorikeshiUmaban.Contains(kaime_umaban)) {
        continue;  // この買い目はスキップ
    }
}
```

### 4. エラーハンドリング

```csharp
// ログイン失敗
if (body.InnerText.IndexOf("誤りがあります") >= 0) {
    lblGuidance.Text = "設定されたログイン情報ではログインできません。";
    return;
}

// 投票時間外
if (button.GetAttribute("disabled") == "disabled") {
    lblGuidance.Text = "投票時間外です。";
    return;
}

// 日付不一致
if (kaisai_date != target_date) {
    lblGuidance.Text = "開催日が異なります。";
    return;
}
```

---

## HTMLセレクタ一覧

| 要素 | セレクタ | 説明 |
|------|---------|------|
| ログインフォーム | `form[name="loginForm"]` | ログイン画面のフォーム |
| 加入者番号 | `input[name="inetid"]` | Internet ID |
| ユーザーコード | `input[name="usercd"]` | ユーザーコード |
| パスワード | `input[name="passwd"]` | パスワード |
| PIN | `input[name="pars_cd"]` | 暗証番号 |
| 投票方式ボタン | `button[title*="出馬表から馬を選択する方式です"]` | 出馬表方式選択 |
| 競馬場ボタン | `button[onclick*="vm.selectCourse("]` | 競馬場選択 |
| レース番号ボタン | `button[onclick*="vm.selectRace("]` | レース番号選択 |
| 馬券種類ボタン | `button[onclick*="vm.selectBetType("]` | 式別選択 |
| 方式ボタン | `button[onclick*="vm.selectMethod("]` | フォーメーション等選択 |
| 馬番ボタン | `button[onclick*="vm.selectUma("]` | 馬番選択 |
| 金額入力 | `input[ng-model="vm.kingaku"]` | 金額入力欄 |
| 買い目追加ボタン | `button[ng-click*="vm.addKaime()"]` | 買い目リストに追加 |
| 投票確認ボタン | `button[ng-click*="vm.confirmKaime()"]` | 投票内容確認 |
| 投票実行ボタン | `button[ng-click*="vm.vote()"]` | この内容で投票 |
| 取消馬画像 | `img[src*="baken_torikeshi.png"]` | 取消馬アイコン |

---

## 馬券種類と方式の対応

### 馬券種類（betTypeNo）

| betTypeNo | 馬券名 | 英語名 |
|-----------|-------|-------|
| 1 | 単勝 | Win |
| 2 | 複勝 | Place |
| 3 | 枠連 | Bracket Quinella |
| 4 | 馬連 | Quinella |
| 5 | ワイド | Quinella Place |
| 6 | 馬単 | Exacta |
| 7 | 3連複 | Trio |
| 8 | 3連単 | Trifecta |

### 方式（method）

| method | 方式名 |
|--------|-------|
| 101 | ながし |
| 201 | ボックス |
| 301 | フォーメーション |

---

## まとめ

IPATの投票フローは以下の32ステートで構成される複雑なステートマシン：

1. **ログイン**: web_navigate → vote_menu → vote_menu2
2. **レース選択**: vote_race_select → vote_race_select2/3/4
3. **買い目設定**: kaime_input_init_chk → ... → kaime_input_set
4. **買い目追加**: kaime_input_set_chk → kaime_input_set_next
5. **投票確認**: kaime_list_chk → kaime_vote_confirm
6. **投票実行**: kaime_vote_end → end_stat

SPAT4と同様に、Timerベースでステート遷移を管理し、各ステートでHTML要素を検索・操作する実装になっている。
