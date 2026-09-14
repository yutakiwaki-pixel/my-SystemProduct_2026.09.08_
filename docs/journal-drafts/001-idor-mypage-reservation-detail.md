---
title: "マイページの予約詳細で他人の予約が見えたIDOR"
category: "IDOR / アクセス制御不備"
severity: "TBD"
status: "found" # found -> root-caused -> fixed
target: "apps/vuln-lab"
area: "/mypage/reservations/[id]"
discovered_at: "2026-09-14"
fixed_at: null
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

## 修正（TODO）

未対応。次にやるとしたら:
- クエリに `AND member_id = ?`（`member.id` を渡す）を追加する
- 一致しない場合は404（存在自体を教えない）にするか403にするか要検討

## 学んだこと（TODO）

原因・修正が固まってから記入する。

## 参考

- OWASP Top 10 2021: A01 Broken Access Control
