# U2 セキュリティ要件

入力: [U2機能仕様](../functional-design/functional-spec.md)、[U2業務ルール](../functional-design/rules.md)、[requirements.md](../../../inception/requirements-analysis/requirements.md)、[contract-summary.md](../../../inception/contract-design/contract-summary.md)。

| ID | 要件 | 検証 |
|---|---|---|
| NFR3.1 | Pause/Resume/Cancel APIはHTTPSのみで提供し、有効な認証principalを各要求で検証する。一般自己登録を有効化しない。 | API境界試験で未認証・期限切れtokenを401、無権限principalを403にし、副作用がないことを確認する。 |
| NFR3.2 | 状態変更にはvenue-scoped `operate` permissionを要求する。clientが送るvenueIdを信頼せず、認証済み許可から会場を解決する。 | read-only grantでは制御が403となるテスト、別会場IDを使った直接要求の拒否試験を行う。 |
| NFR3.3 | Idempotency-KeyはUUID、sessionId・route・expectedVersion・principal・会場と結び付けて保存する。ログと操作receiptにtoken、証明書、secret、要求本文の秘密情報を含めない。 | 保存・ログ出力を検査し、資格情報の文字列が出ないことを確認する。 |
| NFR3.4 | 状態変更とnotification claimの競合制御で、古いversion / generationの要求や起床が状態を更新・送信できない。 | stale version、旧generation wake、重複key、別body再利用を含む認可・競合試験を実施する。 |

継承する設計案はTypeScript API、Cognito等の招待制認証、DynamoDB条件付き更新であり、具体的なサービス設定はInfrastructure Designに従う。
