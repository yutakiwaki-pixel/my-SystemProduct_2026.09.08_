---
title: "セッショントークンが予測可能で、会員・管理者どちらのセッションも乗っ取り得る"
category: "識別と認証の失敗 / セッションID予測可能性"
severity: "High" # トークンの前半(時刻由来)は既知の発行時刻から再計算でき、後半もCSPRNGでないMath.random()由来のため、実効エントロピーが小さく総当たり・予測が可能。member_session・admin_session双方が同じ生成関数を使うため管理者アカウント乗っ取りにも直結する
status: "fixed" # found -> root-caused -> fixed
target: "apps/vuln-lab"
area: "/api/login, /api/admin/login (共通のトークン生成関数 generateToken)"
discovered_at: "2026-09-14"
fixed_at: "2026-09-14"
---

## 概要

会員ログイン(`/api/login`)・管理者ログイン(`/api/admin/login`)がともに発行するセッション
トークンを、1秒間隔で3回連続ログインして採取・比較した。3つのトークンはいずれも先頭5文字が
一致しており、生成式(`src/lib/crypto.ts`の`generateToken`)を確認したところ、トークン前半は
発行時刻(`Date.now()`)をbase36化しただけの値で、発行時刻さえ分かれば計算・絞り込みが可能、
後半も暗号学的に安全でない`Math.random()`由来であることが分かった。見た目の文字列長に反して
実効的なエントロピーが小さく、セッショントークンの総当たり・統計的予測に対して脆弱な状態に
なっている。

## 発見方法

curlのみを使用。

1. 正しい認証情報(`sato@example.com` / `password123`)で1秒間隔で3回連続ログインし、都度の
   `Set-Cookie`ヘッダーからトークン値を採取した。

   ```
   for i in 1 2 3; do
     curl -s -i http://localhost:3100/api/login \
       --data-urlencode "email=sato@example.com" \
       --data-urlencode "password=password123" \
       | grep -i set-cookie
     sleep 1
   done
   ```

2. 得られた3つのトークンは以下の通り。

   ```
   mu0ubpfmd69se240g99
   mu0ubq7zl0h1eifm8jg
   mu0ubr0fa5raqn3i8vu
   ```

3. 3つとも先頭の`mu0ub`(5文字)が共通していた。実装(`src/lib/crypto.ts`の`generateToken`)を
   確認すると、トークンは`${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`と
   いう生成式であり、先頭部分は`Date.now()`をbase36化したもの(現在の時刻ではその長さは8文字
   程度)であるため、発行時刻が分かればその部分は計算・推測可能。実質のランダム性は
   `Math.random()`由来の残り部分のみで、`Math.random()`は暗号学的に安全な乱数生成器
   (CSPRNG)ではない。`member_session`(会員)・`admin_session`(管理者)の両方が同じ
   `generateToken()`を使っている。

## 原因

トークン生成本体 (`apps/vuln-lab/src/lib/crypto.ts:9-11`):

```ts
export function generateToken(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}
```

この一つの関数が、会員・管理者どちらのログインでも共通のセッショントークンとして使われている。

会員ログイン (`apps/vuln-lab/src/app/api/login/route.ts:34-42`):

```ts
    const token = generateToken();
    db.prepare("INSERT INTO member_sessions (token, member_id, created_at) VALUES (?, ?, ?)").run(
      token,
      member.id,
      new Date().toISOString(),
    );

    const response = NextResponse.redirect(new URL("/mypage", request.url), 303);
    response.cookies.set(MEMBER_COOKIE, token, { path: "/" });
```

管理者ログイン (`apps/vuln-lab/src/app/api/admin/login/route.ts:33-41`) も同一パターン:

```ts
    const token = generateToken();
    db.prepare("INSERT INTO admin_sessions (token, admin_id, created_at) VALUES (?, ?, ?)").run(
      token,
      admin.id,
      new Date().toISOString(),
    );

    const response = NextResponse.redirect(new URL("/admin", request.url), 303);
    response.cookies.set(ADMIN_COOKIE, token, { path: "/" });
```

いずれの経路も、パスワード照合に成功した直後に`generateToken()`をそのまま呼び、返り値を
そのままセッションテーブル(`member_sessions.token` / `admin_sessions.token`)へ保存し、
そのままクッキー値としてセットしているだけである。この`generateToken()`が抱える問題は2つ
重なっている。

- **前半が予測可能**: `Date.now().toString(36)`はミリ秒単位のUNIXタイムスタンプをbase36化
  しただけであり、暗号論的な秘密要素を一切含まない。攻撃者がおおよその発行時刻(サーバーの
  レスポンスヘッダーの`Date`や、リクエストを送った自分の時計)を知っていれば、この部分は
  総当たりではなくほぼ一意に計算できてしまう。
