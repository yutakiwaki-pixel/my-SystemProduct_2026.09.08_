# 運用手順書 (RUNBOOK)

このリポジトリを明日以降・別セッションで再開するための、プロダクト運用と Claude Code
（`/feature` ハーネス）運用の両方を網羅した実行手順書です。

- 「これは何のプロダクトか」「スタック構成」は [README.md](README.md)
- 「Claude Code が守るべきルール・落とし穴」は [CLAUDE.md](CLAUDE.md)
- ここでは「実際に何をどの順番で打つか」を手順として書きます。

---

## 1. 初回セットアップ（クローン直後・環境を作り直した時）

### 1-1. 前提条件

| 項目 | 要件 |
| --- | --- |
| Node.js | 22.12 以上（`.nvmrc` は 24。`nvm use` 推奨） |
| pnpm | 11.x（`packageManager` フィールドで固定。無ければ `corepack enable`） |
| PostgreSQL | ローカルに1つ（Docker でも可。下記1-4参照） |
| Docker | 任意。Docker ビルド/デプロイを試す場合のみ必要 |

### 1-2. 依存関係のインストール

```bash
pnpm install
```

初回、pnpm が `@prisma/engines` / `@swc/core` / `prisma` のビルドスクリプト実行を尋ねてくることがある。
`pnpm-workspace.yaml` の `allowBuilds` で既に `true` にしてあるので、通常は聞かれない。もし聞かれたら
`pnpm approve-builds` で許可する。

### 1-3. 環境変数ファイルの作成

```bash
cp apps/web/.env.example apps/web/.env
cp packages/database/.env.example packages/database/.env

# Auth.js のシークレットを生成し、apps/web/.env の AUTH_SECRET に貼り付ける
pnpm --filter web exec npx auth secret
```

### 1-4. PostgreSQL の用意

どちらか:

```bash
# A) 手元に立てる場合（例）
docker run --name product-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=product -p 5432:5432 -d postgres:17-alpine

# B) 既存のPostgreSQLがあるなら、apps/web/.env と packages/database/.env の
#    DATABASE_URL をそれに合わせて書き換える
```

### 1-5. 初回マイグレーション

`packages/database/prisma/migrations/` がまだ無い状態なので、最初の1回だけ手動で作成する。

```bash
pnpm --filter @repo/database exec prisma migrate dev --name init
```

これで `packages/database/prisma/migrations/` が生成される。以降は `pnpm db:migrate` で足りる。

### 1-6. 起動確認

```bash
pnpm dev
```

`http://localhost:3000` を開いて「Product / Next.js scaffold is running.」が表示されれば成功。

---

## 2. 日常のコマンド一覧（ルートから実行）

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | 全アプリを開発起動 |
| `pnpm build` | 全アプリをビルド |
| `pnpm start` | ビルド済みアプリを起動 |
| `pnpm check` | Biome（lint + format）チェック |
| `pnpm check:fix` | Biome 自動修正 |
| `pnpm typecheck` | 型チェック（`@repo/database` の Prisma Client 再生成込み） |
| `pnpm test` | Vitest（単体・コンポーネント） |
| `pnpm test:e2e` | Playwright（E2E。事前に `pnpm build` が必要な場合あり） |
| `pnpm db:generate` | Prisma Client を再生成（`schema.prisma` を変更したら必須） |
| `pnpm db:migrate` | マイグレーションを作成・適用（開発用、対話的） |
| `pnpm db:migrate:deploy` | 既存マイグレーションの適用のみ（CI・本番用、非対話） |

何かを「完了」とみなす前に、最低限 `pnpm check && pnpm typecheck && pnpm test && pnpm build` を通す
（`CLAUDE.md` にも明記）。

---

## 3. データベース（Prisma）を触るときの手順

1. `packages/database/prisma/schema.prisma` を編集する。
2. `pnpm --filter @repo/database exec prisma migrate dev --name <変更内容>` でマイグレーションを作成・適用（ローカルDBに反映される）。
3. これで Prisma Client（`packages/database/src/generated/prisma`、gitignore対象）も自動的に再生成される。
4. 変更後は `pnpm typecheck` と `pnpm test` で影響範囲を確認する。
5. `prisma studio` でデータを見たい場合: `pnpm --filter @repo/database exec prisma studio`

