---
description: apps/vuln-lab で「ユーザー自身が発見・再現した」脆弱性1件について、原因特定→journal下書き→修正実装→検証→journal完成までを隔離サンドボックス内の自律ループで行う。「/vuln-remediate <発見内容>」で使う。発見（攻撃して見つける）自体はユーザーが担当し、このスキルは見つかった後の引き継ぎ専用。
---

# /vuln-remediate — vuln-lab 脆弱性の原因特定→修正→journal 自律ループ

`/vuln-remediate` に続くテキストは、ユーザーが自分で再現した脆弱性の内容（カテゴリ、狙ったエンドポイント、
使ったペイロード/手順、実際に起きたこと）。**発見はユーザーの仕事** — このスキルは「もう見つかった後」を
引き継ぎ、`/feature` と同じくサンドボックス内で完結させる（本流は一切変更しない）。

`apps/vuln-lab` はモノレポの他パッケージから独立している（自身のCLAUDE.mdの通りCI/build/deployの対象外）
ので、検証も `apps/vuln-lab` にスコープを絞り、リポジトリ全体の `pnpm check/typecheck/test/build` は回さない
— `/feature` と比べてトークン消費を抑えるための、このスキル固有の設計。

## 手順

1. **journal番号とslugを決める**: `docs/journal-drafts/*.md`（`_template.md`を除く）を確認し、最大の連番+1を
   3桁ゼロ埋めで採番する（例: 既存が `001-`, `002-` なら次は `003-`）。カテゴリから3〜6語程度の英語
   kebab-caseスラッグを作り、journalファイル名は `docs/journal-drafts/<NNN>-<slug>.md`、サンドボックスの
   slugは `<slug>`（feature-sandboxとjournal採番は別物なので衝突しても問題ない。ただし
   `docs/specs/<slug>.md` と衝突する場合は別slugにする）。

2. **サンドボックス作成**:
   ```bash
   scripts/feature-sandbox.sh create <slug>
   ```
   標準出力されるサンドボックスの絶対パスを控える。

3. **Workflow 起動**（Workflow ツールを直接呼ぶ — これはこのスキル自身の指示による明示的な許可）:
   ```
   Workflow({
     name: 'vuln-remediate-loop',
     args: {
       finding: '<ユーザーが報告した発見内容（そのまま）>',
       slug: '<slug>',
       sandboxPath: '<サンドボックス絶対パス>',
       journalPath: '<サンドボックス絶対パス>/docs/journal-drafts/<NNN>-<slug>.md',
     }
   })
   ```
   バックグラウンドで実行される。完了通知が来るまで、ユーザーには「実行中」であることを一言伝えてよい。

4. **結果に応じて対応**（Workflow の戻り値の `status` で分岐）。**いずれの分岐でも、ユーザーへのテキスト
   報告に加えて PushNotification ツールを1回呼ぶこと**（進捗中の中間報告では呼ばない — 最終状態に到達
   した時だけ）:
   - **`ready_for_review`**: ユーザーに完了を報告する。`scripts/feature-sandbox.sh diff <slug>` を実行して
     差分を要約し、`summary` フィールドおよび journalファイルの内容とあわせて提示。次は
     **`/feature-apply <slug>`**（本流に反映）か **`/feature-discard <slug>`**（破棄）のどちらにするか
     確認する（この2つのスキルはvuln-remediate専用ではなく汎用なので、そのまま使い回す）。
     PushNotification には「`<slug>` の修正+journal完成、レビュー待ち」のように状態が一目で分かる短い
     メッセージを渡す。
   - **`blocked_on_investigation` / `blocked_on_fix`**: `questions` の内容をそのままプレーンなチャット
     テキストとしてユーザーに提示し（AskUserQuestionは使わない）、回答を待つ。回答が得られたら、その
     回答を `finding` に追記した上で **同じ `sandboxPath`/`journalPath` のまま** Workflow をもう一度
     起動する（サンドボックスは作り直さない）。PushNotification には「`<slug>` で判断が必要な質問あり」
     のように渡す。
   - **`investigation_failed` / `fix_failed`**: `issues` を要約してユーザーに報告し、サンドボックスを
     残す（後で調査）か `scripts/feature-sandbox.sh discard <slug>` で破棄するか確認する。
     PushNotification には「`<slug>` が検証を通せず失敗」のように渡す。

## 注意

- 本流を直接編集する必要が生じた場合（サンドボックス作成自体の失敗など）以外は、journalファイル・
  実装コードともにサンドボックス内のパスにのみ書き込むこと。
- このスキルは「ユーザーが既に再現した1件」を前提にしている。ユーザーがまだ何も見つけていない／
  発見自体を手伝ってほしいと言っている場合はこのスキルを使わない（発見はユーザー自身の役割 —
  必要なら手順の説明やヒントは対話で行い、コードを直接読んで脆弱性を特定する作業はしない）。
- `apps/vuln-lab` が `main` にまだマージされていない場合、サンドボックス作成前に対象ブランチへ
  `git switch` してからサンドボックスを作る（サンドボックスはその時点の作業ツリーをコピーするため）。
