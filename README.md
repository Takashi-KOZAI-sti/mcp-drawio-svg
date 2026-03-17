# mcp-drawio-svg

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

**AI（Claude Code / GitHub Copilot）が構成図・インフラ図・システム概要図を `.drawio.svg` 形式で生成するための MCP サーバー。**

生成されたファイルは draw.io で編集可能な図として、かつ Markdown 設計書に `![](diagram.drawio.svg)` で直接埋め込める SVG として、1ファイルで両立する。

---

## `.drawio.svg` とは

`.drawio.svg` は draw.io が定義するデュアルフォーマットファイルである。

- **draw.io / VS Code draw.io 拡張で開ける** — ノードの移動・スタイル変更・接続線の調整など、通常の draw.io 操作がそのまま行える
- **SVG としてブラウザ・Markdown に埋め込める** — `![](diagram.drawio.svg)` と書くだけで設計書にインライン表示される

draw.io のソースファイルと Markdown 用 SVG エクスポートが一つのファイルに統合されているため、「図を更新したのに設計書の画像が古いまま」という不一致が発生しない。

---

## Setup

### 1. ビルド

```bash
npm install
npm run build
```

### 2. MCP サーバーとして登録

#### Claude Code

`~/.claude/settings.json` に追加：

```json
{
  "mcpServers": {
    "drawio-svg": {
      "command": "node",
      "args": ["/path/to/mcp-drawio-svg/dist/index.js"]
    }
  }
}
```

#### GitHub Copilot (VS Code)

`.vscode/settings.json` またはユーザー `settings.json` に追加：

```json
{
  "mcp": {
    "servers": {
      "drawio-svg": {
        "command": "node",
        "args": ["/path/to/mcp-drawio-svg/dist/index.js"]
      }
    }
  }
}
```

---

## Tool: `create_drawio_svg`

### Overview

図の構成要素（ノード・エッジ・グループ）を JSON で渡すと、レイアウト計算・アイコン解決・ファイル生成をすべて自動で行い `.drawio.svg` を出力する。座標の指定は不要。

### Parameters