CI・本番では `prisma migrate dev` ではなく `pnpm db:migrate:deploy`（= `prisma migrate deploy`）を使う
（対話的にマイグレーションを新規作成しない、既存分の適用のみ）。

---

## 4. Docker

```bash
# ビルドはリポジトリルートをコンテキストにする
docker build -f apps/web/Dockerfile -t product-web .
docker run -p 3000:3000 --env-file apps/web/.env product-web
```

`apps/web/next.config.ts` は `DOCKER_BUILD=1` のときだけ `output: "standalone"` を有効化する
（`apps/web/Dockerfile` 内で設定済み）。ローカルの `pnpm build && pnpm start` ではこの環境変数を
設定しないこと（`next start` が `standalone` 出力と相性が悪く壊れるため）。

---

## 5. CI（GitHub Actions）

`.github/workflows/ci.yml` が push / PR で自動実行する内容:

```text
pnpm install → pnpm check → pnpm typecheck → pnpm db:migrate:deploy
→ pnpm test → pnpm build → Playwright インストール → pnpm test:e2e
```

Postgres はサービスコンテナとして起動される。CI が落ちたら、上記コマンドをローカルで同じ順番に
実行すれば大抵再現できる（`DATABASE_URL`/`AUTH_SECRET` は CI と同じ値を `.env` に設定する）。

---

## 6. Claude Code / `/feature` ハーネスの使い方

このリポジトリを開くと `CLAUDE.md` が自動的に読み込まれる。以下は実際に何を打つかの手順。

### 6-1. ちょっとした修正・質問

普通に会話で依頼すれば直接ファイルを編集して対応する（`pnpm check/typecheck/test/build`
で検証してから完了報告する運用）。`/feature` を使う必要はない。コミットするかどうかは
都度ユーザーの判断（`/feature-apply` のような自動コミットはしない）。

### 6-2. まとまった機能追加: `/feature <タスクの説明>`

例:

```text
/feature ユーザーが自分のプロフィール画像をアップロードできるようにする
```

実行されること（自動・バックグラウンド）:

1. `scripts/feature-sandbox.sh create <slug>` で、本流とは別の場所
   （`../.claude-feature-sandboxes/<repo名>/<slug>/workdir`、本流の外側の兄弟ディレクトリ）に
   隔離コピーを作成する。
2. `.claude/workflows/feature-loop.js`（Workflow）が起動する:
   - 仕様を `docs/specs/<slug>.md` に下書き → 別エージェントが敵対的レビュー（最大3回リトライ）
   - 仕様が固まったら実装 → `pnpm check/typecheck/test/build`（必要なら `test:e2e` も）で検証
     （最大3回リトライ）
   - すべてサンドボックス内で完結。本流は一切変更されない。
3. 完了すると通知が来る（セッション内のテキスト通知に加えて、PushNotification ツールによる
   デスクトップ通知も試みられる — 別の作業をしていても気づけるようにするため。届かない場合は
   6-7 参照）。結果は3パターン:
   - **`ready_for_review`**: 完了。差分と実装内容の要約が提示される → 6-3 または 6-4 に進む。
   - **`blocked_on_spec` / `blocked_on_implementation`**: 人間にしか答えられない質問がある。
     回答すると、同じサンドボックスのまま続きから再開する。
   - **`spec_failed` / `implementation_failed`**: 3回リトライしても検証を通せなかった。内容を
     確認し、サンドボックスを残すか破棄するか判断する。

途中経過は `/workflows` コマンドで確認できる。

### 6-3. 承認して本流に反映: `/feature-apply <slug>`

1. `scripts/feature-sandbox.sh diff <slug>` の差分が提示される → 内容を確認して承認する。
2. 承認すると `feature/<slug>` ブランチを切ってから本流に反映（`rsync` でコピー、ファイル削除は
   反映されない点に注意）。**`main` に直接コミットすることはない。**
3. `pnpm check && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` を再実行して
   問題なければ `git add -A && git commit` でその `feature/<slug>` ブランチに1機能=1コミットとして
   記録する。
