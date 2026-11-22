# U1 セキュリティ設計

入力: [セキュリティ要件](../nfr-requirements/security-requirements.md)、[機能仕様](../functional-design/functional-spec.md)、[C1/C3連携仕様](../../../inception/contract-design/contract-summary.md)。

## 認証・認可

- HTTPS APIの全リクエストで署名・発行者・audience・有効期限を検証する。認証後のprincipalからサーバー側でvenueIdと権限を解決し、クライアント指定のvenueIdやbellIdを信用しない。
- 一般公開の自己登録を無効化した招待制認証を使う。Infrastructure DesignでCognito等の具体方式、招待担当、トークン発行者を確定する。
- API実行ロールは必要なテーブル操作と固定されたIoT commandsトピックへのpublishだけを許可する。IoTポリシーはPico固有証明書をそのデバイス固有トピックへ限定する。開発・本番のアカウントまたは環境設定を分離する。

## データ保護と入力境界

- ブラウザー/API、AWSサービス間、Pico/AWS IoTの通信をTLSで保護する。データストアとログはAWS管理暗号化を有効にし、秘密は実行ロールと保護された設定ストアからのみ取得する。
- サーバーは時間範囲、通知数、重複時刻、最小間隔、ringCount∈{1,2,3}、Idempotency-Key、expectedVersionを境界で検証する。余剰フィールドは契約に従い拒否する。
- Web UIはAPI由来文字列をテキストとして描画し、CSP等の標準セキュリティヘッダーを設定する。認証Cookieを使う構成ならSameSite/CSRF対策をInfrastructure Designで具体化する。
- ログやエラーからbearer token、証明書、AWS秘密、request payload全体、内部stackを除外する。公開エラーは安定コードと安全な説明に限定する。

## 監査

開始・変更・送信結果の監査記録には、許可されたprincipal識別子、venue/session/notification ID、時刻、結果コードだけを保存する。認証拒否や権限外操作を状態変更なしで記録し、保持は7日とする。実機証明書や秘密値を監査属性に含めない。

具体的な認証サービス、鍵管理、CookieかBearer tokenか、API保護のAWSリソースはInfrastructure Designで選定する。
