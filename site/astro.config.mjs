// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'static',
  adapter: vercel(),
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'pt-br'],
    prefixDefaultLocale: true,
    redirectToDefaultLocale: true,
  },
});