4. コミットが終わったら `main` に戻り、サンドボックスを削除する。
5. push・PR作成（`git push -u origin feature/<slug>` → `gh pr create`）は自動化していない。
   `/feature-apply` 完了後にユーザーへ都度確認してから実行する。PRを作ればGitHub Actionsの
   CIがそこで走る。`main` へのマージはPR画面から人間が行う。

**注意（本流が後から変わっていた場合）**: サンドボックス作成後に本流側だけで加えた変更
（インフラ修正など）があると、apply でそれが古い内容に巻き戻る。diff に見覚えのない変更
（自分がその後直したファイルなど）が出てきたら、そのファイルだけ本流の内容に戻してから apply する。

### 6-4. 却下して破棄: `/feature-discard <slug>`

取り消し不可。確認を挟んでから `scripts/feature-sandbox.sh discard <slug>` を実行する。

### 6-5. サンドボックスを手動操作したいとき

```bash
scripts/feature-sandbox.sh list                 # 現在あるサンドボックス一覧
scripts/feature-sandbox.sh diff   <slug>        # 本流との差分
scripts/feature-sandbox.sh apply  <slug>        # 本流に反映
scripts/feature-sandbox.sh discard <slug>       # 破棄
```

### 6-6. トラブルシューティング

- **`Workflow "feature-loop" not found` と出る**: `.claude/workflows/` がセッション開始後に
  作られた場合など、名前解決に失敗することがある（本セッションで実際に発生した）。その場合は
  `.claude/workflows/feature-loop.js` の中身をそのまま `Workflow({ script: "...", args: {...} })`
  の `script` に直接渡せば動く。次回セッションで最初から解決するか、まず一度小さいタスクで
  試しておくと安心。
- **サンドボックス内で `pnpm build` が `next/package.json` が見つからないと失敗する**:
  サンドボックスが本流の内側（`.claude/features/...` 等）にネストされていると、Turbopack が
  ワークスペースルートを誤認して起きる。`scripts/feature-sandbox.sh` は本流の外側（兄弟
  ディレクトリ）に作る設計になっているので、通常は起きない。もし手動で別の場所に作った場合は
  この点に注意。
- **`ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH` と出る**: `node_modules` がシンボリックリンクだと
  pnpm が拒否する。`feature-sandbox.sh` は clonefile（`cp -Rc`）で実体コピーしているので通常
  発生しない。

### 6-7. デスクトップ通知が届かないとき

Claude Code (VS Code 拡張) を使っている場合、以下を確認する:

1. macOS システム設定 → 通知 → 「Code」（Visual Studio Code）を検索 → 通知を許可が ON、
   通知スタイルが「なし」になっていないか。
2. コントロールセンターで「集中モード / おやすみモード」が ON になっていないか。
3. Claude Code 内で `/config` → Notifications → チャンネルが無効になっていないか。
4. VS Code の統合ターミナル内では OSC エスケープシーケンスが落ちることがある既知の制約が
   ある。Claude Code パネル自体が前面に出ていない・フォーカスが外れていると届きにくいことがある。

いずれも設定変更はユーザー本人が行う必要がある（Claude からは変更できない）。

---

## 7. 既知の制約・未確定事項

- **git 導入済み**: このリポジトリは git 管理下にあり、`origin` は
  `https://github.com/yutakiwaki-pixel/my-SystemProduct_2026.09.08_.git`（個人アカウント）。
  `/feature-apply` は `feature/<slug>` ブランチを切り、最終検証が通った後そのブランチへ
  `git commit` するところまで自動で行う（`main` には直接コミットしない。1機能=1コミット、
  詳細は9番）。push・PR作成・`main`へのマージは自動化しておらず、必要な時にユーザーが
  明示的に実行する。
- **デプロイ先未定**: Vercel か自社 Docker 基盤か未確定。`output: "standalone"` と Dockerfile
  はどちらにも対応できるよう用意済み。
- **認証プロバイダ未設定**: `apps/web/src/lib/auth.ts` の `providers: []` が空。実際に使う
  プロバイダ（GitHub 等）を追加する必要がある。
- **`scripts/feature-sandbox.sh apply` はファイル削除を反映しない**（安全側の設計）。

---

## 8. ファイルマップ（何がどこにあるか）

