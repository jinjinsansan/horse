# SPAT4 元のソフトウェアの完全なフロー解析

## 🎯 目的
元のfrmSpat4.csのロジックを100%忠実に再現するための完全な設計書

---

## 📊 ステートマシン

```
LOGIN_INITIAL (iinLogin=0)
    ↓ ログインフォーム送信
LOGIN_COMPLETED (iinLogin=1)
    ↓ 日付・競馬場確認 → 「オッズ投票」クリック
ODDS_PAGE (P120S)
    ↓ フレームセット展開
SETTING_KAIME (P122S/P121S)
    ↓ 馬番クリック → 金額設定 → 繰り返し
ALL_KAIME_SET (iinLogin=1, iin_kaime_idx > max)
    ↓ 暗証番号入力 → 投票確認へ
VOTE_CONFIRM (iinLogin=2)
    ↓ KYOUSEI ボタンクリック
VOTE_COMPLETED
```

---

## 🔄 詳細フロー

### 1. LOGIN_INITIAL (iinLogin = 0)
**URL**: `https://www.spat4.jp/keiba/pc`

**処理**:
```typescript
1. かんたんログインのチェックを外す
   - name="BSLI" の checked 属性を削除
   
2. 認証情報を入力
   - name="MEMBERNUMR" に加入者番号
   - name="MEMBERIDR" に利用者ID
   
3. ログイン実行
   - forms["LOGIN"].submit()
   
4. ステート更新
   - iinLogin = 1
```

---

### 2. LOGIN_COMPLETED (iinLogin = 1)
**URL**: `https://www.spat4.jp/keiba/pc?HANDLERR=P001S`

**処理**:
```typescript
1. iin_kaime_idx チェック
   if (iin_kaime_idx <= istBetInfo.length - 1) {
     return; // まだ買い目設定中
   }
   
2. 日付確認
   - span.className="date" から日付取得
   - istBetInfo[1].kaisaiDate と一致チェック
   
3. 競馬場確認
   - span.className="race_name" から競馬場名取得
   - istBetInfo[1].joName と一致チェック
   - 違う場合: a[innertext=競馬場名].click() → 再読み込み
   
4. 「オッズ投票」リンクを探す
   - table[summary="出走表"] から検索
   - tr > td > a を走査
     - a.innerText == "{raceNo}R" を見つけたら次のフラグを立てる
     - 次の a.innerText == "オッズ投票" をクリック
   
5. ステート更新
   - iin_kaime_idx = 1
```

---

### 3. ODDS_PAGE (P120S)
**URL**: `https://www.spat4.jp/keiba/pc?HANDLERR=P120S`

**フレームセット構造**:
```
P120S (親フレーム)
├─ P122S: オッズ画面（馬番クリック用）
├─ P121S: 金額入力画面
└─ その他
```

**処理**:
```typescript
1. 取消馬番の取得（初回のみ）
   if (arrTorikesiUmaban == null) {
     arrTorikesiUmaban = get_torikesi_umaban();
     del_torikesi_kaime(); // 取消馬を含む買い目を削除
   }
   
2. odds_bet() を実行
   - 戻り値が -1 の場合: エラー
```

---

### 4. odds_bet() - オッズ画面で馬番クリック

**処理フロー**:

#### 4.1 フレーム検索
```typescript
for (const frame of page.frames()) {
  // P122S フレームを探す
  if (frame.url().includes('HANDLERR=P122S') || 
      frame内に式別テキストが存在) {
    // このフレームで処理
  }
}
```

#### 4.2 オッズテーブル取得
```typescript
const oddsTable = frame.locator('table.tbl_01.tbl_01_odds');
if (!oddsTable) continue;
```

