# 連携仕様 v1
入力: [unit-of-work.md](../units-generation/unit-of-work.md)、[unit-of-work-dependency.md](../units-generation/unit-of-work-dependency.md)、[components.md](../domain-design/components.md)、[requirements.md](../requirements-analysis/requirements.md)、[回答](contract-design-questions.md)。
ブロックはYAML 1.2で有効なJSON表記を使う。初版の保存設定は会場共有1組、ベルは1台、同時実行は1件。Picoの受信形式はこの仕様に合わせる。

## Contracts
| # | Provider Unit | Consumer | Mechanism | Owner |
|---|---|---|---|---|
| C1 | U1（U2が制御API、U3が保存APIを追加） | U1最小画面、U2制御画面、U3完成画面 | HTTPS JSON / OpenAPI | TimerControlとSettingsManagement、仕様基準はU1 |
| C2 | U1 / U2のTimerControl | バックエンド待機機構と起床ハンドラー | 内部JSON shared schema | U1、U2で世代・競合・回復を完成 |
| C3 | U1 / U2のBellTransport | External: Raspberry Pi Pico | AWS IoT Core MQTT / AsyncAPI | アプリ側U1、受信実装は依頼者 |
U3→U2の制御、U3→U1の状態取得、U2→U1の実行状態拡張はC1/C2の共通契約を使う。同じバックエンド内の部品呼出しは別のネットワークサービスを要求しない。

