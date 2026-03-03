import en from './en';
import ptBr from './pt-br';

const translations = { en, 'pt-br': ptBr } as const;

export type Locale = keyof typeof translations;
export type TranslationKeys = keyof typeof en;

export function getLangFromUrl(url: URL): Locale {
  const [, lang] = url.pathname.split('/');
  if (lang === 'pt-br') return 'pt-br';
  return 'en';
}

export function useTranslations(lang: Locale) {
  return translations[lang];
}