#### `nodes[]` — ノード（構成部品）

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | 一意の識別子 |
| `label` | string | ✅ | 表示ラベル |
| `icon_path` | string | ❌ | ローカルの SVG アイコンファイルへの絶対パス。省略時は `label` をもとに [simple-icons](https://simpleicons.org/) を自動検索 |
| `highlight` | string | ❌ | ハイライトカラー。名前指定: `"red"` `"yellow"` `"blue"` `"orange"` `"green"` `"purple"`。カスタム: `"#RRGGBB"` |
| `layer_hint` | `"first"` \| `"last"` | ❌ | フロー方向の先頭・末尾レイヤーへの配置ヒント。`"first"` = 最左（`direction:RIGHT`）または最上（`direction:DOWN`）。`"last"` = 最右または最下 |

#### `edges[]` — エッジ（接続線）

| Field | Type | Required | Description |
|---|---|---|---|
| `source` | string | ✅ | 接続元ノード ID |
| `target` | string | ✅ | 接続先ノード ID |
| `label` | string | ❌ | エッジ上のラベル |
| `style` | `"solid"` \| `"dashed"` | ❌ | 線のスタイル（デフォルト: `"solid"`） |
| `connector` | `"orthogonal"` \| `"elbow-h"` \| `"elbow-v"` \| `"straight"` | ❌ | ルーティングスタイル（デフォルト: `"orthogonal"`）。`"orthogonal"`: 直角自動ルーティング。`"elbow-h"`: 水平優先 L 字。`"elbow-v"`: 垂直優先 L 字。`"straight"`: 直線 |
| `arrow` | `"default"` \| `"none"` \| `"both"` | ❌ | 矢印スタイル。`"default"`（省略可）: 接続先のみ矢印。`"none"`: 矢印なし。`"both"`: 両端に矢印 |

#### `groups[]` — グループ（境界コンテナ）

グループは入れ子にできる（`children` に別グループの ID を指定することで 3 階層以上の入れ子が可能）。

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | 一意の識別子 |
| `label` | string | ✅ | 表示ラベル |
| `children` | string[] | ✅ | グループに含めるノード ID またはグループ ID |
| `style` | string | ❌ | グループの色。名前指定: `"blue"` `"orange"` `"red"` `"green"` `"purple"` `"gray"`。カスタム: `"#RRGGBB"`。デフォルト: `"green"` |

#### `layout` — レイアウト設定（オプション）

| Field | Type | Default | Description |
|---|---|---|---|
| `algorithm` | `"layered"` \| `"force"` \| `"stress"` | `"layered"` | レイアウトアルゴリズム。`"layered"`: 階層フロー（フローチャート・パイプライン向け）。`"force"`: 物理シミュレーション2D配置（ネットワーク図向け）。`"stress"`: ストレス最小化2D配置（均一配置向け） |
| `direction` | `"RIGHT"` \| `"DOWN"` \| `"LEFT"` \| `"UP"` | `"RIGHT"` | 全体のフロー方向（`layered` のみ有効） |
| `spacing` | number | `60` | ノード間スペース（px） |
| `group_direction` | `"RIGHT"` \| `"DOWN"` \| `"LEFT"` \| `"UP"` | `"DOWN"` | グループ内のフロー方向（`layered` のみ有効） |

#### `output_path`

生成する `.drawio.svg` ファイルの絶対パス。

---

### Icon resolution

1. **`icon_path` を指定** → 指定した SVG ファイルをそのまま埋め込む
2. **`icon_path` を省略** → `label` で [simple-icons](https://simpleicons.org/) を検索（例: `"GitHub"` → GitHub ロゴ、`"Docker"` → Docker ロゴ）
3. **マッチなし** → ラベル付きの矩形ノードで描画し、警告を返す

---

## Layout

レイアウトは [ELK.js](https://eclipse.dev/elk/)（Eclipse Layout Kernel）による自動計算で決定する。ノードの座標指定は不要で、エッジ接続の構造に基づいて最適な配置が自動で導き出される。

### アルゴリズムの選択

`layout.algorithm` でアルゴリズムを切り替えられる：

| `algorithm` | 特徴 | 向いているケース |
|---|---|---|
| `"layered"`（デフォルト） | 階層フロー（左→右 / 上→下） | フローチャート・パイプライン・シーケンス |
| `"force"` | 物理シミュレーションによる2D自由配置 | ネットワーク図・関係図 |
| `"stress"` | ストレス最小化による均一配置 | ノード間距離を均等にしたい場合 |

### 制御できるパラメータ

| パラメータ | 効果 | 対応アルゴリズム |
|---|---|---|
| `layout.algorithm` | アルゴリズム選択 | すべて |
| `layout.spacing` | ノード間スペース | すべて |
| `layout.direction` | 全体のフロー方向（`RIGHT` / `DOWN` / `LEFT` / `UP`） | `layered` のみ |
| `layout.group_direction` | グループ内のフロー方向 | `layered` のみ |
| `node.layer_hint: "first"` | フロー方向の最初のレイヤーに配置 | `layered` のみ |
| `node.layer_hint: "last"` | フロー方向の最後のレイヤーに配置 | `layered` のみ |

### draw.io との役割分担

- **MCP が担う**: 構造的に正しく、エッジが交差しにくいレイアウトの自動生成
- **draw.io が担う**: 生成後のノード位置の微調整

生成した `.drawio.svg` を draw.io または VS Code draw.io 拡張で開き、ノードをドラッグして位置を調整すると、ファイルは draw.io ダイアグラムとしても SVG としても引き続き有効なまま保たれる。

---

## Example

### AI へのプロンプト例

```
以下の Azure インフラ構成の .drawio.svg を作成してください。

ノード:
- users: "Users"
- github: "GitHub"  layer_hint: last
- entra: "Microsoft Entra ID"  icon: /icons/azure/entra-id.svg
- swa: "Static Web Apps"       icon: /icons/azure/static-web-apps.svg
- appinsights: "Application Insights"  icon: /icons/azure/application-insights.svg
- keyvault: "Key Vault"        icon: /icons/azure/key-vault.svg
- pg: "PostgreSQL"             icon: /icons/azure/postgresql.svg
- func: "Azure Functions"      icon: /icons/azure/functions.svg
- pe: "Private Endpoint"       icon: /icons/azure/private-link.svg

エッジ:
- users → swa
- github → swa  style: dashed  label: "CI/CD"
- swa → func
- func → pg       style: dashed
- func → keyvault style: dashed
- func → appinsights style: dashed
- pe → pg

グループ:
- func_subnet: "Functions Integration Subnet"  children: [func]   style: blue
- pe_subnet:   "Private Endpoint Subnet"       children: [pe]     style: blue
- vnet:        "Azure Virtual Network"         children: [func_subnet, pe_subnet]  style: orange
- azure:       "Microsoft Azure"               children: [entra, swa, appinsights, keyvault, pg, vnet]  style: blue

レイアウト: direction=RIGHT, group_direction=DOWN
出力: /path/to/docs/infrastructure.drawio.svg
```

### 対応する JSON 入力

```json
{
  "nodes": [
    { "id": "users",       "label": "Users" },
    { "id": "github",      "label": "GitHub",               "layer_hint": "last" },
    { "id": "entra",       "label": "Microsoft Entra ID",   "icon_path": "/icons/azure/entra-id.svg" },
    { "id": "swa",         "label": "Static Web Apps",      "icon_path": "/icons/azure/static-web-apps.svg" },
    { "id": "appinsights", "label": "Application Insights", "icon_path": "/icons/azure/application-insights.svg" },
    { "id": "keyvault",    "label": "Key Vault",            "icon_path": "/icons/azure/key-vault.svg" },
    { "id": "pg",          "label": "PostgreSQL",           "icon_path": "/icons/azure/postgresql.svg" },
    { "id": "func",        "label": "Azure Functions",      "icon_path": "/icons/azure/functions.svg" },
    { "id": "pe",          "label": "Private Endpoint",     "icon_path": "/icons/azure/private-link.svg" }
  ],
  "edges": [
    { "source": "users",  "target": "swa" },
    { "source": "github", "target": "swa",        "style": "dashed", "label": "CI/CD" },
    { "source": "swa",    "target": "func" },
    { "source": "func",   "target": "pg",          "style": "dashed" },
    { "source": "func",   "target": "keyvault",    "style": "dashed" },
    { "source": "func",   "target": "appinsights", "style": "dashed" },
    { "source": "pe",     "target": "pg" }
  ],
  "groups": [
    { "id": "func_subnet", "label": "Functions Integration Subnet", "children": ["func"],                      "style": "blue" },
    { "id": "pe_subnet",   "label": "Private Endpoint Subnet",      "children": ["pe"],                       "style": "blue" },
    { "id": "vnet",        "label": "Azure Virtual Network",        "children": ["func_subnet", "pe_subnet"], "style": "orange" },
    { "id": "azure",       "label": "Microsoft Azure",              "children": ["entra", "swa", "appinsights", "keyvault", "pg", "vnet"], "style": "blue" }
  ],
  "layout": { "direction": "RIGHT", "group_direction": "DOWN" },
  "output_path": "/path/to/docs/infrastructure.drawio.svg"
}
```

---

## ツール選択ガイド

| # | ユースケース | 推奨ツール | アイコン |
|---|---|---|---|
| 1 | 新規ファイル作成 | `create_drawio_svg` | `icon_path` 指定 or simple-icons 自動検索 |
| 2 | 既存ファイルの修正/構造変更 | `read_drawio_svg` → `edit_drawio_svg` | 自動保持 |
| 3 | 既存ファイルの完全再設計 | `read_drawio_svg` → `create_drawio_svg` | パラメータ指定に準じる |

ユースケース 3 で `create_drawio_svg` を使う場合、既存ファイルのアイコン情報は引き継がれない。`create_drawio_svg` のパラメータでアイコン情報を適切に指定すること。

---

## Tool: `read_drawio_svg`

### Overview

既存の `.drawio.svg` ファイルの構造（ノード・エッジ・グループ・レイアウト設定）を JSON で返す。ファイルを編集する前に現在の内容を確認するために使用する。

### Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `file_path` | string | ✅ | 読み込む `.drawio.svg` ファイルの絶対パス |

### Returns

```json
{
  "nodes": [
    { "id": "postgresql", "label": "PostgreSQL", "has_icon": true, "x_hint": 120, "y_hint": 40 }
  ],
  "edges": [
    { "source": "api", "target": "postgresql", "style": "dashed", "connector": "orthogonal" }
  ],
  "groups": [
    { "id": "backend", "label": "Backend", "children": ["api", "postgresql"], "style": "blue" }
  ],
  "layout": { "direction": "RIGHT", "spacing": 60 },
  "output_path": "/path/to/diagram.drawio.svg",
  "summary": "..."
}
```

- **`nodes[].id`**: ラベルのスラッグから合成（例: `"PostgreSQL"` → `"postgresql"`）。`edit_drawio_svg` でノードを参照するときに使用する。
- **`nodes[].has_icon`**: アイコンが埋め込まれているかどうか。実際のアイコンデータは含まれない（`edit_drawio_svg` が自動保持するため不要）。
- **`nodes[].x_hint` / `y_hint`**: 既存のノード座標。`create_drawio_svg` に渡すと元のレイアウトに近い配置で再生成できる。
- **`layout`**: 本ツールで生成したファイルには保存されている。未保存の場合はデフォルト値（`direction: RIGHT, spacing: 60`）。

---

## Tool: `edit_drawio_svg`

### Overview

既存の `.drawio.svg` ファイルを差分指定で編集する。変更しなかったノード・アイコン・エッジはそのまま保持される。

デフォルト（`layout_mode: "preserve"`）では**既存ノード・グループの位置はそのまま保持**される。新規追加要素のみ既存レイアウトの外側に自動配置される。`layout_mode: "recompute"` を指定すると ELK による全体再計算になる。

draw.io デスクトップアプリで作成・保存したファイル（手書き形式）にも対応しており、既存のセルスタイルをそのまま保持しながら差分編集が行える。

### Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `file_path` | string | ✅ | 編集する `.drawio.svg` ファイルの絶対パス |
| `layout_mode` | `"preserve"` \| `"recompute"` | ❌ | レイアウトモード。`"preserve"`（デフォルト）: 既存位置を保持し新規要素のみ外側に配置。`"recompute"`: ELK で全体再計算 |
| `add_nodes` | array | ❌ | 追加するノード（`id`, `label`, `icon_path?`, `highlight?`, `layer_hint?`） |
| `remove_nodes` | string[] | ❌ | 削除するノードの ID リスト（接続エッジも自動削除） |
| `update_nodes` | array | ❌ | 更新するノード（`id` 必須、`label?`, `highlight?`, `icon_path?`） |
| `add_edges` | array | ❌ | 追加するエッジ（`source`, `target`, `label?`, `style?`, `connector?`, `arrow?`） |
| `remove_edges` | array | ❌ | 削除するエッジ（`{ source, target }` で指定） |
| `add_groups` | array | ❌ | 追加するグループ（`id`, `label`, `children`, `style?`） |
| `remove_groups` | string[] | ❌ | 削除するグループの ID リスト（子ノードはトップレベルに昇格） |
| `update_groups` | array | ❌ | 更新するグループ（`id` 必須、`label?`, `style?`, `children?`） |
| `layout` | object | ❌ | レイアウト設定の上書き（`direction?`, `spacing?`, `group_direction?`, `algorithm?`）。省略時は元のファイルの設定を引き継ぐ |

### アイコンの扱い

変更しなかったノードのアイコンは**ファイルから自動で読み直して保持**される。AI がアイコンデータを受け渡す必要はない。アイコンを変更したい場合は `update_nodes` の `icon_path` を指定する。

### Example

```json
{
  "file_path": "/path/to/diagram.drawio.svg",
  "add_nodes": [{ "id": "redis", "label": "Redis" }],
  "add_edges": [{ "source": "api", "target": "redis" }],
  "update_nodes": [{ "id": "postgresql", "highlight": "blue" }],
  "remove_nodes": ["legacy_service"]
}
```

---

## Requirements

- Node.js 18+
- 生成したファイルは以下で動作する：
  - [VS Code draw.io 拡張](https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio) (`hediet.vscode-drawio`)
  - [draw.io Web](https://app.diagrams.net/)
  - SVG ビューアー / ブラウザ / Markdown プレビュー（`![](file.drawio.svg)`）
