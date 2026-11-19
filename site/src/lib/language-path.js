// The target of the header's language link: the same page in the other language. Pure, and tested
// in test/site-header.test.mjs.
const OTHER = { en: 'pt-br', 'pt-br': 'en' };

// `pathname` is the path of the page (with or without a trailing slash) and `lang` its language.
// The language segment at the start of the path is swapped for the other language; a path without
// one is read as a path in `lang`, and the other language is written in front of it.
export function switchLanguagePath(pathname, lang) {
  const to = OTHER[lang];
  const m = /^\/(en|pt-br)(?=\/|$)/.exec(pathname);
  if (m) return `/${to}${pathname.slice(m[0].length)}`;
  return `/${to}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
}