## C1: 画面API
会場ID・ベルIDは利用者の任意入力で選ばず、認証済み主催者の許可済み会場へサーバーが固定する。全経路でトークンを検証し、設定・状態の参照も認可する。認証発行者とaudienceはインフラ設計で固定する。TLSを必須とし、HTTPで認証情報を送らない。
```yaml
{
  "openapi": "3.1.0",
  "info": {
    "title": "LT Timer API",
    "version": "1.0.0"
  },
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "paths": {
    "/v1/state": {
      "get": {
        "operationId": "getState",
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/State"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          },
          "403": {
            "$ref": "#/components/responses/Error"
          },
          "409": {
            "$ref": "#/components/responses/Error"
          },
          "429": {
            "$ref": "#/components/responses/Error"
          },
          "503": {
            "$ref": "#/components/responses/Error"
          }
        }
      }
    },
    "/v1/settings": {
      "get": {
        "operationId": "getSettings",
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SavedSettings"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          },
          "403": {
            "$ref": "#/components/responses/Error"
          },
          "404": {
            "$ref": "#/components/responses/Error"
          },
          "409": {
            "$ref": "#/components/responses/Error"
          },
          "429": {
            "$ref": "#/components/responses/Error"
          },
          "503": {
            "$ref": "#/components/responses/Error"
          }
        }
      },
      "put": {
        "operationId": "saveSettings",
        "parameters": [
          {
            "name": "Idempotency-Key",
            "in": "header",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "expectedVersion",
                  "settings"
                ],
                "properties": {
                  "expectedVersion": {
                    "type": "integer",
                    "minimum": 0
                  },
                  "settings": {
                    "$ref": "#/components/schemas/Settings"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SavedSettings"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          },
          "403": {
            "$ref": "#/components/responses/Error"
          },
          "409": {
            "$ref": "#/components/responses/Error"
          },
          "429": {
            "$ref": "#/components/responses/Error"
          },
          "503": {
            "$ref": "#/components/responses/Error"
          }
        }
      }
    },
    "/v1/sessions": {
      "post": {
        "operationId": "startSession",
        "parameters": [
          {
            "name": "Idempotency-Key",
            "in": "header",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "settings": {
                    "$ref": "#/components/schemas/Settings"
                  },
                  "savedSettingsVersion": {
                    "type": "integer",
                    "minimum": 1
                  }
                },
                "oneOf": [
                  { "required": ["settings"] },
                  { "required": ["savedSettingsVersion"] }
                ]
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/State"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          },
          "403": {
            "$ref": "#/components/responses/Error"
          },
          "409": {
            "$ref": "#/components/responses/Error"
          },
          "429": {
            "$ref": "#/components/responses/Error"
          },
          "503": {
            "$ref": "#/components/responses/Error"
          }
        }
      }
    },
    "/v1/sessions/{sessionId}/pause": {
      "post": {
        "operationId": "pauseSession",
        "parameters": [
          {
            "name": "Idempotency-Key",
            "in": "header",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "sessionId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "expectedVersion"
                ],
                "properties": {
                  "expectedVersion": {
                    "type": "integer",
                    "minimum": 1
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/State"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          },
          "403": {
            "$ref": "#/components/responses/Error"
          },
          "404": {
            "$ref": "#/components/responses/Error"
          },
          "409": {
            "$ref": "#/components/responses/Error"
          },
          "429": {
            "$ref": "#/components/responses/Error"
          },
          "503": {
            "$ref": "#/components/responses/Error"
          }
        }
      }
    },
    "/v1/sessions/{sessionId}/resume": {
      "post": {
        "operationId": "resumeSession",
        "parameters": [
          {
            "name": "Idempotency-Key",
            "in": "header",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "sessionId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "expectedVersion"
                ],
                "properties": {
                  "expectedVersion": {
                    "type": "integer",
                    "minimum": 1
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/State"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          },
          "403": {
            "$ref": "#/components/responses/Error"
          },
          "404": {
            "$ref": "#/components/responses/Error"
          },
          "409": {
            "$ref": "#/components/responses/Error"
          },
          "429": {
            "$ref": "#/components/responses/Error"
          },
          "503": {
            "$ref": "#/components/responses/Error"
          }
        }
      }
    },
    "/v1/sessions/{sessionId}/cancel": {
      "post": {
        "operationId": "cancelSession",
        "parameters": [
          {
            "name": "Idempotency-Key",
            "in": "header",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          },
          {
            "name": "sessionId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "expectedVersion"
                ],
                "properties": {
                  "expectedVersion": {
                    "type": "integer",
                    "minimum": 1
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/State"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error"
          },
          "401": {
            "$ref": "#/components/responses/Error"
          },
          "403": {
            "$ref": "#/components/responses/Error"
          },
          "404": {
            "$ref": "#/components/responses/Error"
          },
          "409": {
            "$ref": "#/components/responses/Error"
          },
          "429": {
            "$ref": "#/components/responses/Error"
          },
          "503": {
            "$ref": "#/components/responses/Error"
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer"
      }
    },
    "schemas": {
      "BellPoint": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "remainingSeconds",
          "ringCount"
        ],
        "properties": {
          "remainingSeconds": {
            "type": "integer",
            "minimum": 0,
            "maximum": 10800
          },
          "ringCount": {
            "type": "integer",
            "enum": [
              1,
              2,
              3
            ]
          }
        }
      },
      "Settings": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "durationSeconds",
          "bells"
        ],
        "properties": {
          "durationSeconds": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10800
          },
          "bells": {
            "type": "array",
            "maxItems": 10,
            "items": {
              "$ref": "#/components/schemas/BellPoint"
            }
          }
        }
      },
      "SavedSettings": {
        "type": "object",
        "required": [
          "version",
          "settings",
          "updatedAt"
        ],
        "properties": {
          "version": {
            "type": "integer",
            "minimum": 1
          },
          "settings": {
            "$ref": "#/components/schemas/Settings"
          },
          "updatedAt": {
            "type": "string",
            "format": "date-time"
          }
        }
      },
      "Session": {
        "type": "object",
        "required": [
          "id",
          "version",
          "generation",
          "state",
          "settingsSnapshot",
          "remainingSeconds",
          "deadline",
          "notifications"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "version": {
            "type": "integer",
            "minimum": 1
          },
          "generation": {
            "type": "integer",
            "minimum": 1
          },
          "state": {
            "type": "string",
            "enum": [
              "running",
              "paused",
              "completed",
              "cancelled"
            ]
          },
          "settingsSnapshot": {
            "$ref": "#/components/schemas/Settings"
          },
          "remainingSeconds": {
            "type": "number",
            "minimum": 0,
            "maximum": 10800
          },
          "deadline": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "notifications": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Notification"
            }
          }
        }
      },
      "Notification": {
        "type": "object",
        "required": [
          "id",
          "remainingSeconds",
          "ringCount",
          "scheduledAt",
          "expiresAt",
          "status"
        ],
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "remainingSeconds": {
            "type": "integer",
            "minimum": 0
          },
          "ringCount": {
            "type": "integer",
            "enum": [
              1,
              2,
              3
            ]
          },
          "scheduledAt": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "expiresAt": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "status": {
            "type": "string",
            "enum": [
              "pending",
              "sent",
              "failed",
              "expired",
              "cancelled",
              "unknown"
            ]
          }
        }
      },
      "State": {
        "type": "object",
        "required": [
          "serverTime",
          "session"
        ],
        "properties": {
          "serverTime": {
            "type": "string",
            "format": "date-time"
          },
          "session": {
            "oneOf": [
              {
                "$ref": "#/components/schemas/Session"
              },
              {
                "type": "null"
              }
            ]
          }
        }
      },
      "Error": {
        "type": "object",
        "required": [
          "code",
          "message",
          "requestId"
        ],
        "properties": {
          "code": {
            "type": "string",
            "enum": [
              "VALIDATION_ERROR",
              "UNAUTHENTICATED",
              "FORBIDDEN",
              "NOT_FOUND",
              "VERSION_CONFLICT",
              "ACTIVE_SESSION",
              "INVALID_STATE",
              "IDEMPOTENCY_CONFLICT",
              "IN_PROGRESS",
              "RATE_LIMITED",
              "UNAVAILABLE"
            ]
          },
          "message": {
            "type": "string"
          },
          "requestId": {
            "type": "string"
          },
          "fields": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      }
    },
    "responses": {
      "Error": {
        "description": "失敗。codeの意味は本文のエラー表を参照",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    }
  }
}
```

