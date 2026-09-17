---
title: "5つのPOSTエンドポイントが例外オブジェクトをString(err)でそのままクライアントに返し、内部エラー詳細を開示している"
category: "セキュリティ設定不備 / 内部エラー情報の開示 (Verbose Error Messages)"
severity: "Medium" # 認証バイパスやデータ漏えいには直結しないが、5エンドポイント共通で例外種別を問わず内部の実装詳細(クラス名・ランタイム検証文言、将来的にはDBのクエリ文やカラム名なども)が無条件に外部へ出る構造的な情報開示であるため Medium。
status: "fixed" # found -> fixed
target: "apps/vuln-lab"
area: "POST /api/contact, POST /api/reservations, POST /api/admin/news, POST /api/admin/login, POST /api/login (全5エンドポイントの例外ハンドリング)"
discovered_at: "2026-09-16"
fixed_at: "2026-09-16"
---

## 概要

`apps/vuln-lab`の状態変更用POSTエンドポイント5つ(`/api/contact`、`/api/reservations`、
`/api/admin/news`、`/api/admin/login`、`/api/login`)すべてが、トップレベルの`catch`で捕捉した
例外オブジェクトを`String(err)`としてそのまま`{ error: String(err) }`の形でクライアントに
返す同一の実装パターンを共有している。`Content-Type`にJSONを指定して`/api/contact`へPOSTする
だけで、`request.formData()`内部のパース処理が投げた`TypeError`のメッセージ(例外クラス名・
Node/Fetch API内部の検証文言)がそのままレスポンスボディに含まれることを確認した。

## 発見方法

curlのみで確認(ユーザーからの報告内容そのまま)。

1. フォームデータではなくJSONボディで`/api/contact`へPOSTする。
   ```bash
   curl -s -i -X POST http://localhost:3100/api/contact \
     -H "Content-Type: application/json" \
     -d '{"foo":"bar"}'
   ```
2. レスポンスとして`500 Internal Server Error`とともに、次のJSONが返ることを確認した。
   ```
   HTTP/1.1 500 Internal Server Error
   content-type: application/json

   {"error":"TypeError: Content-Type was not one of \"multipart/form-data\" or \"application/x-www-form-urlencoded\"."}
   ```
   `request.formData()`が投げた`TypeError`のメッセージ(例外クラス名+Node/Fetch API内部の
   検証文言)が、加工されずにそのままクライアントへ開示されている。

## 原因

5つのエンドポイントすべてで、`try`ブロック内の処理(`request.formData()`によるボディパース、
DBへの`INSERT`など)が投げた例外を、加工せず`String(err)`としてそのままJSONレスポンスに
含めて返している。該当箇所は次のとおり(いずれも同一パターン)。

`apps/vuln-lab/src/app/api/contact/route.ts:19-23`(今回のPoCで実際に踏んだ箇所。
`request.formData()`は`6`行目):
```ts
  } catch (err) {
    // Surfaces the raw error to the client — handy while building, not so handy in
    // production. See apps/vuln-lab/CLAUDE.md.
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
```

`apps/vuln-lab/src/app/api/reservations/route.ts:55-57`:
```ts
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
```

`apps/vuln-lab/src/app/api/admin/news/route.ts:23-25`:
```ts
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
```

`apps/vuln-lab/src/app/api/admin/login/route.ts:39-41`:
```ts
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
```

`apps/vuln-lab/src/app/api/login/route.ts:42-44`:
```ts
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
```

いずれの`catch`にも、例外の種類を判別したり、クライアント向けメッセージと内部ログ向け詳細を
切り分けたりする処理が一切なく、`try`ブロック内で発生し得るあらゆる例外(今回確認した
`request.formData()`のNode/Fetch API内部の`TypeError`に限らず、`db.prepare(...).run(...)`が
投げるSQLiteのクエリ・カラム名を含みうるエラーなども含む)が無条件に`String(err)`を経由して
クライアントへ渡る構造になっている。本番運用であれば汎用的なエラーメッセージに隠し、詳細は
サーバー側のログにのみ残すべきところ、例外オブジェクトの文字列表現(クラス名・ランタイム
内部の検証文言、場合によってはより機密度の高い内部情報)がそのまま外部に出ている。

## 修正

5つのエンドポイントが共有していた「`catch (err)`→`String(err)`をそのままJSONで返す」処理を、
新設した`apps/vuln-lab/src/lib/http-errors.ts`の`internalErrorResponse(err)`という1つの共通
関数に置き換えた。この関数は例外オブジェクトをサーバー側で`console.error(err)`によりログに
残したうえで、クライアントには例外の種類によらず常に固定の`{ error: "Internal Server Error" }`
(ステータス500)を返す。5つの`route.ts`はいずれも`catch`節を次のように変更しただけで、
`try`ブロック内の処理(フォームパース・DB操作など)には手を入れていない。

```ts
  } catch (err) {
    return internalErrorResponse(err);
  }
```

対応候補として、(1) 各`route.ts`の`catch`節を個別に「固定メッセージを返す」形へ書き換える、
(2) 本ヘルパー関数を1つ新設して5箇所から呼び出す、の2つを検討し、(2)を採用した。理由:

- **5エンドポイント共通の同一パターンだったため、修正自体も1箇所に集約できる。** 原因調査の
  時点で5つの`catch`節が完全に同じ実装(`return NextResponse.json({ error: String(err) }, {
  status: 500 })`)であることが分かっており、個別に書き換えると同じロジック(固定メッセージ・
  ステータス500・サーバー側ログ)を5回重複させることになる。共通関数に切り出せば、今後
  新しいPOSTエンドポイントを追加したときも同じ関数を呼ぶだけで同種の情報開示を防げる。
- **サーバー側のログ出力を確実に残せる。** 単に固定メッセージを返すだけでは、本番相当の
  運用で例外の中身が完全に失われ、デバッグができなくなる。`internalErrorResponse`内に
  `console.error(err)`を1箇所にまとめておくことで、「クライアントには出さないが、サーバー
  側には必ず残す」という方針を関数の実装として固定でき、呼び出し側の`route.ts`がログ出力を
  書き忘れる余地もなくす。

`try`ブロック内のロジック(バリデーション追加、エラー種別ごとのステータスコード出し分けなど)
は本findingのスコープ外と判断し、変更していない。あくまで「捕捉した例外をクライアントへ
どう返すか」という開示面のみを直している。

### 追加した回帰テスト

`apps/vuln-lab/src/app/api/contact/route.test.ts`に、journal本文に記載したPoCそのものを
再現するテストケースを追加した(`console.error`はテスト出力を汚さないよう`vi.spyOn`で
モックしつつ、呼び出されたことはアサーションで確認する):

1. **PoCの再現(本findingの回帰確認)** — JSONボディを`/api/contact`にPOSTして
   `request.formData()`に`TypeError`を投げさせ、レスポンスが`{ error: "Internal Server
   Error" }`固定文言であり、例外のクラス名(`TypeError`)やランタイム内部の検証文言
   (`multipart/form-data`)がレスポンスボディに含まれないことを確認する。あわせて、
   例外オブジェクト自体は`console.error`に渡されており、サーバー側のデバッグ情報が
   失われていないことも確認する。
2. **通常のフォーム送信が従来通り成功すること** — 正しい`FormData`でPOSTした場合は
   従来通り`303`で`/contact?sent=1`にリダイレクトされることを確認し、エラーハンドリングの
   変更が正常系を壊していないことを確認する。

`internalErrorResponse`自体は`NextResponse.json`と`console.error`という薄いラッパーであり、
5エンドポイントすべてがこの1つの関数を経由する構造上、上記のPoC相当のテストを(実際に
再現できた)`/api/contact`側に1本置けば、共通関数側の実装ミス(固定メッセージを返さない、
ログを取らない等)は検知できる。残り4エンドポイント(`/api/reservations`、`/api/admin/news`、
`/api/admin/login`、`/api/login`)は、`internalErrorResponse`を同一パターンで呼び出している
ことをコードレビューで確認済みで、個別に同じPoCテストを重複して追加することはしていない。

## 学んだこと

- **同一の実装パターンが複数箇所にコピーされているfindingは、修正も1箇所に集約するのが
  正しいスコープの取り方。** 5つのエンドポイントが「捕捉した例外をそのまま返す」という
  全く同じミスを共有していたのは偶然ではなく、同じ雛形からコピーされた結果だと考えられる。
  各`route.ts`を個別に直すと、次に同じ雛形で新しいエンドポイントが増えたときにまた同じ
  問題が再発しやすい。共通ヘルパーに切り出しておけば、新規エンドポイントも「そのヘルパーを
  呼ぶ」という1つの正しいパターンに自然に乗りやすくなる。
- **エラーハンドリングの修正は「クライアントに何を返すか」と「サーバー側で何を残すか」を
  必ずセットで設計する必要がある。** 単に`String(err)`を消して固定メッセージにするだけの
  修正は情報開示は防げても、本番相当の運用でデバッグ手段を失わせてしまう。今回のように
  「クライアントには固定文言、サーバーには`console.error`でフル情報」という非対称な扱いを
  1つの関数の中に閉じ込めておくと、両方の要件を呼び出し側が意識せずに満たせる。
- **「例外の文字列表現をそのまま返さない」という防御は、特定の例外クラスや特定のエンドポイント
  に限定せず、`catch`が届きうるあらゆる例外に対して構造的に効かせる必要がある。** 今回PoCで
  実際に踏んだのは`request.formData()`が投げる`TypeError`だが、原因調査時点で同じ`catch`には
  `db.prepare(...).run(...)`が投げうるSQLiteのエラー(クエリ文やカラム名を含みうる)も
  流れ込む構造になっていた。個々の例外の中身を判別してフィルタするのではなく、「`catch`に
  届いた例外はクライアントには一切文字列化して返さない」という一律のルールにしたことで、
  今回確認できていない別の例外経路についても同じ防御が及ぶ。
- **回帰テストは実際に踏んだPoCをそのままテストケース化するのが最も再現性が高い。** 「JSON
  ボディを`/api/contact`に送るとフォームパースが例外を投げる」というPoCの手順をほぼそのまま
  `Request`オブジェクトの生成に落とし込むだけでテストになり、`String(err)`に戻す将来の
  リグレッションを確実に検知できる。あわせて正常系(通常のフォーム送信)も1ケース追加して
  おくことで、エラーハンドリングの変更が本来のリクエスト処理フローを壊していないことも
  同時に保証できる。

## 参考

- OWASP Top 10 2021: A05:2021 – Security Misconfiguration
- CWE-209: Generation of Error Message Containing Sensitive Information
</content>
