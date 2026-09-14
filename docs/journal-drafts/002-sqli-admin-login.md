---
title: "管理者ログインでパスワード不要の認証バイパスができたSQLインジェクション"
category: "SQLインジェクション"
severity: "Critical" # パスワードを一切知らずに管理者としてログインできてしまうため
status: "fixed" # found -> root-caused -> fixed
target: "apps/vuln-lab"
area: "/admin/login (および /login も同じ実装パターン)"
discovered_at: "2026-09-14"
fixed_at: "2026-09-14"
---

## 概要

`apps/vuln-lab`の優先順位2件目として狙っていたSQLインジェクションを、管理者ログイン
（`/admin/login`）で実際に確認できた。パスワードを一切知らなくても、メールアドレス欄への
入力だけで管理者としてログインできてしまう。

## 発見方法

1. `/admin/login` のメールアドレス欄に `' OR '1'='1' -- ` を入力しようとしたが、
   `<input type="email">` のクライアント側バリデーション（`@`必須）に阻まれ、ブラウザの
   フォームからは直接送信できなかった。
2. サーバー側は無防備なはずなので、ブラウザのバリデーションを迂回して `curl` で直接
   `/api/admin/login` にPOSTした:
   ```bash
   curl -i http://localhost:3100/api/admin/login \
     --data-urlencode "email=' OR '1'='1' -- " \
     --data-urlencode "password=x"
   ```
3. `password` には適当な値（`x`）を入れただけにもかかわらず、`303 See Other` /
   `Location: /admin` / `Set-Cookie: admin_session=...` が返り、管理者としてログインできた
   ことを確認した。

クライアント側バリデーションはサーバー側の防御にはならない、という点も併せて確認できた
（`curl`や開発者ツールでの`type`書き換えで容易に迂回できる）。

## 原因

`apps/vuln-lab/src/app/api/admin/login/route.ts`（会員側の `src/app/api/login/route.ts` も
まったく同じパターン）:

```ts
const query = `SELECT * FROM admins WHERE email = '${email}' AND password_hash = '${hashPassword(
  password,
)}'`;
const admin = row<Admin>(db.prepare(query).get());
```

`email`（フォームからの生入力）をSQL文字列へテンプレートリテラルで直接埋め込んでいた。
`password`は先に`hashPassword()`でSHA-256ハッシュ化してから埋め込むため攻撃者が構文を
制御できないが、`email`は無加工なので、値に`'`や`--`（SQLiteの行コメント）を含められる。

`' OR '1'='1' -- ` を渡すと実行されるクエリは実質:

```sql
SELECT * FROM admins WHERE email = '' OR '1'='1' -- ' AND password_hash = '...'
```

となり、`--`以降（本来の`password_hash`照合）がまるごとコメントアウトされ、`'1'='1'`は
常に真になるため、パスワード照合なしで（`.get()`が返す）最初のレコードにログインできて
しまう。

## 修正

管理者ログイン・会員ログインの両方で、文字列連結によるクエリ組み立てをやめ、プレースホルダ
（`?`）を使ったパラメータ化クエリに変更した:

```ts
const admin = row<Admin>(
  db
    .prepare("SELECT * FROM admins WHERE email = ? AND password_hash = ?")
    .get(email, hashPassword(password)),
);
```

（会員側 `src/app/api/login/route.ts` も同様。）これにより`email`の内容は常に「値」として
扱われ、SQL構文の一部として解釈されることがなくなる。

再発防止として、両ルートに以下の回帰テストを追加した
（`src/app/api/admin/login/route.test.ts`, `src/app/api/login/route.test.ts`）:
- `' OR '1'='1' -- ` を`email`に渡しても認証が突破されず、通常のログイン失敗と同じ応答
  （`error=1`へのリダイレクト、Cookieなし）になること
- 正しい認証情報では従来通りログインできること

なお、これらのテストが同じSQLiteファイルへ別コネクションで同時アクセスすることで
`SQLITE_BUSY`（database is locked）が断続的に発生したため、`vitest.config.ts`で
`fileParallelism: false`にしてテストファイルを直列実行するよう変更した（テスト基盤側の
修正で、脆弱性そのものとは無関係）。

## 学んだこと

- パスワードだけハッシュ化されていても、クエリの組み立て方自体（文字列連結）が壊れていれば
  意味がない。今回も`password`側は一見「対策済み」に見えたが、`email`側が無防備なまま
  だったため、結局は認証ロジック全体が壊れていた。ハッシュ化と、クエリ構築の安全性は
  別軸のチェックが必要。
- `--`によるコメントアウトは、クエリの「後ろ半分を消す」攻撃として強力。WHERE句が複数条件
  を`AND`で連結している場合、先頭の条件だけ真にできればそれ以降を無効化できてしまう。
- `<input type="email">`のようなクライアント側バリデーションは、UXの補助であってセキュリ
  ティ境界ではない。`curl`や開発者ツールでの`type`書き換えなど、ブラウザを経由しない/迂回
  する手段は常にある前提でサーバー側を作る必要がある。
- 修正自体はテンプレートリテラルをプレースホルダに変えるだけで、IDORのときと同様「直すのは
  小さいが気づくまでが勝負」という構図だった。レビュー観点として「SQL文字列にリクエスト由来
  の値をテンプレートリテラル/文字列連結で埋め込んでいないか」をチェックリストに加えたい。

## 参考

- OWASP Top 10 2021: A03 Injection
- CWE-89: SQL Injection
