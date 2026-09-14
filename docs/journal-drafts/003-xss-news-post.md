---
title: "お知らせ投稿の本文がエスケープされずに出力されるStored XSS"
category: "Stored XSS / クロスサイトスクリプティング"
severity: "High" # 管理画面経由の投稿とはいえ、公開ページ(/news)を閲覧した全訪問者のブラウザで任意スクリプトが実行されるため
status: "fixed" # found -> root-caused -> fixed
target: "apps/vuln-lab"
area: "/admin/news (投稿), /news (公開表示)"
discovered_at: "2026-09-14"
fixed_at: "2026-09-14"
---

## 概要

`apps/vuln-lab`の管理画面お知らせ投稿フォームの本文欄にHTMLを投稿すると、公開ページ`/news`
（管理一覧`/admin/news`も同様）でエスケープなしのHTMLとしてそのまま出力されることを確認した。
`<script>alert(1)</script>`単体は`dangerouslySetInnerHTML`（=`innerHTML`相当の挿入）経由
ではHTML仕様上実行されないが、`<img src=x onerror=alert(1)>`のようなイベントハンドラ系の
ペイロードを投稿したところ`/news`表示時に実際に`alert`が発火し、任意スクリプト実行が可能な
Stored XSSであることを確認した。

## 発見方法

1. 管理画面のお知らせ投稿フォーム（`/admin/news`）の本文欄に`<script>alert(1)</script>`を
   投稿して公開ページ`/news`を表示したが、alertは発火しなかった（`dangerouslySetInnerHTML`
   =`innerHTML`経由で挿入された`<script>`要素はHTML仕様上実行されないため、これは想定通り）。
2. そこで`<img src=x onerror=alert(1)>`のようなイベントハンドラ系ペイロードで再投稿し、
   `/news`を表示したところ、実際にalertが発火することを確認した。

（ユーザー自身の言葉: 「最初に管理画面のお知らせ投稿フォームへ`<script>alert(1)</script>`を
投稿して/newsを表示したが、alertは発火しなかった（dangerouslySetInnerHTML=innerHTML経由で
挿入された<script>要素はHTML仕様上実行されないため、これは想定通り）。そこで
`<img src=x onerror=alert(1)>`のようなイベントハンドラ系ペイロードで再投稿し、/newsを表示
したところ、実際にalertが発火することを確認した」）

## 原因

`apps/vuln-lab/src/lib/format.ts:3-5`:

```ts
export function nl2br(text: string): string {
  return text.replace(/\n/g, "<br />");
}
```

`nl2br()`は改行を`<br />`に変換するためだけの関数で、その前段でHTMLエスケープ（`<`, `>`,
`&`などの置換）を一切行っていない。呼び出し側はこの関数の戻り値をそのまま信頼できるHTML
として扱っている。

その戻り値は、公開一覧ページ`apps/vuln-lab/src/app/news/page.tsx:18-22`で
`dangerouslySetInnerHTML`に直接渡されている:

```tsx
<div
  className="mt-2 text-neutral-700"
  // biome-ignore lint/security/noDangerouslySetInnerHtml: renders admin-authored line breaks as-is (no output escaping)
  dangerouslySetInnerHTML={{ __html: nl2br(post.body) }}
/>
```

（同一パターンが管理画面側の一覧表示`apps/vuln-lab/src/app/admin/news/page.tsx:40-44`にも
存在する。）

投稿本文（`post.body`）は`apps/vuln-lab/src/app/api/admin/news/route.ts:13-20`でフォーム入力
を無加工のままSQLiteに保存しており、保存時にもサニタイズは行われていない:

```ts
const title = String(form.get("title") ?? "");
const body = String(form.get("body") ?? "");

db.prepare("INSERT INTO news (title, body, created_at) VALUES (?, ?, ?)").run(
  title,
  body,
  new Date().toISOString(),
);
```

つまり「保存時にもエスケープしない」→「表示時にもエスケープしない（`nl2br`はHTMLエスケープ
をしない）」→「`dangerouslySetInnerHTML`でReactのデフォルトの自動エスケープを明示的にバイパス
して出力する」という3段階すべてでノーガードになっており、投稿内容が`/news`のDOMに生のHTML
としてそのまま注入される。ただし`dangerouslySetInnerHTML`は`innerHTML`と同じ経路で挿入
されるため、`<script>`タグ単体はブラウザのHTML解析仕様上実行されない（`innerHTML`経由で
挿入された`<script>`要素はパース時に実行フラグが立たない）。実際にスクリプトが実行される
のは`<img src=x onerror=...>`や`<svg onload=...>`のような、タグ自体のパースと同時に発火
するイベントハンドラ属性を持つペイロードを投稿した場合であり、これによって管理画面が発行
するCookieや同一オリジン上の他の操作を、`/news`を閲覧した任意の訪問者のブラウザ上で奪取・
実行できてしまう。

## 修正

出力側（表示直前）でHTMLエスケープを行うようにした。`apps/vuln-lab/src/lib/format.ts`に、
既存の`nl2br()`はそのまま残しつつ、新しく`nl2brSafe()`を追加した:

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

`&`を最初に置換してから`<`, `>`, `"`, `'`を置換する順序にしている（先に`<`を`&lt;`に
変換してから`&`を置換すると、その`&`まで二重エスケープされてしまうため）。改行→`<br />`
変換(`nl2br`)は、エスケープ後のテキストに対して最後に適用する。エスケープの範囲を
このニュース投稿の表示専用関数に閉じ込め、既存の`nl2br()`本体は変更していない。