### APIの意味と境界
- 開始はsettingsまたはsavedSettingsVersionの片方だけ。U1は入力値、U3完成画面は最新保存済み版を指定する。保存版不一致は409。初回GET settingsは404で、保存時expectedVersion=0。未保存下書きで勝手に開始しない。
- 設定のbellsは0〜10件、残り時間はdurationSeconds以下で重複不可。隣接通知は予定時刻差2秒以上（残り時間差も同じ）。開始直後と終了時も同じ規則。時間範囲は1〜10800秒、回数は1/2/3。違反は400。
- 開始時のsettingsSnapshotは固定する。保存変更は既存実行に影響しない。次回開始前に画面で時間とベル概要を提示する。
- stateは現在の実行または最新の完了・取消実行を返し、何もなければsession=null。serverTimeは応答時のUTC。deadlineは実行中だけ値を持ち、停止中・終端はnull。停止時のremainingSecondsを保持し、実行中は応答時点の値を返す。UIはserverTimeとの差から補間し、定期再取得で補正する。
- 停止中の未送信通知はpending、scheduledAt/expiresAtはnull。再開で新世代と予定時刻を再確定する。送信済み・期限切れ・取消し通知は再送しない。
- 通知のsentはAWSサービス受付のみ。failedは送信しなかったと確定した失敗、unknownは受付の有無が不明。Picoのオンラインや鳴動成功を返さない。
- pauseはrunning、resumeはpaused、cancelはrunning/pausedのみ。その他は409 INVALID_STATE。ただし同じIdempotency-Keyの完了済み再試行は元の応答を返す。
- expectedVersionはサーバーの版と一致が必要。変更成功時に版を増やす。別キーで競合した操作は409 VERSION_CONFLICT。
- 開始・設定保存・停止・再開・取消しはIdempotency-Key必須。会場・主催者・経路・本文の組を保存し、同じキー・同じ内容は元の確定結果を返す。異なる内容でのキー再利用は409 IDEMPOTENCY_CONFLICT。元の処理が未確定なら409 IN_PROGRESSとRetry-After: 1。保持期間は7日。
- 状態変更のHTTP成功は耐久保存後に返す。停止・取消しと外部送信が競合する場合、送信許可済み処理が未確定の間は成功応答を保留する。HTTPタイムアウトで処理の未実施を推測しない。別キーで再実行せず、同じキーを再試行しstateを再取得する。具体的な排他・回復方式はFunctional Designで決める。
- APIクライアントの待機上限は10秒、状態取得は実行・停止中2秒間隔を基本とし、同じ取得を重複させない。画面非表示中は取得を止め、復帰時は再取得する。429はRetry-After、503と通信失敗は1/2/4秒の上限付き再試行、状態変更は同じキーのみ。401/403/400/404を自動再試行しない。

