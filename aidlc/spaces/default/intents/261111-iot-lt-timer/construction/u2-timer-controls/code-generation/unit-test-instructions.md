# U2 テスト実行手順

## Framework and configuration

- Framework: root workspaceのVitest、React Testing Library、Testing Library user-event。
- Config: `vitest.config.ts`。coverage providerはV8、app/packagesを対象とし、lines 80% thresholdを維持する。
- U2 command: `npm run test:u2`。Step 2でroot `package.json`に `vitest run tests/unit/u2 tests/integration/u2` を実行するworkspace scriptを追加する。テストのない初期状態でもrunnerが起動することを確認してから、実装後の各layerテストを追加・実行する。
- Component test paths: `tests/unit/u2/`。Boundary integration paths: `tests/integration/u2/`。このUnit外のテストdirectoryを対象に含めない。

## Coverage and volume

Standard strategyとして、domain/data model、repository、TimerControl service、HTTP API、OperatorInterfaceそれぞれ5–8件の単体テストを用意する。repository/API、resume/wake recovery、pause/cancel/dispatcherの順序競合、screen/APIの重要境界にU2 scoped integration testsを追加する。

プロジェクトの品質floorはアプリケーション全体のline coverage 80%以上である。Build and Testが組み立て済みprojectの全test suiteで確認する。U2 scoped test commandだけで全体coverage floorを判定せず、既存thresholdを変更しない。

## Test doubles and data

- Clockはfake clockで固定し、deadline/expiry/lease boundaryを決定的にする。
- Repositoryはin-memory conditional-write fakeとAWS SDK client stubを使い、同時更新・transaction cancellation・TTL serializationを確認する。
- Step Functions clientは同一execution nameの再送、ExecutionAlreadyExists、曖昧応答、terminal failureをstubし、PicoやAWS credentialを要求しない。
- IoT clientはpublish受付、明確な拒否、応答不明、expiryをstubする。AWS受付を物理鳴動成功と扱わない。
- API authは有効principal、無認可principal、期限切れ/欠落tokenを用意し、venueIdはserver grantから解決されることを確認する。
- UIはReact Testing LibraryのDOMとkeyboard interactionで確認し、操作可能要素に`data-testid`を付け、320 CSS px・名前/状態・色以外の識別を検査する。

## Expected execution order

各layerを実装してからそのlayerのtestsを追加し、同じU2 scoped commandで実行する。最初にVitest configとU2 scriptの起動を確認し、その後domain/data behavior、repository、business logic、API、frontend behavior、integration boundaryの順に進める。
