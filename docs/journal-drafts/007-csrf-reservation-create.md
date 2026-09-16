---
title: "会員セッションで認証済みの予約作成APIがCSRFトークン/Origin検証なしでクロスサイトPOSTを受け付ける"
category: "CSRF / クロスサイトリクエストフォージェリ"
severity: "High" # 会員本人になりすまして任意内容の予約(氏名以外のデータ)を作成できる。金銭移動や退会ではないため Critical ではないが、被害者に意図しない行動履歴を残せ、事前の対策(トークン等)が完全に欠如しているため High。
status: "fixed"
target: "apps/vuln-lab"
area: "POST /api/reservations (会員マイページの予約作成)"
discovered_at: "2026-09-16"
fixed_at: "2026-09-16"
---

## 概要

会員としてログイン済みの状態で、別オリジン(`file://`)に置いた自動送信フォームから
`POST /api/reservations` を叩くと、`member_session` Cookieがクロスサイトのフォーム送信でも
サーバーに送られてしまい、CSRFトークンやOriginヘッダー検証が一切ないためリクエストが本人の
操作として処理された。実際にマイページの予約履歴に攻撃者が指定した内容(`CSRF-PoC`)の予約が
追加されることを確認した。

## 発見方法

ブラウザのみで確認。

1. `http://localhost:3100/login` で `sato@example.com` / `password123` としてログインし、
   `member_session` Cookieを保持した状態にする。
2. 別オリジン(`file://`)から、以下の自動送信フォームを開く。
   ```html
   <form action="http://localhost:3100/api/reservations" method="POST">
     <input type="hidden" name="menu" value="CSRF-PoC" />
     <input type="hidden" name="reservedAt" value="2026-12-01T10:00" />
     <input type="hidden" name="partySize" value="1" />
     <input type="hidden" name="note" value="CSRF経由の予約" />
   </form>
   ```
3. 自動送信後、ブラウザは `http://localhost:3100/mypage` に着地し(= `member_session` Cookieが
   クロスサイトのフォーム送信でもサーバーに送られ、認証済みとして処理された)、マイページの
   予約履歴に「CSRF-PoC」という新しい予約が実際に追加されていることを確認した。

## 原因

`apps/vuln-lab/src/app/api/reservations/route.ts:5-26`:

```ts
export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  try {
    const form = await request.formData();
    const menu = String(form.get("menu") ?? "");
    const reservedAt = String(form.get("reservedAt") ?? "");
    const partySize = Number(form.get("partySize") ?? 1);
    const note = String(form.get("note") ?? "");

    db.prepare(
      "INSERT INTO reservations (member_id, menu, party_size, reserved_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(member.id, menu, partySize, reservedAt, note, new Date().toISOString());

    return NextResponse.redirect(new URL("/mypage", request.url), 303);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

この`POST`ハンドラは認可判定を`getCurrentMember()`(`apps/vuln-lab/src/lib/session.ts:8-22`、
`member_session` Cookieの値をそのままDBの`member_sessions`テーブルに突き合わせるだけ)だけに
依存している。Cookieが有効であることしか確認しておらず、そのリクエストが本当に自サイトの
フォームやスクリプトから発行されたものかどうかを検証する仕組み(CSRFトークンの発行・検証、
`Origin`/`Referer`ヘッダーのオリジンチェックなど)が存在しない。

参考情報として、`member_session` Cookieの発行箇所である
`apps/vuln-lab/src/app/api/login/route.ts:40`も確認した(ただし、このセッション発行コード
自体は本finding のスコープ外であり、今回変更しない):

```ts
response.cookies.set(MEMBER_COOKIE, token, { path: "/" });
```

確認できる事実は「`sameSite`オプションが明示的に指定されていない」という点のみである。標準の
`SameSite=Lax`仕様では、`<form method="POST">`のようなクロスサイトのトップレベルPOST遷移も
本来ブロック対象であり、送信を許すのはGETなどの安全なメソッドによるトップレベルナビゲーション
に限られる。したがって「`Lax`だからクロスサイトPOSTでもCookieが送られる」という一般化した
説明は正確ではない。今回のPoCではログイン直後(2分以内)にフォームを送信しており、Cookieが
実際に送られたのは、Chrome等が`SameSite`未指定のCookieをデフォルトで`Lax`扱いにする際に
併せて実装している時限的な互換緩和(発行から一定時間はクロスサイトのトップレベルPOSTでも
送信を許容する、通称「Lax+POST」の経過措置)による可能性が高いと考えられるが、ブラウザの
内部挙動に依存するため断定はしない。

断定できる根拠は次の2点に限られる。(1) このCookieに`SameSite`属性が明示的に設定されておらず
挙動がブラウザのデフォルト実装に委ねられていること、(2) `POST /api/reservations`側に
CSRFトークンや`Origin`/`Referer`検証など、Cookie以外にリクエストの正当性を独立して確認する
手段が一切存在しないこと。この(2)こそが、Cookieがどのような経路で送られてきたとしても
`getCurrentMember()`さえ通れば無条件にリクエストを本人の操作として処理してしまう、本findingの
直接の原因であり、今回のスコープで対処すべき箇所である。

## 修正

`apps/vuln-lab/src/app/api/reservations/route.ts`の`POST`ハンドラに、`getCurrentMember()`に
よる認証チェックの直後・DB書き込みの前段として、リクエストの`Origin`ヘッダー(無ければ
`Referer`ヘッダーにフォールバック)がこのエンドポイント自身のオリジンと一致するかを検証する
`isSameOriginRequest()`を追加し、一致しない場合は`403`を返してDB書き込みに進ませないように
した。`Origin`・`Referer`のどちらも存在しないリクエストは(通常のブラウザ経由の同一オリジン
フォーム送信では起こらないため)fail closedで拒否する。

対応候補として原因調査時点で(1) CSRFトークンの発行・検証、(2) `Origin`/`Referer`のオリジン
検証、の2つを挙げていたが、(2)を採用した。理由:

- **スコープを`route.ts`一箇所に閉じられる。** CSRFトークン方式は、トークンをどこかに
  (セッションやCookieに)保持し、`GET /mypage/new`のフォーム描画時にhiddenフィールドとして
  埋め込み、`POST`側で照合する必要があり、今回のfindingのスコープ外と明記した
  `src/app/mypage/new/page.tsx`(フォーム側)や、場合によってはセッション周りの実装
  (`src/lib/session.ts`)にも変更が及ぶ。Origin/Refererチェックは`POST`ハンドラ内の検証
  ロジック追加のみで完結し、フォーム側・セッション発行側は無改修で成立する。
- **ブラウザの標準動作に依拠でき、追加の状態管理が要らない。** `Origin`ヘッダーはFetch標準上、
  GET/HEAD以外のリクエスト(今回のような`<form method="post">`によるクロスサイト送信も含む)
  では常に付与されるため、CSRFトークンのような追加のサーバー側状態(発行・保管・失効)を
  持たずに、リクエストの送信元を独立して検証できる。

一方で、このOrigin/Refererチェックは「ブラウザが送るヘッダーを信頼する」方式であり、
CSRFトークンほど強固ではない(ブラウザ実装のバグや、ヘッダーを制御できる非ブラウザ経由の
特殊なクライアントには理論上弱い)。この会員予約作成エンドポイントの脅威モデル(通常の
ブラウザからのクロスサイトフォーム送信を防げれば十分)には見合っているが、今後同種の対策を
`apps/vuln-lab/CLAUDE.md`に記載の他のPOSTエンドポイント(admin news、contact、register、
login)にも広げる場合は、エンドポイントごとの脅威モデル次第でCSRFトークン方式への切り替えも
再検討する余地がある。

### 追加した回帰テスト

`apps/vuln-lab/src/app/api/reservations/route.test.ts`に3ケースを追加した(`getCurrentMember`
はモックし、認証は常に成功する前提でCSRF検証ロジックのみを対象にしている):

1. **クロスサイト送信を拒否できること(本findingのPoC相当)** — 有効なセッションを持つ会員から
   のリクエストでも、`Origin`ヘッダーが`https://attacker.example`のように自オリジンと異なれば
   `403`を返し、DBに予約が1件も作成されないことを確認。