| パス | 役割 |
| --- | --- |
| `README.md` | プロダクト概要・スタック・セットアップの要約 |
| `CLAUDE.md` | Claude Code が自動的に読む運用ルール・落とし穴 |
| `RUNBOOK.md` | このファイル。実行手順の網羅版 |
| `docs/specs/_template.md` | `/feature` が使う仕様書テンプレート |
| `docs/specs/<slug>.md` | 完了・進行中の各機能の仕様書（apply 後に本流へ残る） |
| `scripts/feature-sandbox.sh` | サンドボックスの作成・差分・適用・破棄 |
| `.claude/workflows/feature-loop.js` | spec→実装ループ本体（Workflow スクリプト） |
| `.claude/skills/feature/` | `/feature` コマンド定義 |
| `.claude/skills/feature-apply/` | `/feature-apply` コマンド定義 |
| `.claude/skills/feature-discard/` | `/feature-discard` コマンド定義 |
| `apps/web/` | Next.js アプリ本体 |
| `packages/database/` | Prisma スキーマ・クライアント |

---

## 9. git 導入（実施済み）

2026-09-10 に git を導入した。実施内容:

1. `git init` 済み。`.gitignore` は元々整備されていたものをそのまま流用（`.env`・`node_modules`・
   生成物などは除外済み）。
2. 初回コミット（`Initial commit`）済み。
3. `origin` は `https://github.com/yutakiwaki-pixel/my-SystemProduct_2026.09.08_.git`
   （個人アカウント）。案件用リポジトリとはアカウントが異なるため、`~/.gitconfig` 側の
   remote URL ベースの自動切り替え設定で `user.name`/`user.email` の手動切り替えミスを防いでいる
   （このリポジトリ固有の設定ではなく、マシン側の設定）。
4. `/feature-apply` の運用を変更済み: `main` から `feature/<slug>` ブランチを切り、そこへ apply。
   最終検証（`pnpm check/typecheck/test/build/test:e2e`）が通ったらそのブランチへ
   `git add -A && git commit -m "feat(<slug>): <summary>"` を自動実行し、`main` に戻る
   （`.claude/skills/feature-apply/SKILL.md` 参照）。`main` への直接コミットはしない。これにより
   `/feature` 1回ごとに1ブランチ・1コミットが残り、監査証跡・ロールバック・複数機能の衝突検知が
   可能になった。
5. GitHub への `push`・PR作成・`main`へのマージは依然として自動化していない。`/feature-apply`
   完了後、必要な時点でユーザーが明示的に実行する。
6. この手順を実行する前に行った `/feature` 適用分は、遡ってコミット履歴を作ることはできない
   （`docs/specs/` に残る仕様書が唯一の記録）。

---

## 10. 将来の方向性: バックログ駆動の自律運用（設計のみ・未実装）

現状の `/feature` は「都度ユーザーが1機能ずつ指示する」運用。将来的に「複数タスクを積んでおいて
放置的に順番へ処理させる」形にする場合のラフな設計方針(未実装・未着手):

- **タスクの置き場所**: `docs/backlog/*.md` のようなディレクトリに1タスク1ファイルで積む。
  各ファイルは `docs/specs/_template.md` ほど厳密でなくてよい、ラフな要望メモ程度。
- **状態管理**: 各バックログアイテムにファイル名 prefix（例: `pending-`, `done-`）か
  frontmatter で状態を持たせ、`/feature` ループが処理し終えたら状態を更新する。
- **オーケストレーター**: バックログの先頭（またはpending先頭）から順に
  `.claude/workflows/feature-loop.js` を1件ずつ**直列で**流す上位ループ。Claude Code の
  `/loop` スキルや `ScheduleWakeup`/`CronCreate`（定期実行）と組み合わせる想定。
- **並列化はしない**: 複数タスクが同じファイルを触る可能性があるため、衝突検知の仕組み
  （= 実質 git）がない限り直列実行が前提。
- **前提条件**:
  1. ~~git 導入~~ — 完了済み（上記9番）。衝突検知・巻き戻り検知に必須だった前提が満たされた。
  2. 通知経路の確立（今回対応した PushNotification 連携）— 放置運用では特に重要。
  3. `/feature` 単体運用がある程度安定して使えていること（今はまだ実運用回数が少ない）。
- **着手タイミングの目安**: `/feature` を単発で何度か問題なく回せた後（git 導入は完了済み）。
