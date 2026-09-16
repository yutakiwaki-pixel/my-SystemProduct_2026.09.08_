---
title: "パスワードがソルトなし・単純なSHA-256で保存されており、同一パスワードのユーザー間でハッシュが一致してしまう"
category: "暗号化の失敗 / 弱いパスワードハッシュ"
severity: "High" # ソルトなし単純ハッシュのためレインボーテーブル照合が可能で、かつSHA-256は高速なためDB漏洩時にオフライン総当たりで大量アカウントの平文パスワードが復元され得る。ただしリモートから対話的に悪用できる脆弱性ではなく、DBの内容を読める前提が必要な点でCriticalではなくHigh
status: "fixed" # found -> root-caused -> fixed
target: "apps/vuln-lab"
area: "会員登録(/api/register)・会員ログイン(/api/login)・管理者ログイン(/api/admin/login) 共通のパスワードハッシュ関数(src/lib/crypto.tsのhashPassword)"
discovered_at: "2026-09-14"
fixed_at: "2026-09-14"
---

## 概要

パスワードの保存方法(`src/lib/crypto.ts`の`hashPassword`。会員登録・会員ログイン・管理者
ログインの全てで共通利用)を調査し、ローカルのSQLiteファイルに保存されたパスワードハッシュ
と、既知の平文パスワードから手元で計算したSHA-256ハッシュが完全一致することを確認した。
つまりパスワードはソルトなしの単純なSHA-256でハッシュ化されているだけであり、同じ平文
パスワードなら異なるユーザー間でも同一のハッシュ値になる。事前計算済みハッシュ辞書
(レインボーテーブル)との照合や、SHA-256の高速性を利用したオフラインでの高速総当たり
攻撃に対して無防備な状態になっている。

## 発見方法

ローカルのSQLiteファイルを直接開き、シェルコマンドのみで確認した。

1. アプリのDBファイルを直接開き、会員テーブルのメールアドレスとパスワードハッシュを取得
   した。

   ```
   sqlite3 apps/vuln-lab/.data/dev.sqlite3 "SELECT email, password_hash FROM members;"
   ```

2. 会員`sato@example.com`の`password_hash`は次の値だった。

   ```
   ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f
   ```

3. 手元で、シードデータとして知られている平文パスワード`password123`(README/
   `apps/vuln-lab/CLAUDE.md`に記載の既定シードアカウント)のSHA-256を計算した。

   ```
   echo -n "password123" | shasum -a 256
   ```

4. 出力は`ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f`となり、
   DBに保存されている値と完全一致した。ソルトが加えられていれば同じ平文からでも
   ユーザーごとに異なるハッシュ値になるはずであり、単純にDBの値と生のSHA-256計算値が
   一致したこと自体が、ソルトなしの単純ハッシュであることの直接証拠になる。

## 原因

パスワードハッシュ生成本体 (`apps/vuln-lab/src/lib/crypto.ts:5-7`):

```ts
export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}
```

この一つの関数が、以下の3箇所すべてでパスワードの保存・照合に共通利用されている。

- 会員登録 (`apps/vuln-lab/src/app/api/register/route.ts:16`):
  `.run(email, hashPassword(password), name, now)` — 登録時にそのまま`members.password_hash`
  へ保存。
- 会員ログイン (`apps/vuln-lab/src/app/api/login/route.ts:24`):
  `.get(email, hashPassword(password))` — ログイン時に入力パスワードを同じ関数でハッシュ化
  し、DB上の値とSQLレベルで一致するかどうかだけで照合。
- 管理者ログイン (`apps/vuln-lab/src/app/api/admin/login/route.ts:23`):
  `.get(email, hashPassword(password))` — 管理者側も同一関数・同一ロジックで照合。

`hashPassword`が抱える問題は2つ重なっている。

- **ソルトが一切ない**: 呼び出し側(登録・両ログイン)のどこにもユーザーごとのランダムな
  ソルトを生成・付加する処理がなく、`createHash("sha256").update(password)`は入力された
  平文パスワードのみに依存する。そのため同じ平文パスワードを使う異なるユーザーは、
  ユーザーIDやメールアドレスに関わらず必ず同一の`password_hash`になる。これは
  「DBの値と、事前に一般的なパスワード辞書を同じ関数でハッシュ化したものを照合する」
  だけで、ソルトによる保護なしに平文候補を突合できてしまうことを意味する(レインボー
  テーブル攻撃)。
- **汎用ハッシュ関数を直接使っている(低速・適応的なパスワード用KDFではない)**:
  SHA-256は本来メッセージダイジェスト用に設計された、意図的に高速な汎用ハッシュ関数
  であり、パスワード保存を目的として反復コストやメモリコストを持つ`bcrypt`/`scrypt`/
  `argon2`のような適応的パスワードKDFとは設計目的が異なる。SHA-256は最新のGPU等を
  使えば1秒間に大量の候補を試行できるため、DBが漏洩した場合にオフラインで高速な
  総当たり攻撃を仕掛けられてしまう。

さらに、この1つの関数が会員登録・会員ログイン・管理者ログインの3箇所全てで共有されている
ため、修正時にはこの1箇所を直せば全経路に効く一方、現状ではこの1箇所の設計上の欠陥が
会員・管理者どちらのパスワードにも共通の脆弱性として影響している。

## 修正

`hashPassword`を、ソルトなし単純SHA-256から、ソルト付きの適応的パスワードKDF
(`scrypt`)へ置き換えた(`apps/vuln-lab/src/lib/crypto.ts`):

```ts
export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES); // 16 bytes, per call
  const hash = scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}
```

