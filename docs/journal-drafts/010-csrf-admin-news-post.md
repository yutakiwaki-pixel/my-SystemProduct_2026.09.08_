---
title: "管理者セッションで認証済みのお知らせ投稿APIがCSRFトークン/Origin検証なしでクロスサイトPOSTを受け付ける"
category: "CSRF / クロスサイトリクエストフォージェリ"
severity: "High" # 攻撃者は被害者(管理者)のセッションを使い、一般公開ページ(/news)に表示される任意内容のお知らせを本人操作として作成できる。金銭移動やアカウント乗っ取りではないためCriticalではないが、公開コンテンツを外部から改ざん・偽情報混入でき、事前の対策(トークン/Origin検証等)が完全に欠如しているためHigh(007のreservation createと同水準)。
status: "fixed"
target: "apps/vuln-lab"
area: "POST /api/admin/news (管理者お知らせ投稿)"
discovered_at: "2026-09-17"
fixed_at: "2026-09-17"
---

## 概要

管理者としてログイン済み(`admin_session` Cookie保持)の状態で、`Origin`ヘッダーを
`http://evil.example.com`のように自オリジンと異なる値に偽装したクロスサイト相当のリクエストを
`POST /api/admin/news`に送っても、リクエストが拒否されずに処理され、実際に`/admin/news`に
新しいお知らせが作成されることを確認した。このエンドポイントはCookieによる認証チェック
(`getCurrentAdmin()`)しか行っておらず、CSRFトークンや`Origin`/`Referer`ヘッダーによる
リクエスト送信元の検証が一切ない。実際の攻撃では、管理者が攻撃者の用意したページを閲覧した
だけで、自動送信フォーム経由で任意タイトル・任意本文のお知らせが一般公開ページ(`/news`)に
本人の操作として投稿されてしまう。

## 発見方法

curlで確認(ユーザー自身の再現手順)。

1. `admin@example.com` / `admin123`で管理者としてログインし、`admin_session` Cookieの値を
   取得する。
2. クロスサイトを模した偽装リクエストを送信する。
   ```
   curl -s -i -X POST http://localhost:3100/api/admin/news \
     -H "Cookie: admin_session=<value>" \
     -H "Origin: http://evil.example.com" \
     -F "title=csrf-test" -F "body=csrf-test"
   ```
3. レスポンスは`303 See Other`で`/admin/news`へのリダイレクト。
4. ブラウザで`/admin/news`を開き、"csrf-test"というお知らせが実際に作成されていることを確認。
   偽装した`Origin`ヘッダーにもかかわらずリクエストが成功しており、`Origin`/`Referer`検証や
   CSRFトークンによる保護が存在しないことが分かる。

## 原因

`apps/vuln-lab/src/app/api/admin/news/route.ts:6-27`:

```ts
export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 303);
  }

  try {
    const form = await request.formData();
    const title = String(form.get("title") ?? "");
    const body = String(form.get("body") ?? "");

    db.prepare("INSERT INTO news (title, body, created_at) VALUES (?, ?, ?)").run(
      title,
      body,
      new Date().toISOString(),
    );

    return NextResponse.redirect(new URL("/admin/news", request.url), 303);
  } catch (err) {
    return internalErrorResponse(err);
  }
}
```

このPOSTハンドラは認可判定を`getCurrentAdmin()`(`apps/vuln-lab/src/lib/session.ts:24-36`、
`admin_session` Cookieの値をそのままDBの`admin_sessions`テーブルに突き合わせるだけ)だけに
依存している。Cookieが有効な管理者セッションであることしか確認しておらず、そのリクエストが
本当に管理画面自身のフォームやスクリプトから発行されたものかどうかを検証する仕組み
(CSRFトークンの発行・検証、`Origin`/`Referer`ヘッダーのオリジンチェックなど)が存在しない。
そのため、`admin_session` Cookieがクロスサイトのリクエストと一緒に(ブラウザにより自動的に)
送られてしまえば、`getCurrentAdmin()`は無条件にリクエストを本人の操作として処理してしまう。

これは007(`docs/journal-drafts/007-csrf-reservation-create.md`)で`POST /api/reservations`に
ついて特定した原因と同一のクラスの欠陥であり、認証チェックのみでリクエストの送信元検証を
一切行っていない点が共通している。`apps/vuln-lab/src/app/api/reservations/route.ts`とは異なり、
本ファイルには`isSameOriginRequest()`のような検証は追加されておらず、`POST /api/admin/news`は
今回のfinding以前の状態のまま(検証なし)であることを確認した。

参考情報として、`admin_session` Cookieの発行箇所(ログインAPI)も存在するはずだが、本finding
のスコープは`POST /api/admin/news`のみであり、Cookie発行側の実装(`SameSite`属性の有無など)は
このfindingの根本原因の直接の対象ではない(007と同様、断定できる根拠は「このエンドポイントに
Cookie以外の送信元検証手段が一切存在しないこと」に限られる)。ログイン/Cookie発行側の詳細調査は
このfindingでは行っていない。

## 修正

`apps/vuln-lab/src/app/api/admin/news/route.ts`に、007(`docs/journal-drafts/007-csrf-reservation-create.md`)の
`POST /api/reservations`で採用したものと同じ形の`isSameOriginRequest()`チェックを追加した。

