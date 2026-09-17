---
title: "お問い合わせ内容(message)がエスケープされずに管理画面に出力されるStored XSS"
category: "Stored XSS / クロスサイトスクリプティング"
severity: "Critical" # 未認証で誰でも投稿できる公開フォームが起点で、かつセッションCookieがHttpOnlyでないため管理者セッションの窃取(セッションハイジャック)まで直結するため
status: "fixed" # found -> root-caused -> fixed
target: "apps/vuln-lab"
area: "/contact (投稿), /admin/contacts (管理画面表示)"
discovered_at: "2026-09-17"
fixed_at: "2026-09-17"
---

## 概要

公開のお問い合わせフォーム(`/contact`)の「お問い合わせ内容」欄に
`<script>alert(document.cookie)</script>`を投稿し、管理者としてログインして
`/admin/contacts`を開いたところ、ページ読み込み時にalertが発火し、
`document.cookie`の中身(`member_session`・`admin_session`の値を含む)がそのまま
表示されることを確認した。同じフォームの「お名前」欄に同一ペイロードを投稿した場合は
HTMLエスケープされ安全に表示されたため、脆弱なのは`message`欄の表示経路に限定される。
さらにセッションCookie(`member_session`, `admin_session`)が`HttpOnly`属性なしで
発行されておりJSから読み取り可能なため、このXSSは画面改ざんに留まらず管理者セッションの
窃取(セッションハイジャック)に直結する。

## 発見方法

1. 公開の「お問い合わせ」フォーム(`/contact`)から、`message`(お問い合わせ内容)欄に
   `<script>alert(document.cookie)</script>`を入れてPOST `/contact`で送信した。
2. 管理者としてログイン(`admin@example.com` / `admin123`)し、`/admin/contacts`を開いた。
3. ページ読み込み時にalertが発火し、`document.cookie`の中身
   (`member_session=...`と`admin_session=...`が平文で含まれる)が表示されることを
   確認した。
4. 比較として、同じフォームの`name`(お名前)欄に同一ペイロードを入れて再送したところ、
   `/admin/contacts`上ではHTMLエスケープされて表示され、alertは発火しなかった
   (安全)。これにより、脆弱なのは`message`欄固有の表示経路であることを切り分けた。

(ユーザー自身の言葉: 「POST /contact(公開のお問い合わせフォーム)のmessage/body欄に
`<script>alert(document.cookie)</script>`を入れて送信し、admin@example.com/admin123で
ログインして/admin/contactsを開くと、ページ読み込み時にalertが発火し
document.cookieの中身(member_session・admin_sessionを含む)が平文で表示される。
name欄で同じペイロードを試した際はHTMLエスケープされており安全だった」)

## 原因

`apps/vuln-lab/src/app/admin/contacts/page.tsx:27-31`:

```tsx
<div
  className="mt-2 whitespace-pre-line text-neutral-700"
  // biome-ignore lint/security/noDangerouslySetInnerHtml: renders submitter-authored line breaks as-is (no output escaping)
  dangerouslySetInnerHTML={{ __html: nl2br(contact.message) }}
/>
```

同ファイルの`contact.name`/`contact.email`(24〜26行目)は`{contact.name}`のように
Reactの通常の子要素として出力されており、Reactのデフォルトの自動エスケープが効くため
安全(今回`name`欄のペイロードが無害化された理由)。一方`message`欄だけは
`dangerouslySetInnerHTML`でReactの自動エスケープを明示的にバイパスしており、その中身は
`apps/vuln-lab/src/lib/format.ts:3-5`の`nl2br()`:

```ts
export function nl2br(text: string): string {
  return text.replace(/\n/g, "<br />");
}
```

`nl2br()`は改行を`<br />`に変換するだけで、HTMLエスケープ(`<`, `>`, `&`などの置換)を
一切行わない。投稿元の`apps/vuln-lab/src/app/api/contact/route.ts:8-17`でも
`message`は無加工のままSQLiteに保存されており、保存時・表示時のどちらでもサニタイズが
行われていない:

```ts
const message = String(form.get("message") ?? "");
...
db.prepare("INSERT INTO contacts (name, email, message, created_at) VALUES (?, ?, ?, ?)").run(
  name,
  email,
  message,
  new Date().toISOString(),
);
```

このため、未認証の第三者が公開フォームから投稿した`message`が、エスケープなしの生HTML
として管理画面`/admin/contacts`のDOMにそのまま注入され、管理者のブラウザ上で任意の
スクリプトとして実行される。

これと組み合わさる形で、セッションCookieが`HttpOnly`なしで発行されていることも確認した。
発行箇所は3箇所とも同様のパターンで、いずれも`httpOnly`オプションを指定していない:

`apps/vuln-lab/src/app/api/admin/login/route.ts:38`:
```ts
response.cookies.set(ADMIN_COOKIE, token, { path: "/" });
```

`apps/vuln-lab/src/app/api/login/route.ts:41`:
```ts
response.cookies.set(MEMBER_COOKIE, token, { path: "/" });
```

`apps/vuln-lab/src/app/api/register/route.ts:26`:
```ts
response.cookies.set(MEMBER_COOKIE, token, { path: "/" });
```

Next.jsの`cookies().set()`は`httpOnly`を明示しない限り`false`がデフォルトのため、
これらのセッショントークンは`document.cookie`からJSで読み取り可能になっている。
本来XSSとは独立したCookieの設定ミスだが、`/admin/contacts`のStored XSSと組み合わさる
ことで、単なる画面改ざんではなく管理者セッショントークンの窃取(セッションハイジャック)
まで到達できてしまう点が今回のfindingの深刻度を上げている。

## 修正

出力側（表示直前）でHTMLエスケープするようにした。エスケープ関数自体は新規実装ではなく、
`docs/journal-drafts/003-xss-news-post.md`(お知らせ投稿のStored XSS)の修正で
`apps/vuln-lab/src/lib/format.ts`に既に追加済みだった`nl2brSafe()`をそのまま再利用している:

```ts
export function nl2brSafe(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return nl2br(escaped);
}
```

変更したのは呼び出し側1箇所だけ:

`apps/vuln-lab/src/app/admin/contacts/page.tsx`で、`message`の表示に使っていた
`nl2br(contact.message)`を`nl2brSafe(contact.message)`に差し替えた。あわせて
`biome-ignore`コメントも「エスケープなしでそのまま出力している」という趣旨から
「`nl2brSafe`で先にHTMLエスケープ済みなので、実際に生成される要素は`<br />`だけ」という
安全性の根拠を説明する内容に更新した。`dangerouslySetInnerHTML`自体は残している。理由は
003のときと同じで、`nl2brSafe`の出力はHTMLエンティティと固定文字列`<br />`だけで構成される
安全な文字列であり、これをReact側で改めてテキストノードと`<br />`要素に分割して組み立て直す
自前実装は`dangerouslySetInnerHTML`より複雑でバグを持ち込みやすいため。

新しいエスケープ関数を書かず既存の`nl2brSafe`を再利用した理由は、003で一度「HTML出力直前に
エスケープする」という同じ設計判断を下した箇所が増えただけで、判断のロジック自体は
変わらないため。エスケープ関数を複数用意すると、実装ごとに微妙な差異(エスケープする文字の
順序・対象)が生まれて監査すべき箇所が増えるだけで、メリットがない。

保存側(`apps/vuln-lab/src/app/api/contact/route.ts`のINSERT)と`nl2br()`本体は今回も
意図的に変更していない。理由は003のときと同一で、(1)保存時サニタイズは「DBの値=入力の
生テキスト」という前提を崩し、出力先の文脈に依らない根本対策にならない、(2)`nl2br()`本体を
直接エスケープ対応にすると、`apps/vuln-lab/CLAUDE.md`に列挙されている他の意図的に
未エスケープのまま残す表示箇所(予約メモ `mypage/reservations/[id]/page.tsx`)まで
一緒に塞いでしまい、このfindingのスコープを超えるため。

