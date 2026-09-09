---
description: /feature ループが ready_for_review になったサンドボックスの変更をレビューし、承認を得てから本流に反映して片付ける。「/feature-apply <slug>」で使う。
---

# /feature-apply <slug>

1. `scripts/feature-sandbox.sh diff <slug>` を実行し、差分を要約してユーザーに提示する。**明示的な承認を得るまで次に進まない。**
   - サンドボックス作成後に本流側だけで変更されたファイル（インフラ修正など）が diff に出てきた場合、apply するとその変更が古いサンドボックスの内容で上書きされ、巻き戻ってしまう。そのようなファイルが見つかったら、その旨をユーザーに指摘し、必要ならそのファイルだけ apply 対象から外す（サンドボックス側の該当ファイルを本流の内容で上書きしてから apply する等）。
2. 承認が得られたら:
   ```bash
   scripts/feature-sandbox.sh apply <slug>
   ```
3. diff に "Only in `<repo root>`"（本流にしか存在しないファイル）が含まれていた場合、それはサンドボックス側で削除されたファイルの可能性がある。ユーザーに確認の上、必要なら本流から手動で削除する。
4. 本流で最終確認を実行する（サンドボックス内の検証ゲートと同じ厳格さで、e2eも省略しない）:
   ```bash
   pnpm check && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
   ```
   失敗した場合はユーザーに報告し、サンドボックスはまだ削除しない。
5. 通ったら本流へローカルコミットする（監査証跡・ロールバック用。**push はしない** — push は
   別途ユーザーが明示的に指示した時のみ行う）:
   - `docs/specs/<slug>.md` の1行目（`# <feature name>`）を件名に使う。
   - `git add -A` した後、`git status --short` で意図しないファイル（secret・scratch等）が
     混ざっていないか目視確認してからコミットする:
     ```bash
     git commit -m "$(cat <<'EOF'
     feat(<slug>): <spec の H1 タイトル>

     <このセッションの attribution 指示に従ったトレーラー（あれば）>
     EOF
     )"
     ```
   - コミットが失敗した場合（pre-commit hook等）はサンドボックスをまだ削除せず、ユーザーに報告する。
6. コミットできたらサンドボックスを削除する:
   ```bash
   scripts/feature-sandbox.sh discard <slug>
   ```
7. `docs/specs/<slug>.md` も apply により本流へコピーされ、5でコミット済みのはず。ユーザーに
   完了を報告する（コミットハッシュを含める。push はまだ行っていないことも明示する）。
