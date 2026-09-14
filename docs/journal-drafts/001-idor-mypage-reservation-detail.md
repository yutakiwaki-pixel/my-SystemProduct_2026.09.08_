---
title: "マイページの予約詳細で他人の予約が見えたIDOR"
category: "IDOR / アクセス制御不備"
severity: "High" # 認証さえ通っていれば連番IDの書き換えだけで全会員の予約(メニュー・希望日時・備考)を閲覧可能だったため
status: "fixed" # found -> root-caused -> fixed
target: "apps/vuln-lab"
area: "/mypage/reservations/[id]"
discovered_at: "2026-09-14"
fixed_at: "2026-09-14"
---

## 概要

`apps/vuln-lab`（自己ペネトレーションテスト練習用の「地域ビジネスサイト」）で、優先順位1件目
として狙っていたIDORを実際に確認できた。

## 発見方法

1. シード済みアカウント `sato@example.com` でログインし、マイページの予約詳細URL
   （`/mypage/reservations/1`）を確認。
2. 別の新規会員アカウントを登録し、自分の予約を1件作成（別IDが振られる）。
3. ログイン中のまま、URLの予約IDだけを `1`（sato さんの予約）に書き換えてアクセス。
4. 本来見えるべきでない他人の予約が閲覧できることを確認。

ブラウザのアドレスバー操作のみで再現でき、Burp Suiteなどの傍受ツールは不要だった。

## 原因

`apps/vuln-lab/src/app/mypage/reservations/[id]/page.tsx:20-22`

```ts
const reservation = row<Reservation>(
  db.prepare("SELECT * FROM reservations WHERE id = ?").get(id),
);
```

`getCurrentMember()` で誰がログインしているかは取得している（11行目）のに、その後の予約取得
クエリが `WHERE id = ?` だけで、取得したメンバーIDとの突き合わせ（`AND member_id = ?` 相当）
が存在しない。「ログインしていること」と「そのリソースの持ち主であること」を別々にチェック
すべきところ、後者が丸ごと抜けている、典型的なIDORのパターン。

## 修正

`apps/vuln-lab/src/app/mypage/reservations/[id]/page.tsx` のクエリを

```ts
db.prepare("SELECT * FROM reservations WHERE id = ? AND member_id = ?").get(id, member.id)
```

に変更。`member_id` が一致しない（＝他人の予約、または存在しない予約）場合は、どちらも同じ
`notFound()`（404）に倒した。403にせず404を選んだ理由は、403だと「IDは存在するが権限がない」
ことをレスポンスの違いで教えてしまい、それ自体が総当たりでの存在確認（ID列挙）に使える情報
漏洩になるため。「見えない」ものは「無い」ものと同じ応答にするのが安全側。

再発防止として、他人の予約IDを渡すと404になること／自分の予約は今まで通り閲覧できることの
回帰テストを追加した（`apps/vuln-lab/src/app/mypage/reservations/[id]/page.test.tsx`）。

## 学んだこと

- 「ログインしていること（認証）」と「そのリソースの持ち主であること（認可）」は別のチェック
  で、片方だけ実装して満足してしまいやすい。今回のコードはまさにその典型で、`getCurrentMember()`
  で認証は取れているのに、その後のクエリに認可の条件が丸ごと抜けていた。
- IDOR は特別なツールなしで見つかる。Burp Suiteのような傍受ツールは使わず、ブラウザの
  アドレスバーでURL中の数値IDを書き換えるだけで再現できた。「攻撃者視点では一番コストの
  低い脆弱性から刺さる」という実感を得られた。
- 修正は「認可条件をWHERE句に足すだけ」で済むほど小さいが、見つけるまでは気づきにくい。
  レビュー観点として「取得系クエリに `WHERE id = ?` だけが書かれていないか」を今後の
  チェックリストに加えたい。
- 404 vs 403 の選択自体もセキュリティ判断の一部（情報漏洩の最小化）だと学んだ。単に
  「弾ければよい」ではなく、弾き方（レスポンスの違い）が新たな情報源にならないかまで
  考える必要がある。

## 参考

- OWASP Top 10 2021: A01 Broken Access Control