原因調査で見つけたセッションCookieの`HttpOnly`欠如(`admin_session`/`member_session`)は、
このXSSの被害を「画面改ざん」から「セッション窃取」まで広げる compounding factor では
あるが、`apps/vuln-lab/CLAUDE.md`が挙げる別カテゴリ(認証/セッションの取り扱い)の
インテンショナルな脆弱性であり、本findingの直接の原因ではないため、今回のスコープには
含めず変更していない。

### 追加した回帰テスト

新規に`apps/vuln-lab/src/app/admin/contacts/page.test.tsx`を追加し、
`AdminContactsPage`を直接レンダリングして検証している:

- 実際に発火を確認した`<img src=x onerror=alert(document.cookie)>`ペイロードを含む
  お問い合わせを登録し、ページをレンダリングした結果、DOM上に生きた`<img onerror>`要素が
  存在しないこと(`container.querySelector("img[onerror]")`が`null`)、かつペイロードが
  無害なテキストとして画面に表示されること(`container.textContent`にエスケープ前の文字列が
  含まれる)を確認する、このfindingそのものの回帰テスト。
- 通常のメッセージで改行が`<br />`に変換される既存動作が壊れていないことを確認するテスト。

`apps/vuln-lab/src/lib/format.ts`の`nl2brSafe`自体に対する単体テスト
(`onerror`ペイロードのエスケープ、改行変換、`<`/`>`/`&`/引用符のエンティティ化)は
003の修正時にすでに`apps/vuln-lab/src/lib/format.test.ts`に追加済みで、今回は変更していない
(このfindingで書き換えたのは呼び出し側だけで、`nl2brSafe`自体のロジックは触っていないため)。

## 学んだこと

- **同じ根本原因(未エスケープの`dangerouslySetInnerHTML`)が複数の表示箇所に散らばっている
  場合、1件目のfinding修正時に「その文脈向けの安全なエスケープ関数」を用意しておくと、
  2件目以降の同種findingは新しいロジックを書かずに済み、レビューコストも下がる。**
  実際、今回の修正は`nl2br`→`nl2brSafe`への1行の呼び出し変更で完了しており、003で
  「出力直前にエスケープする」という設計判断を確定させておいたことの効果が出ている。
  裏を返せば、`nl2br()`の直接の呼び出し箇所は`grep`一発で全て洗い出せるので、脆弱性を
  1件直したら「同じ関数を使っている他の呼び出し箇所」を必ず確認する価値がある
  (ただし、それらが別findingとして意図的に温存されている場合は、直さずに記録だけ残す)。
- **「このXSSは何と組み合わさると被害が広がるか」を原因調査の時点で書き残しておくと、
  修正時のスコープ判断がぶれない。** 今回はHttpOnly欠如という別カテゴリの弱点が
  severityを押し上げる要因だったが、それは「このXSSの直接の原因」ではなく「別の独立した
  設定不備」なので、このfindingの修正では触らないという判断がしやすかった。原因と
  compounding factorを分けて記録しておくことで、1件のfindingを直すときに隣接する別の
  脆弱性まで無自覚に巻き込んでしまう(あるいは逆に、直すべきスコープを見誤って狭めすぎる)
  事故を防げる。
- **エスケープ関数を新設・再利用する際は、`biome-ignore`のような「なぜ安全か」を説明する
  コメントも一緒に更新する。** `dangerouslySetInnerHTML`はコード上どこでも同じ見た目を
  しているため、その安全性根拠(何がエスケープ済みで、生成されるHTMLがどこまで固定か)は
  呼び出し箇所ごとにコメントとテストの両方で明示しておかないと、後から見た人(自分自身も
  含む)が「これは003で直した安全な呼び出しなのか、まだ未対応の呼び出しなのか」を
  コードだけから区別できなくなる。

## 参考

- OWASP Top 10 2021: A03 Injection (XSSはInjectionのサブカテゴリとして分類)
- CWE-79: Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting')
- CWE-1004: Sensitive Cookie Without 'HttpOnly' Flag
