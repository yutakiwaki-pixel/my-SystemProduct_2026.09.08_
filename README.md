# Product Monorepo

Next.js を中心とした、大規模化を見据えたプロダクト雛形です。

> 実行手順の網羅版（初回セットアップ〜日常運用〜Claude Code の `/feature` ハーネスの使い方まで）は [RUNBOOK.md](RUNBOOK.md) を参照してください。

## スタック

| 領域 | 選定 |
| --- | --- |
| モノレポ管理 | Turborepo + pnpm workspaces |
| フレームワーク | Next.js 16 (App Router) + React 19 |
| 言語 | TypeScript (strict) |
| スタイリング | Tailwind CSS v4 |
| Lint / Format | Biome |
| DB / ORM | PostgreSQL + Prisma 7 |
| 認証 | Auth.js (NextAuth v5) + Prisma Adapter |
| 単体・コンポーネントテスト | Vitest + Testing Library |
| E2Eテスト | Playwright |
| コンテナ化 | Docker (Next.js standalone output) |
| CI | GitHub Actions |

## ディレクトリ構成

```text
apps/
  web/            # Next.js アプリ本体
packages/
  database/       # Prisma スキーマ・クライアント（将来 web 以外のアプリからも共有）
```

新しいアプリは `apps/` 配下に、複数アプリで共有するコードは `packages/` 配下に追加していきます。

## セットアップ

前提: Node.js 22.12+ (推奨: `.nvmrc` の 24)、pnpm、ローカルの PostgreSQL（もしくは Docker）。

```bash
pnpm install

# apps/web と packages/database それぞれに .env を用意
cp apps/web/.env.example apps/web/.env
cp packages/database/.env.example packages/database/.env

# Auth.js のシークレットを生成して AUTH_SECRET に設定
pnpm --filter web exec npx auth secret

# 初回マイグレーション（migrations ディレクトリがまだ無いため最初の1回はこれで作成）
pnpm --filter @repo/database exec prisma migrate dev --name init

pnpm dev
```

## 主なコマンド（ルートから実行）

```bash
pnpm dev              # 全アプリを開発起動
pnpm build            # 全アプリをビルド
pnpm check            # Biome lint + format チェック
pnpm check:fix        # Biome lint + format 自動修正
pnpm typecheck        # 型チェック
pnpm test             # Vitest（単体・コンポーネント）
pnpm test:e2e         # Playwright（E2E、事前に build が必要）
pnpm db:migrate       # Prisma マイグレーション作成・適用（開発用）
pnpm db:migrate:deploy # 既存マイグレーションの適用（CI・本番用）
```

## Docker

```bash
docker build -f apps/web/Dockerfile -t product-web .
docker run -p 3000:3000 --env-file apps/web/.env product-web
```

## 未決定事項

- デプロイ先（Vercel / 自社基盤など）は未確定です。`output: "standalone"` と Dockerfile を用意しているため、どちらの方式にも移行できます。
- Auth.js の認証プロバイダは未設定です。`apps/web/src/lib/auth.ts` に追加してください。