```ts
function isSameOriginRequest(request: Request): boolean {
  const expectedOrigin = new URL(request.url).origin;

  const origin = request.headers.get("origin");
  if (origin !== null) {
    return origin === expectedOrigin;
  }

  const referer = request.headers.get("referer");
  if (referer !== null) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return false;
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.redirect(new URL("/admin/login", request.url), 303);
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  }
  // ...既存のDB書き込み処理
}
```

`getCurrentAdmin()`による認証チェックの直後・DB書き込みより前に、この判定を挟んでいる。
`Origin`ヘッダーがあればそれを、無ければ(一部のブラウザ設定やリクエストの種類によっては
`Origin`が送られないことがあるため)`Referer`ヘッダーのオリジン部分を、このエンドポイント
自身のオリジンと比較する。どちらのヘッダーも存在しない場合は「同一オリジンだ」とは判断せず
`403`を返す(fail closed) — 正規のブラウザによる同一サイトのフォーム送信であれば、
`Origin`か`Referer`の少なくとも一方は必ず送られてくるため、両方欠落しているリクエストを
安全側に倒して拒否しても正規利用への影響はない。

**この方式を選んだ理由 / 検討した代替案:**

- **CSRFトークン方式(発行したワンタイムトークンをフォームに埋め込み、送信時に検証する)は
  採用しなかった。** セッションの発行・Cookieの設定方法自体は変更せずに済み、かつ管理画面の
  テンプレート側にトークンを埋め込む変更が不要な分、今回のfindingのスコープ(`POST /api/admin/news`
  のみ)に対して変更範囲が小さい。007で同じ判断を既にしており、一貫性の観点からも
  Origin/Refererチェックを踏襲した。
- **`isSameOriginRequest()`を共通ヘルパーに切り出して`reservations`と`admin/news`の両方から
  参照する形へのリファクタリングは、あえて行わなかった。** 本findingのスコープは
  `POST /api/admin/news`のみであり、`/api/contact`・`/api/register`・`/api/login`の
  CSRF対応はまだ別findingとして未着手のまま残っている。今この2箇所だけを共通化すると、
  残りのfindingを修正する際に「今度は3箇所目をどうするか」で再度設計判断が必要になり、
  かつ今回のfinding単体のdiffに無関係な共通化リファクタリングを混ぜることになる。
  CSRF対応が一通り出揃った段階でまとめて共通化を検討する方が、1finding=1diffの原則に沿う。

**追加した回帰テスト** (`apps/vuln-lab/src/app/api/admin/news/route.test.ts`、
`reservations/route.test.ts`と同じ構成):

1. 有効な管理者セッション(モックした`getCurrentAdmin()`)を持ちながら、`Origin`ヘッダーが
   このオリジンと異なるリクエスト(実際のPoCの再現)を送ると`403`が返り、`news`テーブルに
   行が追加されないこと。
2. `Origin`・`Referer`のどちらのヘッダーも無いリクエストも同様に`403`で拒否されること
   (fail closedの確認)。
3. 通常の同一オリジンからのフォーム送信(`Origin`が一致)は従来どおり`303`で
   `/admin/news`にリダイレクトされ、実際に`news`テーブルに1行追加されること
   (回帰防止 — 正規の投稿フローを壊していないことの確認)。

## 学んだこと

- **「認証(Authentication)されていること」と「そのリクエストの送信元(Origin)が信頼できること」は
  別の質問であり、片方を確認しても他方の答えにはならない。** `getCurrentAdmin()`は
  Cookieの値が有効なセッションに対応しているかどうかしか見ておらず、ブラウザはCookieを
  クロスサイトのリクエストにも自動的に付与してしまうため、認証チェックだけでは
  「本人が今このアクションを意図して実行した」ことの証明にはならない。状態変更を伴う
  すべてのエンドポイント(POST/PUT/DELETE等)では、認証チェックとは別に送信元検証
  (CSRFトークン、またはOrigin/Refererチェック)が必要になる。
- **同じ根本原因のfindingが複数箇所に存在する場合、修正パターンを使い回すことと、
  今すぐコードを共通化することは別の判断である。** 007で確立したOrigin/Refererチェックの
  “形”を再利用するのは一貫性のために良いが、まだ残っている同種findingの数が確定していない
  段階でコードの共通化(ヘルパー抽出)まで急ぐと、1finding=1diffのスコープを超えて
  無関係な箇所への変更が広がりやすい。パターンの再利用と実装の共通化は、後者を後回しに
  してよい。
- **「1つのエンドポイントが直接連携する別のエンドポイント」であっても、スコープ外のものには
  手を出さない規律が有効に機能した。** ログインAPI側の`admin_session`発行ロジック
  (`SameSite`属性の有無など)はこのfindingと隣接する関心事だが、根本原因の直接の対象ではなく、
  スコープ外として明示的に見送った。結果としてdiffが最小に保たれ、レビューとテストの
  対象が今回のfinding1件に閉じた状態を維持できた。

## 参考

- OWASP Top 10 2021: A01:2021 – Broken Access Control (CSRFはOWASP Top 10 2017まではA8として
  独立項目、2021版ではAccess Controlに統合)
- CWE-352: Cross-Site Request Forgery (CSRF)
