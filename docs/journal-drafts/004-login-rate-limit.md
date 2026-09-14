---
title: "会員/管理者ログインにブルートフォース対策が皆無で、パスワードを無制限に試行できる"
category: "識別と認証の失敗 / レート制限・アカウントロックアウト不備"
severity: "High" # 攻撃者が正しいメールアドレスさえ知っていれば、認証情報リスト攻撃やパスワード辞書攻撃をレート無制限に実行でき、admin/member 双方のアカウント乗っ取りに直結するため
status: "fixed" # found -> root-caused -> fixed
target: "apps/vuln-lab"
area: "/api/login, /api/admin/login"
discovered_at: "2026-09-14"
fixed_at: "2026-09-14"
---

## 概要

会員ログイン(`/api/login`)と管理者ログイン(`/api/admin/login`)に対して、同一メールアドレス宛に
間違ったパスワードで連続してログインを試行しても、一切ブロックされないことを確認した。
レート制限・アカウントロックアウト・CAPTCHAのいずれも存在せず、総当たり攻撃(ブルートフォース)
やパスワードスプレー攻撃に対して無防備な状態になっている。

## 発見方法

curlのみを使用。

1. 会員アカウント `sato@example.com` を対象に、以下のコマンドで異なる誤ったパスワードを
   20回連続で送信した。

   ```
   for i in {1..20}; do
     curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/api/login \
       --data-urlencode "email=sato@example.com" \
       --data-urlencode "password=wrong$i"
   done
   ```

2. 結果、20回とも同じ `303`(ログイン失敗時のリダイレクト)が返り、途中でブロックされる・
   応答が遅延する・エラーメッセージが変化するといった挙動は一切観測されなかった。
   すなわちレート制限・ロックアウト・CAPTCHAのいずれも存在しない。

## 原因

会員ログインの実装 (`apps/vuln-lab/src/app/api/login/route.ts:6-21`):

```ts
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    // Looks up the member by email + password hash directly — see apps/vuln-lab/CLAUDE.md.
    const member = row<Member>(
      db
        .prepare("SELECT * FROM members WHERE email = ? AND password_hash = ?")
        .get(email, hashPassword(password)),
    );

    if (!member) {
      return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
    }
```

管理者ログインの実装 (`apps/vuln-lab/src/app/api/admin/login/route.ts:6-21`) も同一パターン:

```ts
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    // Same lookup pattern as the member login (see api/login/route.ts).
    const admin = row<Admin>(
      db
        .prepare("SELECT * FROM admins WHERE email = ? AND password_hash = ?")
        .get(email, hashPassword(password)),
    );

    if (!admin) {
      return NextResponse.redirect(new URL("/admin/login?error=1", request.url), 303);
    }
```

いずれのハンドラも、リクエストごとに以下の処理をそのまま行うだけである。

- 送信された `email`/`password` からハッシュを計算し、DBに1発で問い合わせる。
- 一致しなければ即座に `303` を返して終わり。

この間に、失敗回数をカウントする・一定回数を超えたら遅延させる/ロックする・IPやメール単位で
試行を制限する、といったチェックが一切存在しない。`apps/vuln-lab/src/lib/db.ts` のスキーマ
(`members` / `admins` / `member_sessions` / `admin_sessions` テーブル)にも、ログイン試行回数や
最終失敗時刻を記録するカラム・テーブルは存在せず、失敗した試行そのものが状態として一切残らない
構造になっている。そのため、同じメールアドレスに対して何回失敗しても応答時間・応答内容・
ステータスコードが変化せず、外部から機械的にパスワードを総当たりされても検知・抑制する手段が
何もない。

## 修正（fixed）

`(scope, email)` 単位で連続失敗回数を記録し、閾値を超えたら一定時間ロックアウトする方式で
修正した。

- スキーマ (`apps/vuln-lab/src/lib/db.ts`): `login_attempts` テーブルを新設。
  `scope`(`"member"` | `"admin"`) + `email` を複合主キーとし、`fail_count` / `locked_until`
  / `updated_at` を持つ。会員・管理者を同じテーブルで扱いつつ `scope` で分離しているので、
  片方の失敗がもう片方のロックアウトに影響しない。
- ロジック (新規 `apps/vuln-lab/src/lib/login-rate-limit.ts`): `isLockedOut` /
  `recordFailedAttempt` / `clearFailedAttempts` の3関数。5回連続失敗で15分ロックアウト
  (`MAX_ATTEMPTS = 5`, `LOCKOUT_MS = 15分`)。ロックアウト中に再度失敗しても
  `isLockedOut` の時点で弾かれるため `recordFailedAttempt` は呼ばれず、カウンタは
  ロックアウト解除後の次の失敗から再び進む。ログイン成功時は `clearFailedAttempts` で
  そのメールの失敗履歴を消し、正当なユーザーが将来また失敗しても過去の失敗を引きずらない
  ようにしている。