#### 4.3 単勝・複勝の場合
```typescript
if (betType === '単勝' || betType === '複勝') {
  const targetUmaban = kaime[1]; // 馬番
  
  // テーブルの各行を走査
  for (const tr of table.locator('tr').all()) {
    let foundUmaban = false;
    let targetColumn = 0; // 1=単勝, 2=複勝
    
    // tdを走査して馬番を探す
    for (const td of tr.locator('td').all()) {
      if (td.outerHTML().includes('waku')) continue;
      
      if (isNumeric(td.innerText()) && td.innerText() == targetUmaban) {
        if (tr.innerHTML().includes('clickOddsBet')) {
          foundUmaban = true;
          targetColumn = (betType === '単勝') ? 1 : 2;
          break;
        }
      }
    }
    
    if (foundUmaban) {
      // aタグを探してクリック
      let count = 0;
      for (const a of tr.locator('a').all()) {
        if (a.outerHTML().includes('clickOddsBet')) {
          count++;
          if (count === targetColumn) {
            const value = extractClickOddsBetParam(a.outerHTML());
            arrAnchorText.push(value);
            
            await a.click(); // 馬番クリック！
            lin_umaban_click = 1;
            return 0;
          }
        }
      }
    }
  }
}
```

#### 4.4 その他の馬券種類
```typescript
else {
  // すべての a[clickOddsBet] を探す
  for (const a of table.locator('a').all()) {
    if (a.outerHTML().includes('clickOddsBet')) {
      const value = extractClickOddsBetParam(a.outerHTML());
      
      if (!arrAnchorText.includes(value)) {
        arrAnchorText.push(value);
        await a.click(); // 馬番クリック！
        lin_umaban_click = 1;
        return 0;
      }
    }
  }
  
  // すべてクリック済み → 式別を変更
  iin_chg_toshiki_idx++;
  const shikiSelect = frame.locator('[name="SHIKILINK"]');
  
  for (const option of shikiSelect.locator('option').all()) {
    if (option.innerText().trim() === lst_chg_toshiki_list[iin_chg_toshiki_idx]) {
      await option.click();
      await shikiSelect.dispatchEvent('change');
      ibo_toshiki_chg = true;
      return 1;
    }
  }
}
```

---

### 5. 金額入力画面 (P121S) - lin_umaban_click == 1

**URL**: `https://www.spat4.jp/keiba/pc?HANDLERR=P122S` または `#`

**処理**:
```typescript
lin_umaban_click = 0;

// P121S フレームを探す
for (const frame of page.frames()) {
  if (frame.url().includes('HANDLERR=P121S')) {
    
    // 金額入力欄を探す
    let count = 0;
    for (const input of frame.locator('input').all()) {
      if (input.getAttribute('className') === 'TEXTMONEY al-right') {
        count++;
        
        if (iin_kaime_idx === count) {
          // 金額を設定
          const amount = Math.floor(istBetInfo[iin_kaime_idx].kingaku / 100);
          await input.fill(amount.toString());
          
          // 式別コードを取得
          const shikiCode = getShikiCode(istBetInfo[iin_kaime_idx].betType);
          
          // 親要素から式別・馬組入力欄を探す
          const parent = input.locator('xpath=../..'); // 2階層上
          
          for (const inp of parent.locator('input').all()) {
            const className = inp.getAttribute('className');
            
            if (className === 'SHIKI') {
              await inp.setAttribute('value', shikiCode);
            }
            
            if (className === 'UMAKUMISTR') {
              // 馬組を16進数文字列に変換
              const kaime1 = parseInt(istBetInfo[iin_kaime_idx].kaime[1]);
              const kaime2 = parseInt(istBetInfo[iin_kaime_idx].kaime[2]);
              const kaime3 = parseInt(istBetInfo[iin_kaime_idx].kaime[3]);
              
              const umakumiStr = 
                kaime1.toString(16).padStart(4, '0') +
                kaime2.toString(16).padStart(4, '0') +
                kaime3.toString(16).padStart(4, '0');
              
              await inp.setAttribute('value', umakumiStr.toUpperCase());
            }
          }
          
          iin_kaime_idx++;
          
          if (iin_kaime_idx > istBetInfo.length - 1) {
            // すべての買い目設定完了 → 投票確認へ
            const confirmBtn = frame.locator('input[value="投票内容確認へ"]');
            await page.waitForTimeout(1000);
            await confirmBtn.click();
            return;
          } else {
            // 次の買い目を設定
            const result = await odds_bet();
            if (result === -1) {
              throw new Error('馬番が選択できません');
            }
            return;
          }
        }
      }
    }
    break;
  }
}
```

