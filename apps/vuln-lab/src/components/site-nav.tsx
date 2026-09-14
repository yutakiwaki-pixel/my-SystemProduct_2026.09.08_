import Link from "next/link";

const links = [
  { href: "/", label: "トップ" },
  { href: "/services", label: "メニュー" },
  { href: "/store", label: "店舗情報" },
  { href: "/news", label: "お知らせ" },
  { href: "/contact", label: "お問い合わせ" },
  { href: "/mypage", label: "マイページ" },
];

export function SiteNav() {
  return (
    <header className="border-b border-neutral-200">
      <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <Link href="/" className="text-lg font-bold">
          カフェ・ソライロ
        </Link>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