呼び出し側は2箇所とも`nl2br`から`nl2brSafe`に差し替えた:

- `apps/vuln-lab/src/app/news/page.tsx`（公開一覧ページ）
- `apps/vuln-lab/src/app/admin/news/page.tsx`（管理画面の一覧表示）

`dangerouslySetInnerHTML`自体は残している。理由は、この関数が生成するHTMLは
`&lt;`/`&gt;`等のエンティティと`<br />`タグだけであり、`<br />`は閉じタグ・属性を持たない
固定文字列で外部入力からは組み立てられないため、安全に構造化されたHTMLである
（Reactの子要素として`nl2br`の出力を素朴に分割・出力する方法もあるが、テキストノードと
`<br />`要素を交互に並べる処理を自前で書くことになり、`dangerouslySetInnerHTML`より複雑で
バグを持ち込みやすい）。

保存側（`apps/vuln-lab/src/app/api/admin/news/route.ts`のINSERT）と`nl2br()`本体は
意図的に変更していない。理由:

- 保存時にエスケープすると、DBに入っている値がすでにHTMLエンティティ化されたものになり、
  「DBの`body`列＝管理者が入力した生のテキスト」という前提が崩れる。将来、この値をHTML
  以外の文脈（メール本文、API応答のJSONなど）で再利用する際に二重エスケープや文脈違いの
  エスケープを引き起こしやすくなる。エスケープは常に出力先の文脈（今回はHTML）に応じて
  出力直前に行うのが定石であり、保存時サニタイズは根本対策にならない。
- `nl2br()`本体を変更しなかったのは、`apps/vuln-lab/CLAUDE.md`に列挙されている通り、この
  アプリには他にも意図的に未エスケープのまま残す表示箇所（お問い合わせ内容
  `admin/contacts/page.tsx`、予約メモ`mypage/reservations/[id]/page.tsx`）があり、それらは
  今回のfinding（お知らせ投稿）のスコープ外だから。`nl2br()`を直接エスケープ対応にすると、
  それらの意図的な脆弱性まで一緒に塞いでしまい、スコープ外の変更になる。

### 追加した回帰テスト

`apps/vuln-lab/src/lib/format.test.ts`の`nl2brSafe`に対するテストとして:

- 改行が`<br />`に変換されること（`nl2br`と同じ基本動作を保っていることの確認）。
- 実際にブラウザで発火することを確認した`<img src=x onerror=alert(1)>`ペイロードが
  `&lt;img src=x onerror=alert(1)&gt;`にエスケープされること（今回のfindingそのものの
  回帰テスト）。
- `<`, `>`, `&`, `"`, `'`を含む文字列が正しくエンティティ化されること。

既存の`nl2br`（未エスケープの方）に対するテストはそのまま残し、「意図的に未エスケープ」で
あることをコメントで明記している。これにより、今後だれかが誤って`nl2br()`本体を直接
エスケープ対応に変更してしまっても、そちらのテストが失敗して気づける。

## 学んだこと

- **サニタイズは出力直前・出力先の文脈単位で行う。** 今回のように「保存はそのまま、
  表示直前にHTMLエスケープ」という形にすると、DBの値は常に「生の入力」という単一の
  意味を保てる。保存時にエスケープしてしまうと、その値がどの文脈向けにエスケープ済みなのか
  ―HTML用なのかSQL用なのかログ用なのか―が曖昧になり、別の文脈で再利用したときに
  二重エスケープや効かないエスケープを生む。エスケープ関数は「何を安全にする関数か」を
  関数名に埋め込む（`nl2brSafe`のように）と、後から見て安全性の保証範囲が分かる。
- **`<script>`が発火しないことは安全の証明にならない。** `innerHTML`/
  `dangerouslySetInnerHTML`経由で挿入された`<script>`要素はブラウザの仕様上実行されない
  ため、`<script>alert(1)</script>`だけを試して「発火しなかった＝安全」と判断すると
  誤る。`onerror`/`onload`のようなイベントハンドラ属性、`javascript:`スキームのURL属性
  など、パース時点で発火する経路は複数あり、Stored/Reflected XSSの検証では最低でも
  イベントハンドラ系ペイロードまで試す必要がある。
- **`dangerouslySetInnerHTML`を見たら「何がその中身を保証しているか」を追う。** Reactが
  デフォルトで行うエスケープを明示的にオプトアウトするAPIなので、そのAPI呼び出し単体を
  見ても安全性は判断できない。安全である根拠（今回で言えば「エンティティ化済みテキストと
  固定の`<br />`だけで構成されている」）を、コード上のコメントとテストの両方に残しておく
  ことで、将来その関数やコンポーネントを触った人が安全性の前提を壊さずに変更できる。
- **同じ脆弱なパターン（未エスケープ→`dangerouslySetInnerHTML`）が複数箇所にあるとき、
  1件のfindingの修正で他の箇所まで巻き込まない。** 今回は`nl2br()`を直接直さず、新しい
  `nl2brSafe()`を切り出して該当2箇所だけ差し替えた。脆弱性が意図的に残されている学習用
  アプリでは特に、スコープを厳密に守ることで「直したつもりが別のfindingを潰してしまい、
  後で見つけられなくなる」事故を避けられる。

## 参考

- OWASP Top 10 2021: A03 Injection (XSSはInjectionのサブカテゴリとして分類)
- CWE-79: Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting')
