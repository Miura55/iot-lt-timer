# 操作仕様
入力: [stories.md](../user-stories/stories.md)、[requirements.md](../requirements-analysis/requirements.md)、[team-practices.md](../practices-discovery/team-practices.md)。配置は[mockups.md](mockups.md)を参照。

## タブ
| Field | Value |
|---|---|
| Component | TimerTabs |
| Description | 進行と次回設定の切り替え |
| Category | navigation |
### States
defaultは進行。hoverは背景を薄青、focusは2px以上の青枠、選択は下線。初期取得中も設定下書きの表示は可能だがサーバー未確認の保存・開始は無効。errorはタブ外の状態メッセージで示す。
### Props / Inputs
activeTab: progress/settings、onSelect: 選択イベント、hasUnsavedChanges: boolean。初期値progress。
### Responsive Behaviour
全幅で2等分、高さ48px以上。320px〜デスクトップで意味を変えない。
### Accessibility
role tablist/tab/tabpanel、aria-selectedとaria-controls。左右矢印・Home/Endでフォーカスを動かし、Enter/Spaceで選択する手動選択。Tabでパネルへ進む。下書きは切替で破棄しない。
### Usage Example
進行を表示中に設定を選ぶと次回用の下書きを表示する。実行中タイマーは継続する。

## 残り時間
| Field | Value |
|---|---|
| Component | TimerDisplay |
| Description | サーバー状態に基づく残り時間と状態 |
| Category | display |
### States
emptyは未設定、loadingは読込中、defaultは開始前、running/paused/completed/cancelledを文字で区別。errorは最終更新時刻と古い表示の注記。hover/focusは操作対象ではないため不要。
### Props / Inputs
state: enum、remainingSeconds: numberまたは未取得、serverTime: UTC instant、lastUpdated: UTC instant。未取得を0に変えない。
### Responsive Behaviour
数字56〜80px、横幅を超えない。時刻はMM:SS、180分も表示可能な幅を取る。
### Accessibility
role timer。毎秒の読み上げは行わない。状態変化だけ別のaria-live politeで通知し、利用者が現在値を読み取れる名前を付ける。
### Usage Example
停止が受理されると固定値と「一時停止中」を表示する。ローカルの推測だけで停止済みにしない。

## 操作ボタン
| Field | Value |
|---|---|
| Component | TimerActions |
| Description | 開始・一時停止・再開・取消し |
| Category | input |
### States
default/hover/focus/disabled/loading/error。開始前は開始、実行中は一時停止、停止中は再開。active実行がある間に新規開始は不可。処理中は「停止しています」等の文章を付け二重押下を防ぐ。失敗は状態を再取得し、成功を推測しない。
### Props / Inputs
serverState: enum、pending: boolean、stale: boolean、onStart/onPause/onResume/onCancel。未確認またはstaleなら状態変更を無効化。
### Responsive Behaviour
高さ48px以上、主操作は全幅。取消しは別行で間隔16px。
### Accessibility
ネイティブbutton、Enter/Space。状態変更後も可能なら同じ意味の操作位置にフォーカスを保ち、完了なら結果見出しに移す。disabledの理由を近くに文章で示す。
### Usage Example
一時停止を押し、API受理後に残り時間を固定して再開ボタンへ更新する。

## 設定エディター
| Field | Value |
|---|---|
| Component | TimerSettings |
| Description | 次回の時間とベル設定を保存 |
| Category | input |
### States
emptyは初回、dirtyは未保存、loadingは保存中、errorはフィールドまたは通信エラー。上限で追加をdisabled。hover/focusは共通トークンを使う。
### Props / Inputs
durationMinutes/Seconds: 整数入力、bellRows: 最大10、savedSettings、onSave。秒は0〜59、合計は1〜10800秒。残り時間は0〜合計、重複不可、回数は1/2/3。
### Responsive Behaviour
狭幅は行を折り返す。入力欄はラベル付き、数値はinputmode numeric。長文は折り返す。
### Accessibility
fieldset/legendとlabel、aria-invalid/aria-describedby。blurと保存時に検証し入力中にフォーカスを奪わない。追加後は新しい行へ、削除後は次行または追加ボタンへフォーカスする。
### Usage Example
設定タブの下書きを保存し、成功してから保存済み内容を置き換える。タブ切替は保持し、ページ離脱時に未保存を警告する。認証切れでも同一タブの下書きを保持する。

## 通知結果
| Field | Value |
|---|---|
| Component | NotificationList |
| Description | サービスへの送信結果を示す |
| Category | feedback |
### States
empty、loading、populated、partial、error。予定/送信済み/送信失敗/期限切れ/取消し/結果不明。最大10件。各通知の時刻・回数・状態を表示する。
### Props / Inputs
notifications: array、lastUpdated、fetchError。デバイスACKやオンライン属性を要求しない。
### Responsive Behaviour
スマホはカード型の縦リスト。PCでも同じ順序、予定順を維持する。
### Accessibility
意味のあるlist、状態は文章、変化だけpoliteで通知。識別子や長い詳細は任意展開とし、秘密情報は含めない。
### Usage Example
送信成功時も「送信済み」と表示し「鳴動成功」と表示しない。

## 取消し確認
| Field | Value |
|---|---|
| Component | CancelDialog |
| Description | 未送信通知の不可逆な取消しを確認 |
| Category | feedback |
### States
closed/open/submitting/error。送信中は重複実行を防ぎ、失敗はダイアログに表示する。
### Props / Inputs
remainingSeconds、onConfirm、onClose、pending。
### Responsive Behaviour
幅は画面内、左右16px、長文は折り返す。必要なら内部をスクロール可能にする。
### Accessibility
dialog、aria-modal、見出し参照、フォーカストラップ。通常時はEscapeで閉じ戻るへ復帰。送信中のEscapeは処理を取り消さず、処理状態を説明する。結果確定後にダイアログを閉じ、取消結果へフォーカスする。
### Usage Example
戻るは副作用なし。キャンセルするは受理後に取消状態へ変わる。