### エラー表
| HTTP | code | 意味・回復 |
|---|---|---|
| 400 | VALIDATION_ERROR | fieldsで入力箇所を示し修正する |
| 401 | UNAUTHENTICATED | 下書きを保ち再認証 |
| 403 | FORBIDDEN | 権限なし。再送しない |
| 404 | NOT_FOUND | 初回設定未保存または対象不在 |
| 409 | VERSION_CONFLICT / ACTIVE_SESSION / INVALID_STATE | 最新状態を取得して利用者が再判断 |
| 409 | IDEMPOTENCY_CONFLICT | 同じキーの別内容を拒否 |
| 409 | IN_PROGRESS | 同じキーで処理確定を再確認 |
| 429 | RATE_LIMITED | Retry-Afterに従う |
| 503 | UNAVAILABLE | 一時障害。成功を表示しない |
全エラーにrequestId。内部スタック・資格情報・証明書をmessageへ含めない。キャッシュはno-store。APIの状態応答に未知フィールドが増えてもクライアントは無視する。

## C2: 起床通知の共有スキーマ
```yaml
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "sessionId",
    "generation",
    "notificationId"
  ],
  "properties": {
    "schemaVersion": {
      "type": "integer",
      "const": 1
    },
    "sessionId": {
      "type": "string",
      "format": "uuid"
    },
    "generation": {
      "type": "integer",
      "minimum": 1
    },
    "notificationId": {
      "type": "string",
      "format": "uuid"
    }
  }
}
```
起床入力は送信命令ではない。TimerControlは実行・通知を読み直し、世代一致、running、未送信、予定到達、有効期限内を確かめて送信可否を決定する。古い世代・不存在・終端・重複起床は副作用なく終了。早すぎる起床では送信せず待機を再要求する。通知IDは実行内の設定点を一意に示し、再開でも同じ通知ID、世代は増える。
内部経路はサービス権限で保護し、公開APIからこの入力を受け取らない。起床・送信の再試行は予定時刻+5秒を越えて送信しない。送信失敗・不明の確定方法と排他の具体化はU1/U2のFunctional Designで行い、永続化と外部送信の原子性を仮定しない。

## C3: ベル命令
```yaml
{
  "asyncapi": "2.6.0",
  "info": {
    "title": "LT Bell Command",
    "version": "1.0.0"
  },
  "defaultContentType": "application/json",
  "channels": {
    "lt-timer/v1/{environment}/bells/{bellId}/commands": {
      "parameters": {
        "environment": {
          "description": "devまたはprod",
          "schema": {
            "type": "string",
            "enum": [
              "dev",
              "prod"
            ]
          }
        },
        "bellId": {
          "description": "環境で固定する対象ベルID",
          "schema": {
            "type": "string",
            "pattern": "^[a-z0-9-]{1,40}$"
          }
        }
      },
      "publish": {
        "operationId": "publishBellCommand",
        "message": {
          "name": "RingCommand",
          "payload": {
            "type": "object",
            "required": [
              "schemaVersion",
              "commandId",
              "sessionId",
              "ringCount",
              "intervalMs",
              "scheduledAtMs",
              "expiresAtMs"
            ],
            "additionalProperties": false,
            "properties": {
              "schemaVersion": {
                "type": "integer",
                "const": 1
              },
              "commandId": {
                "type": "string",
                "format": "uuid"
              },
              "sessionId": {
                "type": "string",
                "format": "uuid"
              },
              "ringCount": {
                "type": "integer",
                "enum": [
                  1,
                  2,
                  3
                ]
              },
              "intervalMs": {
                "type": "integer",
                "const": 500
              },
              "scheduledAtMs": {
                "type": "integer",
                "minimum": 1
              },
              "expiresAtMs": {
                "type": "integer",
                "minimum": 1
              }
            }
          }
        }
      }
    }
  }
}
```

