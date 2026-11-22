# U1 単体・境界テスト手順

## Framework and configuration

Node.js/TypeScriptのnpm workspaces、Vitest、Testing Library、AWS SDK client mocks、およびAWS CDK assertionsを使用する。テストは`tests/unit/u1/`と`tests/integration/u1/`に限定して配置し、他Unitのテストは実行しない。

## Unit-scoped commands

テストランナー導入直後、まだテストがない状態でも実行できる準備確認コマンド:

```sh
npm exec vitest -- run --passWithNoTests tests/unit/u1
```

このU1の全単体・境界結合テスト:

```sh
npm exec vitest -- run tests/unit/u1 tests/integration/u1
```

U1のCDK assertion:

```sh
npm exec vitest -- run tests/unit/u1/infra
```

## Coverage

U1実装対象のTypeScript/JavaScript行カバレッジ目標は80%以上。全プロジェクト共通の80% floorはBuild and Testで組み立て済みの全テストを使って確認する。単体コマンドにプロジェクト全体のcoverage thresholdを課さず、閾値による失敗で後続テストを止めない。Infrastructure Designの方針どおりIaCはアプリケーションcoverageから除外し、CDK assertionsで別途確認する。

## Test scope and data

各domain、repository、API、起床/IoT境界、UI、およびCDKの主要コンポーネントにつき5〜8件を目安にし、正常系と少なくとも2つの境界/失敗系を含める。fake clockでUTC時刻を固定し、UUIDと会場grantは各テストで独立生成する。DynamoDB LocalまたはAWS SDK mockを用い、AWS資格情報・実IoT接続なしで実行する。IoT publish adapterは固定commandId、QoS 1、retain=false、期限境界を検査できるfakeに置き換える。AWS統合・Pico実機試験は別の運用確認であり、このUnitの自動テスト結果に含めない。