`bcrypt`/`argon2`ではなく`scrypt`を選んだのは、`node:crypto`が標準で`scryptSync`を
提供しており、このファイルがすでに同じモジュールの`randomBytes`/`timingSafeEqual`を
使っていたため。外部パッケージを追加せずに、SHA-256のような汎用ダイジェストではない
本物の適応的(CPU/メモリコストを持つ)KDFに切り替えられる。コストパラメータは
`N=16384(2^14)`, `r=8`, `p=1`とし、`scryptSync`のデフォルトメモリ上限(32MB)を
超えないよう`maxmem`を64MBに引き上げた(必要メモリは概算`128 * N * r`バイト)。

保存形式は`scrypt$N$r$p$<saltHex>$<hashHex>`という自己記述的な文字列にした。ソルトと
コストパラメータをハッシュ値自身に埋め込むことで、将来`N`等を引き上げても、DBに
既に保存されている古いハッシュの検証が壊れない(検証時は保存された値からパラメータを
読み取って使う)。

これに伴い、ソルトなしハッシュの前提だった「SQLレベルでの値一致」による照合
(`WHERE email = ? AND password_hash = ?`)は、ソルト付きハッシュでは原理的に成立
しなくなる(同じ平文でも呼び出しごとに異なる`password_hash`になるため)。そのため
`verifyPassword(password, stored)`を新設し、`/api/login`・`/api/admin/login`双方の
照合ロジックを「`email`だけでSELECTし、取得した`password_hash`を`verifyPassword`で
検証する」形に変更した。`verifyPassword`は保存値からアルゴリズム識別子・パラメータ・
ソルトを取り出して同じ条件でハッシュを再計算し、`===`ではなく`timingSafeEqual`で
比較する(タイミングサイドチャネルで一致バイト数が漏れないようにするため)。不正な
形式(旧SHA-256の値や壊れた文字列)が渡された場合は例外を投げず`false`を返す。

会員登録(`/api/register`)とシード処理(`src/lib/db.ts`)は、`hashPassword`の
シグネチャ(引数・同期呼び出し)が変わらないため無変更で新方式に移行できた。

再発防止として`src/lib/crypto.test.ts`に回帰テストを追加した:
- 同じ平文パスワードでも`hashPassword`の呼び出しごとに異なる値になること(ソルトが
  効いていることの直接確認)。
- `hashPassword`の出力が、既知の平文の単純SHA-256ダイジェストと一致しないこと(今回の
  脆弱性そのものの再現防止)。
- `verifyPassword`が正しいパスワードを受理し、誤ったパスワードを拒否すること、また
  独立に生成した(ソルトが異なる)2つのハッシュがどちらも同じ平文で検証に通ること。
- 旧SHA-256値や不正な文字列を`verifyPassword`に渡しても例外を投げず`false`を返すこと。

既存の`/api/login`・`/api/admin/login`のルートテストは`hashPassword`/`verifyPassword`
経由の実データで動作するため、変更後も「正しい認証情報でログインできる」ことを
そのまま検証しており、追加の書き換えは不要だった。

## 学んだこと

- パスワード保存には、SHA-256/MD5のような「高速であること」自体が長所の汎用ダイジェスト
  関数を使うべきではない。パスワード保存が必要とするのは正反対の性質(意図的に低速・
  メモリコストが高い)であり、`bcrypt`/`scrypt`/`argon2`のような専用の適応的KDFを使う、
  という原則をコード上で確認する。
- 「同じ平文パスワードを持つ2人のユーザーが、同じ`password_hash`になるか?」は、使って
  いるハッシュ関数の種類によらずソルトの有無を機械的に判定できる観点として使える。
  レビュー時にまずこれを自問すると、アルゴリズム名(SHA-256かbcryptか等)を気にする前に
  ソルト漏れを見つけられる。
- ソルトなし等価ハッシュ(単純ハッシュを`=`で比較)からソルト付きハッシュへの移行は、
  ハッシュ関数の差し替えだけでは終わらない。「SQL/等価演算子で直接比較できる」という
  前提そのものが崩れるため、呼び出し側の照合ロジックを「値の比較」から「専用の検証
  関数を呼ぶ」形に構造ごと変える必要がある——関数のシグネチャだけ見て安全側に倒せた
  つもりにならないよう注意する。
- ハッシュの保存形式にアルゴリズム識別子・コストパラメータ・ソルトを自己記述的に
  含めておくと、将来コストパラメータ(反復回数やメモリコスト)を引き上げたくなった
  ときに、既存の保存済みハッシュを無効化せずに済む。パスワード用ハッシュの保存形式は
  最初から「将来のコスト引き上げ」を前提に設計しておくとよい。
- 秘密情報の比較(パスワードハッシュ、トークンなど)は、アプリケーション層でも
  `===`ではなく`timingSafeEqual`のような定数時間比較を使う。DB側の等価演算子に頼れなく
  なった今回のようなケースでは特に、比較ロジックを自前で書く際にタイミングサイド
  チャネルを作り込んでいないか意識する必要がある。
- 外部パッケージ(`bcrypt`/`argon2`)を追加する前に、`node:crypto`のような言語・ランタイム
  標準ライブラリが既に必要な機能(今回は`scryptSync`)を提供していないか確認する価値が
  ある。依存を増やさずに済み、このファイルが既に使っていた`randomBytes`/
  `timingSafeEqual`と一貫した実装にできた。

## 参考

- OWASP Top 10 2021: A02:2021 – Cryptographic Failures
- CWE-916: Use of Password Hash With Insufficient Computational Effort
- CWE-759: Use of a One-Way Hash without a Salt