### 実装ルール
- environmentはdev/prodで分離し、bellIdとAWSエンドポイントは環境設定として固定する。実際の接続先はInfrastructure Designで確定。Picoは自分のcommandsトピックだけを購読する。
- QoS 1、retain=false。PicoのMQTT 3.1.1接続はcleanSession=trueで再接続時に購読し直す。オフライン命令の保管を意図しない。QoSは実鳴動の保証ではない。
- scheduledAtMs/expiresAtMsはUTC Unix epochミリ秒、expiresAtMs=scheduledAtMs+5000。commandIdは通知IDを使い、再試行でも変更しない。
- サーバーは予定時刻未満で送らず、予定時刻から5秒以上経過なら送らない。Picoは受信時の時計が予定前または期限以上なら破棄し、受信した有効命令は即時実行する。Picoは発表全体の予定管理や待機を担当しない。
- Picoの時刻は接続前に同期し、時刻を信用できない間は鳴らさない。再起動後は同期完了に加え5秒待ってから命令受理を開始する。時刻同期精度も2秒目標の実機試験に含める。
- 有効なcommandIdを実行開始前に重複排除へ登録し、有効期限まで保持する。同じIDを二度鳴らさない。再起動時の5秒待機で過去の有効命令が残らないようにする。未知のschemaVersion、不正な回数・間隔・時刻を鳴らさず破棄する。未知の任意フィールドは無視できるが必須項目の欠落は拒否する。
- 1回目の打音開始後、2/3回目は500ms間隔で実行する。expiresAtMsは最初の打音開始の期限であり、開始済みの連打を途中で中断するためには使わない。
- 設定の予定間隔2秒は実配信の到着間隔を保証しない。別IDが鳴動・機構復帰中に届いたら待ち行列へ入れず破棄する。忙しい間の命令も識別子を登録して同じ命令の遅い再実行を防ぐ。復帰時間は実機で測定し、2秒で足りなければ設定最小間隔を広げる。返信がないため、この破棄をアプリが成功・失敗と自動判定できないことを運用手順に記載する。
- 実際に鳴ったかはイベント前に目視等で確認する。0.5秒間隔と2秒の予定間隔は初期契約で、実機未検証を合格扱いしない。

例（値は説明用）:
```json
{"schemaVersion":1,"commandId":"7a0c2180-a081-4188-ab3a-9a7f7da0157b","sessionId":"b1199c5c-5ed4-4fc3-9fda-d918086652c0","ringCount":3,"intervalMs":500,"scheduledAtMs":1794610800000,"expiresAtMs":1794610805000}
```

### AWS仕様の確認元
[AWS IoT Core MQTT公式文書](https://docs.aws.amazon.com/iot/latest/developerguide/mqtt.html)でQoS 0/1、QoS 1の再送、persistent sessionとcleanSession、retained messageを確認した。これらの配信特性から、v1では明示的な期限とIDを持たせる設計判断とした。アプリの送信受付をデバイスの動作確認と解釈しない。

## 所有・変更ルール
C1/C2はU1が基準を定義し、U2/U3は追加操作を同じv1に実装する。C3はアプリ側が仕様を管理し、依頼者が受信実装を確認する。フィールド削除・意味変更・トピック変更・回数や期限の意味変更は破壊的変更としv2に分け、送信・受信双方の移行が揃うまでv1を止めない。追加の任意出力フィールドは既存消費者が無視できる場合だけ互換とする。機構都合で最小間隔を広げる場合は入力検証・保存設定の再検証・試験条件を同時更新し、既存設定を黙って書き換えない。

## Open questions
| Contract | Question | Blocks |
|---|---|---|
| C1 | トークン発行者、認証方式、APIホスト | Infrastructure Designで確定しU1のクラウド試験前に解消 |
| C2 | 具体的な待機・排他・回復・タイムアウト方式 | U1/U2のFunctional DesignとInfrastructure Design |
| C3 | 機構復帰時間、時刻同期の実測精度、実機準備の確定日時 | 実機の合格判定。模擬実装は妨げない |
これらは接続先・実装・試験の後続事項で、JSON形式と所有境界はこの資料で固定する。