- エンドポイント (`apps/vuln-lab/src/app/api/login/route.ts`,
  `.../api/admin/login/route.ts`): パスワード照合の**前**に `isLockedOut` をチェックし、
  ロックアウト中は誤答時とまったく同じレスポンス(同じ303ステータス・同じ
  `?error=1` リダイレクト先・Set-Cookieなし)を返す。誤答時は `recordFailedAttempt` を、
  成功時は `clearFailedAttempts` を呼ぶ。

検討した代替案と不採用の理由:

- **指数バックオフ(応答遅延)**: 固定ロックアウトより実装が複雑な割に、スクリプトで並列
  リクエストを送られると効果が薄い(1リクエストあたりの遅延は稼げても、並列度を上げれば
  総当たり速度は下がらない)。素朴な固定回数ロックアウトの方がこのアプリの脅威モデル
  (無認証の外部攻撃者によるcurlループ)には確実に効く。
- **IP単位の制限**: 検討はしたが、今回のPOCがそうであるように同一IPから複数アカウントを
  狙うパスワードスプレー攻撃には効くものの、IPは容易に分散・偽装できる上、開発環境では
  プロキシ越しの実IP取得の手当ても別途必要になる。まずメール単位で実装し、IP単位は
  必要になった時点で追加する方針とした。
- **CAPTCHA**: 実装コストと、この練習用アプリの検証範囲(APIレベルのブルートフォース対策)
  に対して過剰と判断し見送った。

回帰テスト (`route.test.ts` に追加):

- 会員・管理者それぞれについて、新規に作成したテスト専用アカウントへ5回連続で誤った
  パスワードを送った直後に**正しい**パスワードで6回目を送ると、ログインが拒否され
  (303 + `?error=1` + Set-Cookieなし)、ロックアウトが実際に効いていることを確認する。
  「正しいパスワードなのにブロックされる」というアサーションにすることで、単に
  「誤ったパスワードは弾かれる」という既存のテストと区別し、ロックアウト機構そのものが
  効いていることを検証している。
- 既存のSQLi回帰テスト・正常系ログインテストは無変更のまま残し、レート制限の追加が
  それらの挙動を壊していないことも合わせて確認した。

## 学んだこと

- **「ロックアウトを追加する」だけでは不十分で、レスポンスの見分けがつかないことまで
  含めて実装する必要がある。** ロックアウト自体は実装したのに、ロックアウト時と誤答時で
  レスポンス(ステータスコード・リダイレクト先・エラーメッセージ)が少しでも違うと、
  攻撃者はその差分をオラクルにして「このアカウントは今ロックアウト中だ」と判別でき、
  待ち時間を計算して再開したり、ロックアウトされていないアカウントだけを選んで攻撃を
  続けたりできてしまう。対策を入れるときは「対策が効いているか」だけでなく「対策の
  有無が外部から見分けられないか」も合わせて確認するべき。
- **失敗回数のような状態を持たせる設計は、最初のスキーマ設計時点で見落とされやすい。**
  今回の根本原因は、会員/管理者テーブルにログイン試行の失敗を記録する手段が最初から
  存在しなかったことにある。認証機能を作る際は、パスワード照合ロジック本体だけでなく
  「失敗をどう記録するか」を最初から設計に含めておくべきで、後から気づいて場当たり的に
  実装すると、今回のようにテーブル追加からロジック追加まで手戻りが大きくなる。
- **ロックアウトの粒度(メール単位かIP単位か)は脅威モデルによって使い分けが必要で、
  片方だけでは万能ではない。** メール単位のロックアウトは「同一アカウントへの総当たり」
  には効くが、「多数のメールアドレスに対して1〜2パターンのパスワードだけを試す」
  パスワードスプレー攻撃には効きにくい(各メールの失敗回数が閾値に達しないまま
  広く薄く試行されるため)。今回はメール単位のみで対応したが、IP単位の制限や
  「短時間に大量の異なるメールでログイン試行があった」ことを検知する仕組みは、
  将来的な追加対策の候補として残っている。
- **回帰テストは「対策の有無」ではなく「対策が実際に効く条件」をピンポイントで
  再現するべき。** 「5回失敗させた直後に正しいパスワードでも弾かれる」という
  アサーションは、ロックアウトのロジックが実際に発火していることの直接証拠になる。
  単に「誤ったパスワードは弾かれる」というテストのままだと、ロックアウト実装を
  誤って削除・無効化しても既存テストは通り続けてしまい、リグレッションを検知できない。

## 参考

- OWASP Top 10 2021: A07:2021 – Identification and Authentication Failures
- CWE-307: Improper Restriction of Excessive Authentication Attempts
- CWE-799: Improper Control of Interaction Frequency