2. **`Origin`・`Referer`のいずれも無いリクエストを拒否できること(fail closed)** — 両ヘッダーが
   欠落したリクエストも`403`で拒否され、DBに予約が作成されないことを確認。実装を「ヘッダーが
   無ければ通す」というfail-open方向に誤って書き換えてしまう回帰を検知する。
3. **通常の同一オリジンのフォーム送信は従来通り成功すること** — `Origin`が自オリジンと一致する
   場合は`303`で`/mypage`にリダイレクトされ、DBに予約が1件作成されることを確認。CSRF対策の
   追加によって正規の利用フローを壊していないことの確認。

## 学んだこと

- **Cookieベースの認証は「本人のセッションである」ことしか証明せず、「本人が今この操作を
  意図して行った」ことは証明しない。** `getCurrentMember()`のような認証チェックだけに依存した
  状態変更エンドポイントは、ブラウザがCookieを自動付与する性質そのものによってCSRFに対して
  脆弱になる。認可(誰か)と、リクエストの正当な発生源(どこから)は別の検証軸であり、
  状態変更を伴うエンドポイントでは両方が必要。
- **Origin/Refererのオリジン検証は、セッション発行側やフォーム側に一切手を入れずに導入できる、
  エンドポイント単体で完結する軽量なCSRF対策になる。** CSRFトークン方式は防御としてより
  強固だが、フォーム描画・セッション管理などfindingのスコープを越えた箇所への変更が必要に
  なりがちで、「再現・確認した1エンドポイントだけを直す」という今回のスコープ制約とは相性が
  悪かった。修正の影響範囲を最小化したい場合、まずOrigin/Refererチェックが有力な選択肢になる。
- **「ヘッダーが無ければ通す」ではなく「無ければ拒否する」という向きを意識的に選ぶ必要がある。**
  正規のブラウザ同一オリジン送信では`Origin`か`Referer`のどちらかは基本的に付与されるため、
  両方欠落したリクエストを拒否してもUX上の副作用はほとんどない一方、拒否側に倒しておかないと
  ヘッダーを送らない攻撃経路(あるいはプロキシ等でヘッダーが除去されるケース)を素通りさせて
  しまう。fail-open/fail-closedのどちらに倒すかは実装時に明示的に決め、それを回帰テストで
  固定しておくべきポイントだと分かった。
- **CSRF対策の回帰テストは「防御が効くこと」と「正規フローを壊していないこと」の両方を1セット
  で書く必要がある。** 拒否ケースだけを書くと、防御を過剰に厳しくして正規ユーザーの操作まで
  拒否してしまう別の不具合を検知できない。今回のように「クロスサイトは拒否」「ヘッダー欠落も
  拒否」「同一オリジンは許可」の3点セットで初めて、修正がfindingを塞ぎつつ既存機能を壊して
  いないと言える。

## 参考

- OWASP Top 10 2021: A01:2021 – Broken Access Control (CSRFはOWASP Top 10 2017まではA8として
  独立項目、2021版ではAccess Controlに統合)
- CWE-352: Cross-Site Request Forgery (CSRF)
</content>