- **後半に暗号学的な安全性がない**: 残りの`Math.random().toString(36).slice(2)`は
  `Math.random()`(V8では内部的にxorshift128+ベースのPRNG)に由来し、`crypto.randomBytes`や
  `crypto.randomUUID`のようなCSPRNGではない。予測不可能性がセキュリティ上の要件になる
  トークン生成にこの関数を使うべきではない、というのは一般に知られた注意点であり、内部状態が
  推測できれば理論上は後続の出力も予測し得る。

さらに、この関数が`member_sessions`・`admin_sessions`の両方で共有されているため、脆弱性が
一箇所に留まらず、会員セッションだけでなく管理者セッションの乗っ取りにも直結する構造に
なっている。

## 修正

`generateToken()`を、時刻ベースの接頭辞と`Math.random()`を組み合わせる方式から、CSPRNG
(`node:crypto`の`randomBytes`)由来のバイト列だけを使う方式に置き換えた
(`apps/vuln-lab/src/lib/crypto.ts`):

```ts
import { createHash, randomBytes } from "node:crypto";

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}
```

`member_sessions.token` / `admin_sessions.token`はどちらもスキーマ上`TEXT PRIMARY KEY`で
長さ制約がないため、出力形式(base36の可変長文字列 → 固定長64文字のhex)を変えてもDB・
Cookie・呼び出し側(`/api/login`, `/api/admin/login`, `/api/register`の3か所、いずれも
戻り値をそのままトークンとして保存・Cookieにセットするだけ)には変更不要だった。

検討した代替案:
- `crypto.randomUUID()`: 実装は簡単だが、UUID v4は正味122ビットしかランダム性がなく、
  かつ「これはUUIDである」という形式がハッシュ化なしでも外部から一目で分かってしまう。
  今回は単純に「固定長・高エントロピーな不透明トークン」であればよいので、
  `randomBytes(32)`(256ビット)をそのままhex化する方が意図が明確で、将来ビット数を
  変えたくなったときも引数ひとつで済む。
- 時刻部分だけを残しつつランダム部分のみCSPRNG化する折衷案: 時刻由来の接頭辞は攻撃者が
  発行時刻を知っている前提では実質エントロピーへの寄与がゼロであり、残す理由がない
  (ソート可能性などトークンに時刻情報を持たせたい要件も特になかった)ため採用しなかった。
  時刻情報が本当に必要なら、`created_at`列(発行時に別途記録済み)を使えばよい。

再発防止として、`src/lib/crypto.ts`の既存テストファイル(`crypto.test.ts`)に
`generateToken`向けの回帰テストを追加した:
- `Date.now()`を固定値にモックした状態で連続生成した2つのトークンが、先頭部分も含めて
  一致しないこと(時刻由来の再計算可能な接頭辞が復活していないことの確認)
- 出力が`/^[0-9a-f]{64}$/`にマッチすること(256ビットのhexという固定フォーマットで
  あることの確認。base36の可変長文字列に戻っていないことも兼ねて検証する)

## 学んだこと

- 「文字列としては長くてランダムに見える」ことと「エントロピーが十分にある」ことは別物。
  今回のトークンは見た目上20文字前後あったが、前半は既知の時刻から再計算可能、後半も
  `Math.random()`のPRNG状態に依存するため、表面上の文字列長がそのままセキュリティ強度を
  保証しない。トークン生成をレビューするときは「生成式のどの部分が実際に予測不可能な
  エントロピー源か」を分解して確認する必要がある。
- `Date.now()`のような「一意ではあるが秘密ではない」値を、セキュリティ境界となるトークンの
  一部にそのまま混ぜ込むのは危険なアンチパターン。一意性(ユニークであること)と
  予測不可能性(推測できないこと)は別の要件であり、前者を満たしていても後者を満たすとは
  限らない。
- `Math.random()`はJavaScript標準のPRNGとして手軽だが、CSPRNGではないため
  セキュリティ上の予測不可能性が要件になる値(セッショントークン、パスワードリセット
  トークン、CSRFトークンなど)には使うべきではない、というのはこのコードベースで
  繰り返し出てくる注意点になりそうなので覚えておきたい。Node.jsであれば
  `node:crypto`の`randomBytes`/`randomUUID`のようなCSPRNGベースのAPIを使う。
- 今回のように「1つの生成関数を複数の権限レベル(会員・管理者)が共有している」構造は、
  1箇所の脆弱性が影響範囲を横断的に広げる。裏を返せば、共通化されているからこそ修正も
  1箇所で両方に効く。設計時点でどこまで共通化するかは、修正のしやすさと影響範囲の
  広さのトレードオフとして意識しておきたい。

## 参考

- OWASP Top 10 2021: A02:2021 – Cryptographic Failures
- CWE-330: Use of Insufficiently Random Values
- CWE-338: Use of Cryptographically Weak Pseudo-Random Number Generator (PRNG)
