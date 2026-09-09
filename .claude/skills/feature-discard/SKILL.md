---
description: /feature ループのサンドボックスを、本流に反映せずに破棄する。「/feature-discard <slug>」で使う。取り消せない操作なので必ず確認を取る。
---

# /feature-discard <slug>

1. 破棄すると元に戻せないことを伝え、ユーザーの明示的な確認を取る。
2. 確認が取れたら:
   ```bash
   scripts/feature-sandbox.sh discard <slug>
   ```
3. 完了をユーザーに報告する。