---

### 6. 投票確認画面 (iinLogin: 1 → 2)

**URL**: `https://www.spat4.jp/keiba/pc` (再度戻る)

**処理**:
```typescript
if (iinLogin === 1 && iin_kaime_idx > istBetInfo.length - 1) {
  iinLogin = 2;
  
  // 暗証番号入力
  const passwordInput = page.locator('[name="MEMBERPASSR"]');
  await passwordInput.fill(password);
  
  // 合計金額を取得して設定
  const betTable = page.locator('#BET_TBL');
  let totalAmount = '';
  
  for (const tr of betTable.locator('tr').all()) {
    let foundLabel = false;
    for (const td of tr.locator('td').all()) {
      if (td.innerText().trim() === '合計金額') {
        foundLabel = true;
      } else if (foundLabel && td.innerText().includes('円')) {
        totalAmount = td.innerText().trim()
          .replace('円', '')
          .replace(',', '');
        break;
      }
    }
    if (totalAmount) break;
  }
  
  // 合計金額を設定
  const totalInput = page.locator('[name="TOTALMONEYR"]');
  await totalInput.fill(totalAmount);
  
  // 投票実行
  const kyouseiBtn = page.locator('[name="KYOUSEI"]');
  await kyouseiBtn.click();
}
```

---

### 7. 投票完了 (iinLogin = 2)

**URL**: `https://www.spat4.jp/keiba/pc` (最終画面)

**処理**:
```typescript
if (iinLogin === 2) {
  // HTMLを保存
  const bodyHtml = await page.locator('body').innerHTML();
  await saveHtml(filepath, bodyHtml);
  
  // エラーチェック
  if (bodyHtml.includes('購入限度額を超えています')) {
    throw new Error('購入限度額を超えています');
  }
  
  return {
    success: true,
    message: 'SPAT4投票は正常終了しました'
  };
}
```

---

## 🔑 重要な定数・データ

### 式別リスト
```typescript
const LST_CHG_TOSHIKI_LIST = [
  '単勝複勝',
  '馬単',
  '三連単',
  '馬複',
  'ワイド',
  '三連複',
  '枠複枠単'
];

const LST_CHG_TOSHIKI_LIST_TEXT = [
  '単勝式・複勝式オッズ',
  '馬番連勝単式オッズ',
  '三連勝単式オッズ',
  '馬番連勝複式オッズ',
  'ワイドオッズ',
  '三連勝複式オッズ',
  '枠番連勝複式オッズ'
];
```

### 式別コード
```typescript
function getShikiCode(betType: string): string {
  switch (betType) {
    case '枠連': return '3';
    case '馬連': return '5';
    case '馬単': return '6';
    case 'ワイド': return '7';
    case '３連複': return '8';
    case '３連単': return '9';
    default: return '';
  }
}
```

---

## 📝 実装時の注意点

1. **フレーム操作**
   - `page.frames()` で全フレームを取得
   - `frame.url()` でフレームURLを確認
   - `frame.locator()` でフレーム内要素を操作

2. **タイムアウト設定**
   - 各ステップで適切な待機時間
   - フレーム読み込み: 2-3秒
   - ボタンクリック後: 1-2秒

3. **エラーハンドリング**
   - 各ステップで詳細なログ出力
   - 要素が見つからない場合の適切なエラーメッセージ

4. **状態管理**
   - ステート変数を正確に管理
   - DocumentCompleted イベント相当のタイミングで処理

---

作成日: 2025-11-25
