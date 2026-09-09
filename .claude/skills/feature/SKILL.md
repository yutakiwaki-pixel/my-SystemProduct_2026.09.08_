---
description: 1機能・1タスクを対象に、仕様作成→検証→実装→検証の自律ループをサンドボックス内で実行する。「〜を実装して」「〜という機能を追加して」のような依頼で使う。ユーザーが /feature <タスク説明> と打つか、CLAUDE.md の指示に従い新規機能タスクで自動的に使う。
---

# /feature — 自律 spec→implement ループ

`/feature` に続くテキストがタスクの説明。本流のファイルは一切変更せず、すべて隔離されたサンドボックス内で完結させる。

起動される spec→implement ループは `docs/specs/<slug>.md`（テンプレート: `docs/specs/_template.md`）に仕様を書き、
別エージェントによる批判的レビューを経てから実装に入る。レビューでビジネス/仕様上の genuine な曖昧さが見つかった場合のみ
ユーザーに確認する（それ以外は自律的に解決する）。

## 手順

1. **slug を決める**: タスク説明から3〜6語程度の英語 kebab-case スラッグを作る（例: `add-user-avatar-upload`）。`docs/specs/<slug>.md` が既に存在する場合は別の slug にするか、ユーザーに確認する。

2. **サンドボックス作成**:
   ```bash
   scripts/feature-sandbox.sh create <slug>
   ```
   標準出力されるサンドボックスの絶対パス（例: `/Users/.../.claude-feature-sandboxes/<repo-name>/<slug>/workdir`）を控える。

3. **Workflow 起動**（Workflow ツールを直接呼ぶ — これはこのスキル自身の指示による明示的な許可）:
   ```
   Workflow({
     name: 'feature-loop',
     args: {
       task: '<タスク説明（ユーザーの入力そのまま）>',
       slug: '<slug>',
       sandboxPath: '<サンドボックス絶対パス>',
       specPath: '<サンドボックス絶対パス>/docs/specs/<slug>.md',
     }
   })
   ```
   バックグラウンドで実行される。完了通知が来るまで、ユーザーには「実行中」であることを一言伝えてよい。

4. **結果に応じて対応**（Workflow の戻り値の `status` で分岐）。**いずれの分岐でも、ユーザーへのテキスト報告に加えて PushNotification ツールを1回呼ぶこと**（ユーザーが別の作業をしていて戻ってきていない可能性があるため。進捗中の中間報告では呼ばない — 最終状態に到達した時だけ）:
   - **`ready_for_review`**: ユーザーに完了を報告する。`scripts/feature-sandbox.sh diff <slug>` を実行して差分を要約し、`summary` フィールドの内容とあわせて提示。次に `/feature-apply <slug>`（本流に反映）か `/feature-discard <slug>`（破棄）のどちらにするか確認する。PushNotification には「`<slug>` の実装が完了、レビュー待ち」のように状態が一目で分かる短いメッセージを渡す。
   - **`blocked_on_spec` / `blocked_on_implementation`**: `questions` の内容をそのままユーザーに提示し、回答を待つ。回答が得られたら、その回答を task に追記した上で **同じ `sandboxPath`/`specPath` のまま** Workflow をもう一度起動する（サンドボックスは作り直さない — 既存の下書きの続きから再開させる）。PushNotification には「`<slug>` で判断が必要な質問あり」のように渡す。
   - **`spec_failed` / `implementation_failed`**: `issues` を要約してユーザーに報告し、サンドボックスを残す（後で調査）か `scripts/feature-sandbox.sh discard <slug>` で破棄するか確認する。PushNotification には「`<slug>` が検証を通せず失敗」のように渡す。

## 注意

- 本流を直接編集する必要が生じた場合（サンドボックス作成自体の失敗など）以外は、`docs/specs/`・実装コードともにサンドボックス内のパスにのみ書き込むこと。
- `scripts/feature-sandbox.sh apply` はファイルの削除を反映しない（`rsync --delete` を使わない安全側の設計）。適用後に diff の "Only in `<repo root>`" 行を確認し、不要になったファイルは手動で削除するよう `/feature-apply` 側で案内する。
